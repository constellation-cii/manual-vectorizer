# frozen_string_literal: true

require_relative "lib/manual_vectorizer/database"

task :environment do
  ManualVectorizer::Database.connect!
  Sequel::Model.db = ManualVectorizer::Database.connect!
  require_relative "lib/manual_vectorizer/json_column"
  require_relative "lib/manual_vectorizer/models"
  require_relative "lib/manual_vectorizer/sheet_definition"
  require_relative "lib/manual_vectorizer/workspace_service"
end

namespace :master do
  desc "Rebuild master vector sheet from catalog.json / catalog snapshot"
  task rebuild: :environment do
    master = ManualVectorizer::WorkspaceService.rebuild_master_sheet!(force: true)
    puts "Master sheet #{master.id}: #{master.definition['vectors'].length} vectors, #{master.definition['types'].length} types"
  end
end

namespace :db do
  desc "Run pending migrations"
  task migrate: :migrate_app

  desc "Run pending migrations (app task name avoids DO auto-release hook)"
  task :migrate_app do
    ManualVectorizer::Database.migrate!
    puts "Migrations complete."
  end

  desc "Seed catalog from data/catalog.json and bootstrap admin"
  task :seed do
    require_relative "lib/manual_vectorizer/seeds"
    ManualVectorizer::Seeds.run!
    puts "Seed complete."
  end
end

task setup: %i[db:migrate_app db:seed]
