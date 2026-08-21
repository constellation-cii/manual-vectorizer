# frozen_string_literal: true

require "sinatra/base"
require "sinatra/content_for"
require "rack/utils"
require "json"
require "securerandom"

require_relative "database"

module ManualVectorizer
  if ENV["DATABASE_URL"] && !ENV["DATABASE_URL"].empty?
    Database.connect!
    Database.migrate! if ENV.fetch("RACK_ENV", "development") == "production"
    Sequel::Model.db = Database.connect!

    require_relative "models"
    require_relative "json_column"
    require_relative "sheet_definition"
    require_relative "sheet_merge"
    require_relative "ranking_import"
    require_relative "workspace_service"
    require_relative "sheet_routes"

    if ENV.fetch("RACK_ENV", "development") == "production"
      require_relative "seeds"
      Seeds.run!
    end
  end

  class App < Sinatra::Base
    register SheetRoutes
    helpers Sinatra::ContentFor

    helpers do
      def h(value)
        Rack::Utils.escape_html(value.to_s)
      end
    end

    set :root, File.expand_path("../..", __dir__)
    set :public_folder, File.join(root, "public")
    set :views, File.join(root, "views")
    set :protection, except: :host_authorization

    configure do
      enable :sessions
      secret = ENV["SESSION_SECRET"]
      secret = "dev-session-secret-change-me" if secret.nil? || secret.empty?
      if secret == "dev-session-secret-change-me" && ENV.fetch("RACK_ENV", "development") == "production"
        raise "SESSION_SECRET is required in production"
      end
      set :session_secret, secret
    end

    before do
      unless request.path_info == "/up"
        halt 503, "Database not ready" unless Database.connected?
      end
      @current_user = current_user if Database.connected?
    end

    get "/up" do
      "ok"
    end

    def self.session_secret
      ENV.fetch("SESSION_SECRET") do
        if production?
          raise "SESSION_SECRET is required in production"
        end

        "dev-session-secret-change-me"
      end
    end

    def self.production?
      ENV.fetch("RACK_ENV", "development") == "production"
    end

    def production?
      self.class.production?
    end

    def logged_in?
      !current_user.nil?
    end

    def current_user
      return nil unless Database.connected?
      return @current_user if defined?(@current_user)

      @current_user = session[:user_id] ? User[session[:user_id]] : nil
    end

    def require_login!
      return if logged_in?

      if api_request?
        halt 401, json_error("Login required")
      end

      redirect "/login?return=#{Rack::Utils.escape_path(request.path_info)}"
    end

    def require_admin!
      require_login!
      return if current_user.admin?

      halt 403, api_request? ? json_error("Admin required") : "Forbidden"
    end

    def api_request?
      request.path_info.start_with?("/api/") ||
        request.content_type.to_s.include?("application/json")
    end

    def json_error(message, status: 400)
      content_type :json
      status status
      { error: message }.to_json
    end

    def json_ok(payload, status: 200)
      content_type :json
      status status
      payload.to_json
    end

    get "/login" do
      redirect "/" if logged_in?
      @return_to = params[:return].to_s
      erb :login, layout: :layout
    end

    post "/login" do
      user = User.authenticate(params[:email], params[:password])
      unless user
        @error = "Invalid email or password"
        @return_to = params[:return].to_s
        return erb :login, layout: :layout
      end

      session[:user_id] = user.id
      redirect safe_return_path(params[:return])
    end

    get "/signup" do
      redirect "/" if logged_in?
      @invite_code = params[:code].to_s
      erb :signup, layout: :layout
    end

    post "/signup" do
      code = InviteCode.first(code: params[:invite_code].to_s.strip.upcase)
      unless code&.available?
        @error = "Invalid or expired invite code"
        @invite_code = params[:invite_code]
        return erb :signup, layout: :layout
      end

      email = params[:email].to_s.strip.downcase
      password = params[:password].to_s
      if email.empty? || password.length < 8
        @error = "Email required and password must be at least 8 characters"
        @invite_code = params[:invite_code]
        return erb :signup, layout: :layout
      end

      if User.find(email: email)
        @error = "An account with that email already exists"
        @invite_code = params[:invite_code]
        return erb :signup, layout: :layout
      end

      user = User.create_account!(email: email, password: password)
      code.redeem!(user: user)
      WorkspaceService.provision_user!(user) if Database.connected?
      session[:user_id] = user.id
      redirect "/"
    end

    post "/logout" do
      session.clear
      redirect "/login"
    end

    get "/account" do
      require_login!
      @success = params[:updated] == "1"
      erb :account, layout: :layout
    end

    post "/account/password" do
      require_login!
      current_password = params[:current_password].to_s
      new_password = params[:new_password].to_s
      confirmation = params[:new_password_confirmation].to_s

      unless User.authenticate(current_user.email, current_password)
        @error = "Current password is incorrect"
        return erb :account, layout: :layout
      end

      if new_password.length < 8
        @error = "New password must be at least 8 characters"
        return erb :account, layout: :layout
      end

      if new_password != confirmation
        @error = "New passwords do not match"
        return erb :account, layout: :layout
      end

      current_user.set_password!(new_password)
      redirect "/account?updated=1"
    end

    # --- App pages (auth required) ---

    get "/" do
      require_login!
      send_file File.join(settings.public_folder, "index.html")
    end

    get "/weights.html" do
      require_login!
      send_file File.join(settings.public_folder, "weights.html")
    end

    get "/edit.html" do
      require_login!
      send_file File.join(settings.public_folder, "edit.html")
    end

    get "/log.html" do
      require_login!
      send_file File.join(settings.public_folder, "log.html")
    end

    get "/merge.html" do
      require_login!
      send_file File.join(settings.public_folder, "merge.html")
    end

    get "/results.html" do
      require_login!
      send_file File.join(settings.public_folder, "results.html")
    end

    get "/index.html" do
      redirect "/"
    end

    # --- Admin ---

    get "/admin" do
      require_admin!
      @invites = InviteCode.order(Sequel.desc(:created_at)).limit(50).all
      erb :admin, layout: :layout
    end

    post "/admin/invites" do
      require_admin!
      invite = InviteCode.generate!(creator: current_user)
      if api_request? || params[:format] == "json"
        json_ok(invite.to_hash.slice("id", "code", "expires_at", "created_at"))
      else
        redirect "/admin?created=#{Rack::Utils.escape(invite.code)}"
      end
    end

    # --- API ---

    get "/api/me" do
      require_login!
      json_ok({ id: current_user.id, email: current_user.email, role: current_user.role })
    end

    get "/api/catalog" do
      require_login!
      catalog = WorkspaceService.active_catalog_for(current_user)
      sheet = WorkspaceService.active_sheet_for(current_user)
      catalog["sheet"] = { "id" => sheet.id, "name" => sheet.name, "is_master" => sheet.is_master }
      json_ok(catalog)
    end

    get "/api/session" do
      require_login!
      json_ok(WorkspaceService.draft_state_for(current_user))
    end

    put "/api/session" do
      require_login!
      body = JSON.parse(request.body.read)
      WorkspaceService.save_draft!(current_user, body)
      json_ok({ ok: true })
    rescue JSON::ParserError
      json_error("Invalid JSON body")
    end

    get "/data/catalog.json" do
      require_login!
      catalog = WorkspaceService.active_catalog_for(current_user)
      content_type :json
      JSON.pretty_generate(catalog) + "\n"
    end

    not_found do
      if api_request?
        json_error("Not found", status: 404)
      else
        status 404
        "Not found"
      end
    end

    error do
      if api_request?
        json_error(env["sinatra.error"].message, status: 500)
      else
        status 500
        "Something went wrong"
      end
    end

    private

    def safe_return_path(path)
      path = path.to_s
      return "/" if path.empty? || !path.start_with?("/") || path.start_with?("//")

      path
    end
  end
end
