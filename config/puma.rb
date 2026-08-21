# frozen_string_literal: true

port ENV.fetch("PORT", 8080)
environment ENV.fetch("RACK_ENV", "production")
threads ENV.fetch("PUMA_THREADS", 5), ENV.fetch("PUMA_THREADS", 5)
workers ENV.fetch("PUMA_WORKERS", 0)
