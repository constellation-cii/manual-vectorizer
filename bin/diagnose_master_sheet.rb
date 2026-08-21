#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "sequel"

require_relative "../lib/manual_vectorizer/database"
require_relative "../lib/manual_vectorizer/models"
require_relative "../lib/manual_vectorizer/sheet_definition"

ManualVectorizer::Database.connect!
Sequel::Model.db = ManualVectorizer::Database.connect!

db = Sequel::Model.db
master = db[:vector_sheets].where(is_master: true).order(Sequel.desc(:id)).first
raise "no master row" unless master

raw = db.fetch(
  "SELECT id, json_typeof(definition) AS jtype, " \
  "json_array_length(definition->'vectors') AS vec_len, " \
  "json_array_length(definition->'types') AS type_len, " \
  "length(definition::text) AS def_bytes FROM vector_sheets WHERE id = ?",
  master[:id]
).first

puts "RAW id=#{raw[:id]} jtype=#{raw[:jtype]} vec_len=#{raw[:vec_len]} type_len=#{raw[:type_len]} bytes=#{raw[:def_bytes]}"

model = ManualVectorizer::VectorSheet[master[:id]]
defn = model.definition
puts "MODEL vectors=#{(defn['vectors'] || []).size} types=#{(defn['types'] || []).size} class=#{defn.class}"

catalog = ManualVectorizer::SheetDefinition.to_catalog(defn)
puts "CATALOG skills=#{catalog['skills']&.size} types=#{catalog['types']&.size}"

admin = ManualVectorizer::User.find(role: "admin")
if admin
  ws = ManualVectorizer::UserWorkspace.find(user_id: admin.id)
  puts "ADMIN active_sheet_id=#{ws&.active_sheet_id} email=#{admin.email}"
  if ws&.active_sheet_id
    active = ManualVectorizer::VectorSheet[ws.active_sheet_id]
    puts "ADMIN active name=#{active&.name} is_master=#{active&.is_master} vectors=#{(active&.definition&.dig('vectors') || []).size}"
  end
end
