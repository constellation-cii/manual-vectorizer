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
    one_to_one :user_workspace
    one_to_many :vector_sheets, class: "ManualVectorizer::VectorSheet", key: :owner_id
    one_to_many :vector_log_entries, class: "ManualVectorizer::VectorLogEntry", key: :user_id
    one_to_many :owned_shares, class: "ManualVectorizer::ResourceShare", key: :owner_id

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
      return nil unless BCrypt::Password.new(user.password_digest) == password.to_s.strip

      user
    end

    def set_password!(password)
      update(password_digest: BCrypt::Password.create(password))
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
      JsonColumn.parse(state, default: DEFAULT_STATE.dup)
    end

    def update_state!(hash)
      update(state: hash, updated_at: Time.now)
    end
  end

  class VectorSheet < Sequel::Model
    plugin :timestamps, update_on_create: true

    many_to_one :owner, class: :User, key: :owner_id
    many_to_one :forked_from, class: "ManualVectorizer::VectorSheet", key: :forked_from_id
    one_to_many :revisions, class: "ManualVectorizer::SheetRevision", key: :sheet_id
    one_to_many :log_entries, class: "ManualVectorizer::VectorLogEntry", key: :sheet_id

    def definition
      JsonColumn.parse(self[:definition])
    end

    def before_create
      self.created_at ||= Time.now
      self.updated_at ||= Time.now
      self.content_fingerprint = SheetDefinition.fingerprint(definition) if content_fingerprint.to_s.empty?
      super
    end

    def before_save
      self[:definition] = JsonColumn.persist(db, self[:definition]) if self[:definition]
      super
    end

    def self.master_sheet
      where(is_master: true).order(Sequel.desc(:id)).first
    end

    def self.accessible_by(user)
      ids = where(owner_id: user.id).select_map(:id)
      ids.concat(where(is_master: true).select_map(:id))
      ids.concat(ResourceShare.shared_sheet_ids_for(user))
      where(id: ids.uniq)
    end

    def readable_by?(user)
      return true if user.admin?
      return true if is_master
      return true if owner_id == user.id

      ResourceShare.shared_sheet_ids_for(user).include?(id)
    end

    def writable_by?(user)
      return true if user.admin? && is_master
      return true if owner_id == user.id

      false
    end

    def update_definition!(new_definition, user:, summary: "Updated sheet")
      SheetDefinition.compute_hashes!(new_definition)
      fp = SheetDefinition.fingerprint(new_definition)
      update(definition: new_definition, content_fingerprint: fp, updated_at: Time.now)
      SheetRevision.create(
        sheet_id: id,
        user_id: user.id,
        definition: new_definition,
        change_summary: summary,
        created_at: Time.now
      )
    end
  end

  class UserWorkspace < Sequel::Model
    many_to_one :user
    many_to_one :active_sheet, class: "ManualVectorizer::VectorSheet", key: :active_sheet_id

    def parsed_draft
      base = UserState::DEFAULT_STATE.dup
      parsed = JsonColumn.parse(self[:draft_state])
      base.merge(parsed)
    end
  end

  class SheetRevision < Sequel::Model
    many_to_one :sheet, class: "ManualVectorizer::VectorSheet", key: :sheet_id
    many_to_one :user

    def before_create
      self[:definition] = JsonColumn.persist(db, self[:definition]) if self[:definition]
      super
    end
  end

  class VectorLogEntry < Sequel::Model
    plugin :timestamps, update_on_create: true

    many_to_one :user
    many_to_one :sheet, class: "ManualVectorizer::VectorSheet", key: :sheet_id

    def ranking_data
      JsonColumn.parse(self[:ranking])
    end

    def sheet_snapshot_data
      raw = self[:sheet_snapshot]
      return nil if raw.nil?

      JsonColumn.parse(raw)
    end

    def readable_by?(user)
      return true if user.admin?
      return true if user_id == user.id

      ResourceShare.shared_log_ids_for(user).include?(id)
    end

    def self.visible_to(user)
      return order(Sequel.desc(:created_at)).all if user.admin?

      owned = where(user_id: user.id).all
      shared_ids = ResourceShare.shared_log_ids_for(user)
      shared = shared_ids.empty? ? [] : where(id: shared_ids).all
      (owned + shared).uniq { |r| r.id }
    end
  end

  class ResourceShare < Sequel::Model
    many_to_one :owner, class: :User, key: :owner_id
    many_to_one :shared_with, class: :User, key: :shared_with_user_id

    def self.shared_sheet_ids_for(user)
      where(resource_type: "sheet", shared_with_user_id: user.id).select_map(:resource_id)
    end

    def self.shared_log_ids_for(user)
      where(resource_type: "log_entry", shared_with_user_id: user.id).select_map(:resource_id)
    end

    def self.share!(owner:, resource_type:, resource_id:, email:, permission: "read")
      recipient = User.find(email: email.to_s.strip.downcase)
      raise ArgumentError, "User not found" unless recipient
      raise ArgumentError, "Cannot share with yourself" if recipient.id == owner.id

      create(
        resource_type: resource_type,
        resource_id: resource_id,
        owner_id: owner.id,
        shared_with_user_id: recipient.id,
        permission: permission,
        created_at: Time.now
      )
    end
  end
end
