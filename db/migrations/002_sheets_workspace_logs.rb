# frozen_string_literal: true

Sequel.migration do
  change do
    create_table(:vector_sheets) do
      primary_key :id
      foreign_key :owner_id, :users, null: true, on_delete: :set_null
      String :name, null: false
      String :slug, null: false
      String :description, text: true, default: ""
      column :definition, :json, null: false, default: "{}"
      String :definition_version, null: false, default: "2.0"
      String :content_fingerprint, null: false, default: ""
      TrueClass :is_master, null: false, default: false
      foreign_key :forked_from_id, :vector_sheets, on_delete: :set_null
      Integer :forked_from_version
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index %i[owner_id slug], unique: true
      index :is_master
    end

    create_table(:user_workspaces) do
      primary_key :id
      foreign_key :user_id, :users, null: false, unique: true, on_delete: :cascade
      foreign_key :active_sheet_id, :vector_sheets, on_delete: :set_null
      column :draft_state, :json, null: false, default: "{}"
      DateTime :updated_at, null: false
    end

    create_table(:sheet_revisions) do
      primary_key :id
      foreign_key :sheet_id, :vector_sheets, null: false, on_delete: :cascade
      foreign_key :user_id, :users, null: false, on_delete: :cascade
      column :definition, :json, null: false
      String :change_summary, text: true, default: ""
      DateTime :created_at, null: false
      index :sheet_id
    end

    create_table(:vector_log_entries) do
      primary_key :id
      foreign_key :user_id, :users, null: false, on_delete: :cascade
      foreign_key :sheet_id, :vector_sheets, on_delete: :set_null
      String :speaker_name, null: false, default: ""
      String :source_ref, text: true, default: ""
      column :sheet_snapshot, :json
      column :ranking, :json, null: false, default: "{}"
      String :ranking_fingerprint, null: false, default: ""
      String :notes, text: true, default: ""
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index :user_id
      index :sheet_id
    end

    create_table(:resource_shares) do
      primary_key :id
      String :resource_type, null: false
      Integer :resource_id, null: false
      foreign_key :owner_id, :users, null: false, on_delete: :cascade
      foreign_key :shared_with_user_id, :users, on_delete: :cascade
      String :permission, null: false, default: "read"
      String :share_token
      DateTime :created_at, null: false
      index %i[resource_type resource_id]
      index :shared_with_user_id
      index :share_token, unique: true
    end
  end
end
