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

      result = ensure_admin!
      if result[:created]
        puts "Created admin user #{result[:email]}"
      elsif result[:ok]
        puts "Admin user already exists (#{result[:email]})"
      else
        warn "Admin bootstrap skipped: #{result[:error]}"
      end

    end

    # Boot-time only: create the first admin account. Never overwrite passwords.
    def ensure_admin!
      email = ENV.fetch("ADMIN_EMAIL", "admin@example.com").to_s.strip.downcase
      password = ENV.fetch("ADMIN_PASSWORD", "changeme-admin").to_s.strip

      return { ok: false, error: "Email is required" } if email.empty?
      return { ok: false, error: "Password is required" } if password.empty?
      return { ok: false, error: "Password must be at least 8 characters" } if password.length < 8

      if User.find(email: email)
        return { ok: true, email: email, created: false }
      end

      existing_admin = User.where(role: "admin").first
      if existing_admin
        return { ok: true, email: existing_admin.email, created: false }
      end

      user = User.create_account!(email: email, password: password, role: "admin")
      WorkspaceService.provision_user!(user)
      { ok: true, email: email, created: true }
    end

    # Recovery only: explicit password reset via bootstrap URL (?password= required).
    def reset_admin_credentials!(password:, email: nil)
      email = (email || ENV["ADMIN_EMAIL"] || "admin@example.com").to_s.strip.downcase
      password = password.to_s.strip

      return { ok: false, error: "Email is required" } if email.empty?
      return { ok: false, error: "Password is required" } if password.empty?
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
      { ok: true, email: email, auth_ok: auth_ok }
    end

  end
end
