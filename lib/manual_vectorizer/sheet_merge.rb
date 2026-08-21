# frozen_string_literal: true

require "securerandom"

module ManualVectorizer
  module SheetMerge
    module_function

    def merge(host_definition, guest_definition, vector_map: {}, type_map: {}, decisions: {})
      host = deep_dup(host_definition)
      guest = deep_dup(guest_definition)
      ManualVectorizer::SheetDefinition.compute_hashes!(host)
      ManualVectorizer::SheetDefinition.compute_hashes!(guest)

      report = {
        "vectors_added" => [],
        "vectors_skipped" => [],
        "vectors_conflicts" => [],
        "types_added" => [],
        "types_skipped" => [],
        "types_conflicts" => []
      }

      host_keys = host["vectors"].to_h { |v| [v["key"], v] }
      guest_vectors = guest["vectors"] || []

      guest_vectors.each do |guest_vector|
        mapping = vector_map[guest_vector["key"]]
        if mapping == "skip"
          report["vectors_skipped"] << guest_vector["key"]
          next
        end

        target_key = mapping.presence || auto_match_vector(host, guest_vector, decisions)
        if target_key == :skip
          report["vectors_skipped"] << guest_vector["key"]
          next
        end
        if target_key == :conflict
          report["vectors_conflicts"] << {
            "guest_key" => guest_vector["key"],
            "reason" => "description_mismatch"
          }
          next
        end

        if target_key && host_keys[target_key]
          host_keys[target_key]["summary"] = guest_vector["summary"] if decisions["overwrite_descriptions"]
          host_keys[target_key]["body"] = guest_vector["body"] if decisions["overwrite_descriptions"]
          report["vectors_skipped"] << guest_vector["key"]
        else
          new_vector = guest_vector.dup
          new_vector["key"] = target_key || guest_vector["key"]
          new_vector["order"] = host["vectors"].length
          host["vectors"] << new_vector
          host_keys[new_vector["key"]] = new_vector
          report["vectors_added"] << new_vector["key"]
        end
      end

      host_type_ids = host["types"].to_h { |t| [t["id"], t] }
      (guest["types"] || []).each do |guest_type|
        mapping = type_map[guest_type["id"]]
        if mapping == "skip"
          report["types_skipped"] << guest_type["id"]
          next
        end

        if mapping.is_a?(Hash)
          new_type = guest_type.dup
          new_type["classifications"] = mapping
          new_type["id"] = "#{guest_type['id']}-mapped-#{SecureRandom.hex(3)}"
          host["types"] << new_type
          report["types_added"] << new_type["id"]
          next
        end

        if host_type_ids[guest_type["id"]]
          if host_type_ids[guest_type["id"]]["type_hash"] != guest_type["type_hash"]
            report["types_conflicts"] << { "guest_id" => guest_type["id"], "reason" => "type_hash_mismatch" }
          else
            report["types_skipped"] << guest_type["id"]
          end
        else
          host["types"] << guest_type.dup
          report["types_added"] << guest_type["id"]
        end
      end

      merge_groups!(host, guest)
      ManualVectorizer::SheetDefinition.compute_hashes!(host)
      { "definition" => host, "report" => report }
    end

    def auto_match_vector(host, guest_vector, decisions)
      host_vectors = host["vectors"] || []
      by_key = host_vectors.find { |v| v["key"] == guest_vector["key"] }
      return guest_vector["key"] if by_key

      by_content = host_vectors.find { |v| v["content_hash"] == guest_vector["content_hash"] }
      return by_content["key"] if by_content

      by_desc = host_vectors.find do |v|
        v_ideal = (v["ideals"] || {})
        g_ideal = (guest_vector["ideals"] || {})
        v_ideal == g_ideal && !g_ideal.empty?
      end
      if by_desc && by_desc["description_hash"] != guest_vector["description_hash"]
        case decisions["description_conflicts"]
        when "skip_all" then return :skip
        when "yes_all" then return by_desc["key"]
        end
        return :conflict
      end

      nil
    end

    def merge_groups!(host, guest)
      host["groups"] ||= { "exclusive" => {}, "pole_pairs" => {}, "ui" => [] }
      guest_groups = guest["groups"] || {}
      (guest_groups["exclusive"] || {}).each { |k, v| host["groups"]["exclusive"][k] ||= v }
      (guest_groups["pole_pairs"] || {}).each { |k, v| host["groups"]["pole_pairs"][k] ||= v }
      host["groups"]["ui"] ||= []
      (guest_groups["ui"] || []).each do |group|
        host["groups"]["ui"] << group unless host["groups"]["ui"].any? { |g| g["id"] == group["id"] }
      end
    end

    def deep_dup(obj)
      JSON.parse(JSON.generate(obj))
    end
  end
end
