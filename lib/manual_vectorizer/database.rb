# frozen_string_literal: true

require "sequel"
require "fileutils"

module ManualVectorizer
  module Database
    MIGRATIONS_DIR = File.expand_path("../../db/migrations", __dir__)

    module_function

    def connect
      @db ||= begin
        url = database_url
        db = Sequel.connect(url)
        db.extension :pg_json if url.start_with?("postgres")
        db
      end
    end

    def database_url
      ENV.fetch("DATABASE_URL") do
        if ENV["RACK_ENV"] == "production"
          raise "DATABASE_URL is required in production"
        end

        root = File.expand_path("../..", __dir__)
        FileUtils.mkdir_p(File.join(root, "data"))
        "sqlite://#{File.join(root, 'data', 'manual_vectorizer.db')}"
      end
    end

    def migrate!
      Sequel.extension :migration
      db = connect
      Sequel::Migrator.run(db, MIGRATIONS_DIR)
    end
  end
end
