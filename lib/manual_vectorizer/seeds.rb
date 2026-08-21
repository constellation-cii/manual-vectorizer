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
      email = ENV.fetch("ADMIN_EMAIL", "admin@example.com").to_s.strip.downcase
      password = ENV.fetch("ADMIN_PASSWORD", "changeme-admin").to_s.strip
      return if email.empty? || password.empty?

      user = User.find(email: email)
      if user
        user.set_password!(password)
        user.update(role: "admin") unless user.admin?
        puts "Synced admin credentials for #{email}"
        return
      end

      existing_admin = User.where(role: "admin").first
      if existing_admin
        existing_admin.update(email: email)
        existing_admin.set_password!(password)
        puts "Updated admin account to #{email}"
        return
      end

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

      data = JSON.parse(File.read(path, encoding: "UTF-8"))
      CatalogSnapshot.publish!(data, label: "initial")
      puts "Seeded catalog from data/catalog.json"
    end
  end
end
