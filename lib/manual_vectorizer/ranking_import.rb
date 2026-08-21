# frozen_string_literal: true

module ManualVectorizer
  module RankingImport
    Conflict = Struct.new(:guest_key, :host_key, :reason, keyword_init: true)

    module_function

    def import(host_definition, ranking_values, decisions: {})
      host = SheetDefinition.compute_hashes!(JSON.parse(JSON.generate(host_definition)))
      host_by_key = host["vectors"].to_h { |v| [v["key"], v] }
      host_by_content = host["vectors"].group_by { |v| v["content_hash"] }
      host_by_desc = host["vectors"].group_by { |v| v["description_hash"] }

      result = {
        "values" => {},
        "matched" => [],
        "skipped" => [],
        "conflicts" => []
      }

      ranking_values.each do |guest_key, score|
        guest_key = guest_key.to_s
        host_key = match_key(host, host_by_key, host_by_content, host_by_desc, guest_key, ranking_values, decisions)
        if host_key == :skip
          result["skipped"] << guest_key
          next
        end
        if host_key == :conflict
          result["conflicts"] << { "guest_key" => guest_key, "reason" => "description_mismatch" }
          next
        end
        next unless host_key

        result["values"][host_key] = score
        result["matched"] << { "guest_key" => guest_key, "host_key" => host_key }
      end

      result
    end

    def match_key(host, host_by_key, host_by_content, host_by_desc, guest_key, _ranking_values, decisions)
      return guest_key if host_by_key[guest_key]

      guest_vector = (host["vectors"] || []).find { |v| v["key"] == guest_key }
      guest_content = guest_vector&.dig("content_hash")
      guest_desc = guest_vector&.dig("description_hash")

      if guest_content && host_by_content[guest_content]&.any?
        return host_by_content[guest_content].first["key"]
      end

      if guest_desc && host_by_desc[guest_desc]&.any?
        return host_by_desc[guest_desc].first["key"]
      end

      if guest_vector
        case decisions["description_conflicts"]
        when "skip_all" then return :skip
        when "yes_all" then return guest_key
        end
        return :conflict
      end

      :skip
    end

    def preview(host_definition, guest_definition, ranking_values)
      guest_by_key = (guest_definition["vectors"] || []).to_h { |v| [v["key"], v] }
      enriched = ranking_values.transform_keys(&:to_s).each_with_object({}) do |(key, score), memo|
        vector = guest_by_key[key]
        memo[key] = {
          "score" => score,
          "content_hash" => vector&.dig("content_hash"),
          "description_hash" => vector&.dig("description_hash")
        }
      end
      import(host_definition, ranking_values).merge("guest_vectors" => enriched)
    end
  end
end
