#!/usr/bin/env ruby
# frozen_string_literal: true

# One-off: load catalog.json and INSERT master sheet via raw SQL (Sequel model save is unreliable for large JSON).

require "json"
require "sequel"

require_relative "../lib/manual_vectorizer/sheet_definition"

def main
  db = Sequel.connect(ENV.fetch("DATABASE_URL"))
  catalog_path = File.expand_path("../data/catalog.json", __dir__)
  catalog = JSON.parse(File.read(catalog_path, encoding: "UTF-8"))
  raise "catalog has no skills" if (catalog["skills"] || []).empty?

  defn = ManualVectorizer::SheetDefinition.from_catalog(
    catalog,
    name: "Type Grid Master",
    description: "Canonical type grid sheet"
  )
  ManualVectorizer::SheetDefinition.compute_hashes!(defn)
  vectors = (defn["vectors"] || []).size
  types = (defn["types"] || []).size
  raise "definition empty after build" if vectors < 1

  fingerprint = ManualVectorizer::SheetDefinition.fingerprint(defn)
  json = JSON.generate(defn).gsub("'", "''")

  db.transaction do
    db.run("DELETE FROM vector_sheets WHERE is_master = true")
    db.run(<<~SQL)
      INSERT INTO vector_sheets
        (owner_id, name, slug, description, definition, definition_version, content_fingerprint, is_master, created_at, updated_at)
      VALUES
        (NULL, 'Type Grid Master', 'master', 'Canonical master sheet', '#{json}'::json, '2.0', '#{fingerprint}', true, NOW(), NOW())
    SQL
    master_id = db.fetch("SELECT id FROM vector_sheets WHERE is_master = true ORDER BY id DESC LIMIT 1").first[:id]
    db.run(<<~SQL)
      UPDATE user_workspaces
      SET active_sheet_id = #{master_id.to_i}
      WHERE active_sheet_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM vector_sheets vs WHERE vs.id = user_workspaces.active_sheet_id)
    SQL
    puts "DB_OK master_id=#{master_id} vectors=#{vectors} types=#{types}"
  end
end

main if $PROGRAM_NAME == __FILE__
