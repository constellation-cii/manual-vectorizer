# frozen_string_literal: true

require "json"
require "fileutils"

module ManualVectorizer
  module Seeds
    module_function

    def run!
      db = Database.connect
      Sequel::Model.db = db
      require_relative "models"

      bootstrap_admin!
      bootstrap_catalog!
    end

    def bootstrap_admin!
      email = ENV.fetch("ADMIN_EMAIL", "admin@example.com")
      password = ENV.fetch("ADMIN_PASSWORD", "changeme-admin")
      return if User.find(email: email.downcase)

      User.create_account!(email: email, password: password, role: "admin")
      puts "Created admin user #{email}"
    end

    def bootstrap_catalog!
      return if CatalogSnapshot.active_catalog

      path = File.expand_path("../../data/catalog.json", __dir__)
      unless File.exist?(path)
        warn "No data/catalog.json — skipping catalog seed"
        return
      end

      data = JSON.parse(File.read(path))
      CatalogSnapshot.publish!(data, label: "initial")
      puts "Seeded catalog from data/catalog.json"
    end
  end
end
