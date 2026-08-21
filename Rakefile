# frozen_string_literal: true

require_relative "lib/manual_vectorizer/database"

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
