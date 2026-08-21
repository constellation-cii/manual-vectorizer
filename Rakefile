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

namespace :db do
  desc "Run pending migrations"
  task migrate: :migrate_app

  desc "Run pending migrations (app task name avoids DO auto-release hook)"
  task :migrate_app do
    ManualVectorizer::Database.migrate!
    puts "Migrations complete."
  end

  desc "Ensure admin user exists (no catalog or master sheet changes)"
  task :seed do
    require_relative "lib/manual_vectorizer/seeds"
    ManualVectorizer::Seeds.run!
    puts "Seed complete."
  end
end

task setup: %i[db:migrate_app db:seed]
