# frozen_string_literal: true

Sequel.migration do
  change do
    create_table(:users) do
      primary_key :id
      String :email, null: false, unique: true
      String :password_digest, null: false
      String :role, null: false, default: "user"
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end

    create_table(:invite_codes) do
      primary_key :id
      String :code, null: false, unique: true
      foreign_key :created_by_id, :users, null: false, on_delete: :cascade
      foreign_key :used_by_id, :users, on_delete: :set_null
      DateTime :used_at
      DateTime :expires_at
      DateTime :created_at, null: false
    end

    create_table(:catalog_snapshots) do
      primary_key :id
      String :label, null: false, default: "default"
      column :data, :json, null: false
      TrueClass :active, null: false, default: false
      DateTime :created_at, null: false
    end

    create_table(:user_states) do
      primary_key :id
      foreign_key :user_id, :users, null: false, unique: true, on_delete: :cascade
      column :state, :json, null: false, default: "{}"
      DateTime :updated_at, null: false
    end

    create_index :invite_codes, :code, unique: true
    create_index :catalog_snapshots, :active
  end
end
