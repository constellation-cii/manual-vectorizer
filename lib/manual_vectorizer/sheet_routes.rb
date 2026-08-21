# frozen_string_literal: true

module ManualVectorizer
  module SheetRoutes
    def self.registered(app)
      app.helpers SheetRouteHelpers

      app.get "/api/workspace" do
        require_login!
        workspace = WorkspaceService.workspace_for(current_user)
        sheet = workspace.active_sheet || WorkspaceService.active_sheet_for(current_user)
        json_ok({
          active_sheet_id: sheet&.id,
          active_sheet_name: sheet&.name,
          draft_state: workspace.parsed_draft,
          is_master: sheet&.is_master
        })
      end

      app.put "/api/workspace/draft" do
        require_login!
        body = JSON.parse(request.body.read)
        WorkspaceService.save_draft!(current_user, body)
        json_ok({ ok: true })
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.post "/api/workspace/switch-sheet" do
        require_login!
        body = JSON.parse(request.body.read)
        sheet = WorkspaceService.switch_sheet!(current_user, body["sheet_id"])
        json_ok({ ok: true, sheet_id: sheet.id, sheet_name: sheet.name })
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      rescue Sequel::NoMatchingRow
        json_error("Sheet not found", status: 404)
      end

      app.get "/api/sheets" do
        require_login!
        sheets = VectorSheet.accessible_by(current_user).order(Sequel.desc(:updated_at)).all
        json_ok(sheets.map { |s| sheet_summary(s, current_user) })
      end

      app.post "/api/sheets" do
        require_login!
        body = JSON.parse(request.body.read)
        source = if body["fork_from_id"]
                   VectorSheet.accessible_by(current_user).first(id: body["fork_from_id"])
                 else
                   VectorSheet.master_sheet || WorkspaceService.ensure_master_sheet!
                 end
        halt 404, json_error("Source sheet not found", status: 404) unless source

        sheet = WorkspaceService.fork_sheet_for_user!(current_user, source, name: body["name"] || "New Sheet")
        json_ok(sheet_summary(sheet, current_user), status: 201)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.get "/api/sheets/:id" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet

        format = params[:format].to_s
        if format == "yaml"
          content_type "text/yaml"
          SheetDefinition.to_yaml(sheet.definition)
        else
          json_ok(sheet_payload(sheet, current_user))
        end
      end

      app.put "/api/sheets/:id" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet
        halt 403, json_error("Read-only sheet", status: 403) unless sheet.writable_by?(current_user)

        body = parse_sheet_body(request)
        definition = body["definition"] || body
        errors = SheetDefinition.validate(definition)
        halt 422, json_error(errors.join("; "), status: 422) unless errors.empty?

        sheet.update_definition!(definition, user: current_user, summary: params[:summary].to_s.presence || "Edited sheet")
        json_ok(sheet_payload(sheet, current_user))
      end

      app.post "/api/sheets/:id/validate" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet

        body = parse_sheet_body(request)
        definition = body["definition"] || body
        threshold = (params[:threshold] || SheetDefinition::DEFAULT_SIMILARITY_THRESHOLD).to_f
        json_ok({
          errors: SheetDefinition.validate(definition),
          duplicates: SheetDefinition.duplicate_report(definition),
          similar: SheetDefinition.similarity_report(definition, threshold: threshold)
        })
      end

      app.get "/api/sheets/:id/export" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet

        json_ok(SheetDefinition.build_bundle(sheet: sheet))
      end

      app.post "/api/sheets/import" do
        require_login!
        body = parse_sheet_body(request)
        definition = body["sheet"] ? body["sheet"]["definition"] || body["sheet"] : body
        definition = definition["definition"] if definition.is_a?(Hash) && definition["definition"].is_a?(Hash)
        errors = SheetDefinition.validate(definition)
        halt 422, json_error(errors.join("; "), status: 422) unless errors.empty?

        name = body.dig("sheet", "name") || definition.dig("meta", "name") || "Imported Sheet"
        sheet = VectorSheet.create(
          owner_id: current_user.id,
          name: name,
          slug: WorkspaceService.unique_slug(current_user.id, name),
          description: body.dig("sheet", "description").to_s,
          definition: SheetDefinition.compute_hashes!(definition),
          definition_version: SheetDefinition::VERSION,
          content_fingerprint: SheetDefinition.fingerprint(definition),
          is_master: false,
          created_at: Time.now,
          updated_at: Time.now
        )
        json_ok(sheet_payload(sheet, current_user), status: 201)
      end

      app.post "/api/sheets/:id/merge" do
        require_login!
        host_sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Host sheet not found", status: 404) unless host_sheet
        halt 403, json_error("Read-only sheet", status: 403) unless host_sheet.writable_by?(current_user)

        body = JSON.parse(request.body.read)
        guest_definition = body["guest_definition"]
        guest_definition ||= SheetDefinition.parse_input(body["guest_yaml"].to_s, format: "yaml") if body["guest_yaml"]
        halt 422, json_error("guest_definition required", status: 422) unless guest_definition.is_a?(Hash)

        result = SheetMerge.merge(
          host_sheet.definition,
          guest_definition,
          vector_map: body["vector_map"] || {},
          type_map: body["type_map"] || {},
          decisions: body["decisions"] || {}
        )
        if body["apply"]
          host_sheet.update_definition!(result["definition"], user: current_user, summary: "Merged sheet")
        end
        json_ok(result)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.post "/api/sheets/:id/import-ranking" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet

        body = JSON.parse(request.body.read)
        values = body["values"] || body.dig("ranking", "values") || {}
        guest_definition = body["guest_definition"]
        result = if guest_definition
                   RankingImport.preview(sheet.definition, guest_definition, values)
                 else
                   RankingImport.import(sheet.definition, values, decisions: body["decisions"] || {})
                 end
        json_ok(result)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.post "/api/admin/rebuild-master" do
        require_admin!
        master = WorkspaceService.rebuild_master_sheet!(force: true)
        json_ok({
          id: master.id,
          name: master.name,
          vectors: master.definition["vectors"]&.length,
          types: master.definition["types"]&.length
        })
      end

      app.post "/api/admin/master-sheet" do
        require_admin!
        body = parse_sheet_body(request)
        definition = body["definition"] || body
        errors = SheetDefinition.validate(definition)
        halt 422, json_error(errors.join("; "), status: 422) unless errors.empty?

        master = VectorSheet.master_sheet
        if master
          master.update_definition!(definition, user: current_user, summary: "Admin master update")
        else
          master = VectorSheet.create_master!(name: definition.dig("meta", "name") || "Type Grid Master", definition: definition)
        end
        json_ok(sheet_payload(master, current_user))
      end

      app.post "/api/admin/temples-sample" do
        require_admin!
        definition = SheetDefinition.temples_sample_definition
        sheet = VectorSheet.create(
          owner_id: current_user.id,
          name: "Temples Sample",
          slug: WorkspaceService.unique_slug(current_user.id, "temples-sample"),
          description: "Temple blindspot/focus vectors for merge testing",
          definition: definition,
          definition_version: SheetDefinition::VERSION,
          content_fingerprint: SheetDefinition.fingerprint(definition),
          is_master: false,
          created_at: Time.now,
          updated_at: Time.now
        )
        json_ok(sheet_payload(sheet, current_user), status: 201)
      end

      app.get "/api/logs" do
        require_login!
        logs = VectorLogEntry.visible_to(current_user).sort_by { |l| -l.created_at.to_i }
        json_ok(logs.map { |log| log_summary(log) })
      end

      app.post "/api/logs" do
        require_login!
        body = JSON.parse(request.body.read)
        sheet = WorkspaceService.active_sheet_for(current_user)
        ranking = body["ranking"] || {
          "mode" => body["mode"],
          "values" => body["values"],
          "weights" => body["weights"],
          "groupWeights" => body["groupWeights"]
        }
        fingerprint = SheetDefinition.ranking_hash(ranking)
        log = VectorLogEntry.create(
          user_id: current_user.id,
          sheet_id: sheet.id,
          speaker_name: body["speaker_name"].to_s,
          source_ref: body["source_ref"].to_s,
          sheet_snapshot: JSON.parse(JSON.generate(sheet.definition)),
          ranking: ranking,
          ranking_fingerprint: fingerprint,
          notes: body["notes"].to_s,
          created_at: Time.now,
          updated_at: Time.now
        )
        json_ok(log_summary(log), status: 201)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.get "/api/logs/:id" do
        require_login!
        log = VectorLogEntry.first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless log&.readable_by?(current_user)
        json_ok(log_detail(log))
      end

      app.post "/api/logs/:id/share" do
        require_login!
        log = VectorLogEntry.first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless log
        halt 403, json_error("Forbidden", status: 403) unless log.user_id == current_user.id || current_user.admin?

        body = JSON.parse(request.body.read)
        share = ResourceShare.share!(
          owner: current_user,
          resource_type: "log_entry",
          resource_id: log.id,
          email: body["email"]
        )
        json_ok({ ok: true, share_id: share.id })
      rescue ArgumentError => e
        json_error(e.message, status: 422)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.post "/api/sheets/:id/share" do
        require_login!
        sheet = VectorSheet.accessible_by(current_user).first(id: params[:id].to_i)
        halt 404, json_error("Not found", status: 404) unless sheet
        halt 403, json_error("Forbidden", status: 403) unless sheet.owner_id == current_user.id || current_user.admin?

        body = JSON.parse(request.body.read)
        share = ResourceShare.share!(
          owner: current_user,
          resource_type: "sheet",
          resource_id: sheet.id,
          email: body["email"]
        )
        json_ok({ ok: true, share_id: share.id })
      rescue ArgumentError => e
        json_error(e.message, status: 422)
      rescue JSON::ParserError
        json_error("Invalid JSON body")
      end

      app.get "/api/shared" do
        require_login!
        shares = ResourceShare.where(shared_with_user_id: current_user.id).order(Sequel.desc(:created_at)).all
        json_ok(shares.map { |share| share_payload(share) })
      end
    end

    module SheetRouteHelpers
      def parse_sheet_body(request)
        raw = request.body.read
        return JSON.parse(raw) if request.content_type.to_s.include?("json") || raw.lstrip.start_with?("{")

        { "definition" => SheetDefinition.parse_input(raw) }
      rescue JSON::ParserError
        { "definition" => SheetDefinition.parse_input(raw) }
      end

      def sheet_summary(sheet, user)
        {
          id: sheet.id,
          name: sheet.name,
          slug: sheet.slug,
          description: sheet.description,
          is_master: sheet.is_master,
          owner_id: sheet.owner_id,
          writable: sheet.writable_by?(user),
          updated_at: sheet.updated_at
        }
      end

      def sheet_payload(sheet, user)
        sheet_summary(sheet, user).merge(
          definition: sheet.definition,
          catalog: SheetDefinition.to_catalog(sheet.definition)
        )
      end

      def log_summary(log)
        {
          id: log.id,
          speaker_name: log.speaker_name,
          source_ref: log.source_ref,
          sheet_id: log.sheet_id,
          ranking_fingerprint: log.ranking_fingerprint,
          notes: log.notes,
          created_at: log.created_at,
          updated_at: log.updated_at
        }
      end

      def log_detail(log)
        log_summary(log).merge(
          ranking: log.ranking_data,
          sheet_snapshot: log.sheet_snapshot_data
        )
      end

      def share_payload(share)
        {
          id: share.id,
          resource_type: share.resource_type,
          resource_id: share.resource_id,
          owner_id: share.owner_id,
          permission: share.permission,
          created_at: share.created_at
        }
      end
    end
  end
end
