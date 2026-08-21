# frozen_string_literal: true

require "json"

module ManualVectorizer
  module JsonColumn
    module_function

    def parse(value, default: {})
      return value if value.is_a?(Hash) || value.is_a?(Array)
      return default if value.nil?

      JSON.parse(value.to_s)
    rescue JSON::ParserError
      default
    end
  end
end
