# frozen_string_literal: true

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
        warn "Admin seed skipped: #{result[:error]}"
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
  end
end
