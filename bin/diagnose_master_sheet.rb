#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "sequel"

db = Sequel.connect(ENV.fetch("DATABASE_URL"))
db.extension :pg_json

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

defn_raw = master[:definition]
puts "ROW definition class=#{defn_raw.class} json_class=#{defn_raw.class.name}"

defn = case defn_raw
       when Hash then defn_raw
       when String then JSON.parse(defn_raw)
       else JSON.parse(defn_raw.to_s)
       end
puts "PARSED vectors=#{(defn['vectors'] || defn[:vectors] || []).size}"

admin = db[:users].where(role: "admin").first
if admin
  ws = db[:user_workspaces].where(user_id: admin[:id]).first
  puts "ADMIN active_sheet_id=#{ws&.dig(:active_sheet_id)} email=#{admin[:email]}"
  if ws && ws[:active_sheet_id]
    active = db[:vector_sheets].where(id: ws[:active_sheet_id]).first
    adef = active[:definition]
    ahash = adef.is_a?(Hash) ? adef : JSON.parse(adef.to_s)
    puts "ADMIN active name=#{active[:name]} is_master=#{active[:is_master]} vectors=#{(ahash['vectors'] || []).size}"
  end
end
