# frozen_string_literal: true

require "bcrypt"
require "securerandom"
require "json"

module ManualVectorizer
  class User < Sequel::Model
    plugin :validation_helpers
    plugin :timestamps, update_on_create: true

    one_to_many :invite_codes_created, class: :InviteCode, key: :created_by_id
    one_to_one :user_state

    def validate
      super
      validates_presence %i[email password_digest role]
      validates_unique :email
      validates_includes %w[admin user], :role
    end

    def admin?
      role == "admin"
    end

    def self.authenticate(email, password)
      user = find(email: email.to_s.strip.downcase)
      return nil unless user
      return nil unless BCrypt::Password.new(user.password_digest) == password

      user
    end

    def self.create_account!(email:, password:, role: "user")
      create(
        email: email.to_s.strip.downcase,
        password_digest: BCrypt::Password.create(password),
        role: role
      )
    end
  end

  class InviteCode < Sequel::Model
    many_to_one :creator, class: :User, key: :created_by_id
    many_to_one :redeemer, class: :User, key: :used_by_id

    def self.generate!(creator:)
      create(
        code: SecureRandom.alphanumeric(10).upcase,
        created_by_id: creator.id,
        created_at: Time.now,
        expires_at: Time.now + (7 * 24 * 60 * 60)
      )
    end

    def available?
      used_at.nil? && (expires_at.nil? || expires_at > Time.now)
    end

    def redeem!(user:)
      raise Sequel::ValidationFailed, "Invite already used" unless available?

      update(used_at: Time.now, used_by_id: user.id)
    end
  end

  class CatalogSnapshot < Sequel::Model
    def self.active_catalog
      where(active: true).order(Sequel.desc(:id)).first
    end

    def self.publish!(data, label: "default")
      db.transaction do
        where(active: true).update(active: false)
        create(label: label, data: data, active: true, created_at: Time.now)
      end
    end
  end

  class UserState < Sequel::Model
    DEFAULT_STATE = {
      "speaker" => "",
      "mode" => "binary",
      "values" => {},
      "weights" => nil,
      "groupWeights" => {},
      "collapsed" => {}
    }.freeze

    def self.for_user(user)
      find_or_create(user_id: user.id) do |row|
        row.state = DEFAULT_STATE.dup
        row.updated_at = Time.now
      end
    end

    def parsed_state
      state.is_a?(Hash) ? state : JSON.parse(state.to_s)
    rescue JSON::ParserError
      DEFAULT_STATE.dup
    end

    def update_state!(hash)
      update(state: hash, updated_at: Time.now)
    end
  end
end
