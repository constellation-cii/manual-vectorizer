# frozen_string_literal: true

require "securerandom"

module ManualVectorizer
  module WorkspaceService
    DEFAULT_DRAFT = UserState::DEFAULT_STATE

    module_function

    def provision_user!(user)
      master = VectorSheet.master_sheet
      raise "Master sheet not configured in database" unless master

      sheet = fork_sheet_for_user!(user, master, name: "#{master.name} (copy)")
      workspace = UserWorkspace.find_or_create(user_id: user.id) do |row|
        row.active_sheet_id = sheet.id
        row.draft_state = DEFAULT_DRAFT.dup
        row.updated_at = Time.now
      end
      workspace.update(active_sheet_id: sheet.id) unless workspace.active_sheet_id
      workspace
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
      sheet || VectorSheet.master_sheet
    end

    def active_catalog_for(user)
      sheet = active_sheet_for(user)
      raise "No active sheet" unless sheet

      ManualVectorizer::SheetDefinition.to_catalog(sheet.definition)
    end

    def switch_sheet!(user, sheet_id)
      sheet = VectorSheet.accessible_by(user).first(id: sheet_id)
      raise Sequel::NoMatchingRow unless sheet

      workspace = workspace_for(user)
      workspace.update(active_sheet_id: sheet.id, updated_at: Time.now)
      sheet
    end

    def delete_sheet!(user, sheet)
      raise Sequel::NoMatchingRow unless sheet.deletable_by?(user)

      master = VectorSheet.master_sheet
      sheet_id = sheet.id

      db = VectorSheet.db
      db.transaction do
        UserWorkspace.where(active_sheet_id: sheet_id).each do |workspace|
          replacement = VectorSheet.where(owner_id: workspace.user_id)
                                   .exclude(id: sheet_id)
                                   .order(Sequel.desc(:updated_at))
                                   .first
          replacement ||= master
          workspace.update(active_sheet_id: replacement&.id, updated_at: Time.now)
        end

        ResourceShare.where(resource_type: "sheet", resource_id: sheet_id).delete
        sheet.destroy
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
