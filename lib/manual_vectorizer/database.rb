# frozen_string_literal: true

require "sequel"
require "fileutils"

module ManualVectorizer
  module Database
    MIGRATIONS_DIR = File.expand_path("../../db/migrations", __dir__)

    module_function

    def connected?
      !connect.nil?
    end

    def connect
      return @db if defined?(@db)

      url = database_url
      return @db = nil if url.nil? || url.empty?

      @db = Sequel.connect(url)
      @db.extension :pg_json if url.start_with?("postgres")
      @db
    end

    def connect!
      connect || raise("DATABASE_URL is not configured")
    end

    def database_url
      return ENV["DATABASE_URL"] if ENV["DATABASE_URL"] && !ENV["DATABASE_URL"].empty?

      return nil if ENV["RACK_ENV"] == "production"

      root = File.expand_path("../..", __dir__)
      FileUtils.mkdir_p(File.join(root, "data"))
      "sqlite://#{File.join(root, 'data', 'manual_vectorizer.db')}"
    end

    def migrate!
      Sequel.extension :migration
      db = connect!
      Sequel::Migrator.run(db, MIGRATIONS_DIR)
    end
  end
end
