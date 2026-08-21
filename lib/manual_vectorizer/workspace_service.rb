# frozen_string_literal: true

require "securerandom"

module ManualVectorizer
  module WorkspaceService
    DEFAULT_DRAFT = UserState::DEFAULT_STATE

    module_function

    def provision_user!(user)
      master = VectorSheet.master_sheet || ensure_master_sheet!
      sheet = fork_sheet_for_user!(user, master, name: "#{master.name} (copy)")
      workspace = UserWorkspace.find_or_create(user_id: user.id) do |row|
        row.active_sheet_id = sheet.id
        row.draft_state = DEFAULT_DRAFT.dup
        row.updated_at = Time.now
      end
      workspace.update(active_sheet_id: sheet.id) unless workspace.active_sheet_id
      workspace
    end

    def ensure_master_sheet!
      rebuild_master_sheet!
    end

    def rebuild_master_sheet!(force: false)
      catalog_data = load_catalog_source
      expected_vectors = catalog_data["skills"]&.length || 0
      expected_types = catalog_data["types"]&.length || 0
      existing = VectorSheet.master_sheet

      unless force
        if existing
          vectors = existing.definition["vectors"] || []
          types = existing.definition["types"] || []
          return existing if vectors.length >= [expected_vectors - 5, 100].max &&
                             types.length >= [expected_types - 5, 50].max
        end
      end

      existing&.delete

      definition = ManualVectorizer::SheetDefinition.from_catalog(
        catalog_data,
        name: "Type Grid Master",
        description: "Canonical type grid sheet"
      )
      master = VectorSheet.create_master!(
        name: definition.dig("meta", "name") || "Type Grid Master",
        definition: definition
      )
      vector_count = definition["vectors"]&.length || 0
      type_count = definition["types"]&.length || 0
      puts "Rebuilt master sheet (#{vector_count} vectors, #{type_count} types)"
      master
    end

    def load_catalog_source
      snap = CatalogSnapshot.active_catalog
      if snap
        data = snap.catalog_data
        return data if data["skills"]&.any?
      end

      path = File.expand_path("../../data/catalog.json", __dir__)
      JSON.parse(File.read(path, encoding: "UTF-8"))
    end

    def fork_sheet_for_user!(user, source_sheet, name: nil)
      definition = JSON.parse(JSON.generate(source_sheet.definition))
      ManualVectorizer::SheetDefinition.compute_hashes!(definition)
      definition["meta"] ||= {}
      definition["meta"]["name"] = name if name
      VectorSheet.create(
        owner_id: user.id,
        name: name || "#{source_sheet.name} (copy)",
        slug: unique_slug(user.id, name || source_sheet.slug),
        description: source_sheet.description,
        definition: definition,
        definition_version: ManualVectorizer::SheetDefinition::VERSION,
        content_fingerprint: ManualVectorizer::SheetDefinition.fingerprint(definition),
        is_master: false,
        forked_from_id: source_sheet.id,
        forked_from_version: 1,
        created_at: Time.now,
        updated_at: Time.now
      )
    end

    def unique_slug(owner_id, base)
      slug = base.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/^-|-$/, "")
      slug = "sheet" if slug.empty?
      candidate = slug
      n = 1
      while VectorSheet.where(owner_id: owner_id, slug: candidate).first
        candidate = "#{slug}-#{n}"
        n += 1
      end
      candidate
    end

    def workspace_for(user)
      row = UserWorkspace.find(user_id: user.id)
      provision_user!(user) unless row
      UserWorkspace.find(user_id: user.id)
    end

    def active_sheet_for(user)
      workspace = workspace_for(user)
      sheet = workspace.active_sheet
      sheet || VectorSheet.master_sheet || ensure_master_sheet!
    end

    def active_catalog_for(user)
      sheet = active_sheet_for(user)
      ManualVectorizer::SheetDefinition.to_catalog(sheet.definition)
    end

    def switch_sheet!(user, sheet_id)
      sheet = VectorSheet.accessible_by(user).first(id: sheet_id)
      raise Sequel::NoMatchingRow unless sheet

      workspace = workspace_for(user)
      workspace.update(active_sheet_id: sheet.id, updated_at: Time.now)
      sheet
    end

    def migrate_legacy_users!
      WorkspaceService.rebuild_master_sheet!
      User.each do |user|
        next if UserWorkspace.find(user_id: user.id)

        provision_user!(user)
        legacy = UserState.for_user(user)
        workspace = UserWorkspace.find(user_id: user.id)
        workspace.update(draft_state: legacy.parsed_state, updated_at: Time.now)
      rescue StandardError => e
        warn "User workspace migration skipped for user #{user.id}: #{e.message}"
      end
    end

    def save_draft!(user, state)
      workspace = workspace_for(user)
      workspace.update(draft_state: state, updated_at: Time.now)
    end

    def draft_state_for(user)
      workspace_for(user).parsed_draft
    end
  end
end
