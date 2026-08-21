# frozen_string_literal: true

require "json"

module ManualVectorizer
  module JsonColumn
    module_function

    # Sequel pg_json returns Sequel::Postgres::JSONHash, which is not a Ruby Hash
    # and whose #to_s is Ruby inspect syntax, not JSON. Always round-trip through JSON.
    def parse(value, default: {})
      return default if value.nil?
      return JSON.parse(value) if value.is_a?(String)

      JSON.parse(JSON.generate(value))
    rescue JSON::ParserError, TypeError
      default
    end

    def persist(db, value)
      normalized = parse(value)
      db.database_type == :postgres ? Sequel.pg_json(normalized) : normalized
    end
  end
end
