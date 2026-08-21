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

      result = bootstrap_admin!
      if result[:ok]
        puts "Synced admin credentials for #{result[:email]}"
      else
        warn "Admin bootstrap skipped: #{result[:error]}"
      end

      bootstrap_catalog!
    end

    def bootstrap_admin!(password: nil, email: nil)
      email = (email || ENV["ADMIN_EMAIL"] || "admin@example.com").to_s.strip.downcase
      password = password.to_s.strip unless password.nil?
      password = ENV["ADMIN_PASSWORD"].to_s.strip if password.nil? || password.empty?

      return { ok: false, error: "Email is required" } if email.empty?
      if password.empty?
        return {
          ok: false,
          error: "Password is required. Set ADMIN_PASSWORD in DigitalOcean or pass ?password= on the bootstrap URL."
        }
      end
      return { ok: false, error: "Password must be at least 8 characters" } if password.length < 8

      user = User.find(email: email)
      if user
        user.set_password!(password)
        user.update(role: "admin") unless user.admin?
      else
        existing_admin = User.where(role: "admin").first
        if existing_admin
          existing_admin.update(email: email)
          existing_admin.set_password!(password)
        else
          User.create_account!(email: email, password: password, role: "admin")
        end
      end

      auth_ok = !User.authenticate(email, password).nil?
      {
        ok: true,
        email: email,
        auth_ok: auth_ok,
        password_from: password.nil? ? "env" : "parameter"
      }
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
