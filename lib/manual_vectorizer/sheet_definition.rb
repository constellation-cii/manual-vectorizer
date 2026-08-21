# frozen_string_literal: true

require "digest"
require "json"
require "yaml"

module ManualVectorizer
  module SheetDefinition
    VERSION = "2.0"
    BUNDLE_FORMAT = "manual-vectorizer-sheet-bundle"
    BUNDLE_VERSION = "1.0"
    DEFAULT_SIMILARITY_THRESHOLD = 0.85

    module_function

    def normalize_text(text)
      text.to_s.strip.downcase.gsub(/\s+/, " ")
    end

    def content_hash(vector)
      payload = [
        normalize_text(vector["name"]),
        normalize_text(vector["summary"]),
        normalize_text(vector["body"]),
        vector["folder"].to_s
      ].join("|")
      Digest::SHA256.hexdigest(payload)[0, 16]
    end

    def description_hash(vector)
      payload = [normalize_text(vector["summary"]), normalize_text(vector["body"])].join("|")
      Digest::SHA256.hexdigest(payload)[0, 16]
    end

    def type_hash(type)
      ideals = (type["ideals"] || {}).transform_keys(&:to_s).sort.to_h
      Digest::SHA256.hexdigest(JSON.generate(ideals))[0, 16]
    end

    def ranking_hash(ranking)
      values = (ranking["values"] || ranking).transform_keys(&:to_s).sort.to_h
      Digest::SHA256.hexdigest(JSON.generate(values))[0, 16]
    end

    def fingerprint(definition)
      Digest::SHA256.hexdigest(JSON.generate(definition))[0, 32]
    end

    def tokenize(text)
      normalize_text(text).split(/[^a-z0-9]+/).reject { |t| t.length < 3 }
    end

    def jaccard_similarity(a, b)
      set_a = tokenize(a).to_set
      set_b = tokenize(b).to_set
      return 0.0 if set_a.empty? && set_b.empty?

      intersection = (set_a & set_b).size
      union = (set_a | set_b).size
      union.zero? ? 0.0 : intersection.to_f / union
    end

    def compute_hashes!(definition)
      definition["version"] = VERSION
      (definition["vectors"] || []).each do |vector|
        vector["content_hash"] = content_hash(vector)
        vector["description_hash"] = description_hash(vector)
      end
      (definition["types"] || []).each do |type|
        type["type_hash"] = type_hash(type)
      end
      definition
    end

    def from_catalog(catalog, name: "Default Sheet", description: "")
      folders = (catalog["categories"] || {}).flat_map do |category, keys|
        [{ "id" => category, "label" => category, "parent" => nil, "order" => 0 }]
      end.uniq { |f| f["id"] }

      membership = catalog["group_membership"] || {}
      vectors = (catalog["skills"] || []).each_with_index.map do |skill, index|
        folder = Array(skill["category"]).first || "default"
        {
          "id" => skill["id"],
          "key" => skill["key"],
          "name" => skill["name"],
          "summary" => skill["summary"] || "",
          "body" => skill["body"] || "",
          "folder" => folder,
          "order" => index,
          "groups" => membership.select { |_, group| group }.keys.select { |key| key == skill["key"] }
        }
      end

      types = (catalog["types"] || []).map do |type|
        {
          "id" => type["id"],
          "name" => type["name"],
          "classifications" => (type["meta"] || {}).transform_keys(&:to_s),
          "ideals" => (type["ideals"] || {}).transform_keys(&:to_s)
        }
      end

      definition = {
        "version" => VERSION,
        "meta" => { "name" => name, "description" => description },
        "folders" => folders,
        "vectors" => vectors,
        "types" => types,
        "groups" => {
          "exclusive" => catalog["exclusive_groups"] || {},
          "pole_pairs" => catalog["pole_pairs"] || {},
          "ui" => flatten_ui_groups(catalog["ui_groups"] || {})
        },
        "weights" => {
          "default" => 1.0,
          "overrides" => (catalog["weights"] || {}).transform_keys(&:to_s)
        }
      }
      compute_hashes!(definition)
    end

    def flatten_ui_groups(ui_groups)
      ui_groups.flat_map do |category, groups|
        groups.map do |group|
          group.merge("category" => category)
        end
      end
    end

    def nest_ui_groups(flat_groups)
      nested = {}
      flat_groups.each do |group|
        category = group["category"] || group["folder"] || "default"
        nested[category] ||= []
        nested[category] << group.reject { |k, _| k == "category" }
      end
      nested
    end

    def to_catalog(definition)
      vectors = definition["vectors"] || []
      types = definition["types"] || []
      groups = definition["groups"] || {}
      weights_cfg = definition["weights"] || {}

      skills = vectors.sort_by { |v| v["order"] || 0 }.map do |vector|
        folder = vector["folder"] || "default"
        {
          "id" => vector["id"],
          "key" => vector["key"],
          "category" => [folder],
          "name" => vector["name"],
          "summary" => vector["summary"] || "",
          "body" => vector["body"] || "",
          "path" => ""
        }
      end

      catalog_types = types.map do |type|
        {
          "id" => type["id"],
          "name" => type["name"],
          "meta" => (type["classifications"] || {}).transform_keys(&:to_s),
          "ideals" => (type["ideals"] || {}).transform_keys(&:to_s)
        }
      end

      categories = {}
      vectors.each do |vector|
        folder = vector["folder"] || "default"
        categories[folder] ||= []
        categories[folder] << vector["key"]
      end

      membership = {}
      (groups["exclusive"] || {}).each_value do |keys|
        keys.each { |key| membership[key] = "exclusive" }
      end

      {
        "version" => definition["version"] || VERSION,
        "built_at" => Time.now.utc.iso8601,
        "built_on" => "manual-vectorizer",
        "generated_from" => { "source" => "vector_sheet" },
        "meta" => definition["meta"] || {},
        "skill_count" => skills.length,
        "type_count" => catalog_types.length,
        "categories" => categories,
        "skills" => skills,
        "types" => catalog_types,
        "weights" => weights_cfg["overrides"] || {},
        "exclusive_groups" => groups["exclusive"] || {},
        "group_membership" => membership,
        "pole_pairs" => groups["pole_pairs"] || {},
        "ui_groups" => nest_ui_groups(groups["ui"] || [])
      }
    end

    def validate(definition)
      errors = []
      errors << "Missing version" unless definition["version"]
      errors << "Missing vectors array" unless definition["vectors"].is_a?(Array)
      errors << "Missing types array" unless definition["types"].is_a?(Array)

      keys = []
      (definition["vectors"] || []).each do |vector|
        errors << "Vector missing key" if vector["key"].to_s.empty?
        errors << "Duplicate vector key #{vector['key']}" if keys.include?(vector["key"])
        keys << vector["key"]
      end

      type_ids = []
      (definition["types"] || []).each do |type|
        errors << "Type missing id" if type["id"].to_s.empty?
        errors << "Duplicate type id #{type['id']}" if type_ids.include?(type["id"])
        type_ids << type["id"]
      end

      errors
    end

    def duplicate_report(definition)
      vectors = definition["vectors"] || []
      exact = []
      vectors.combination(2).each do |a, b|
        if a["key"] == b["key"] || a["content_hash"] == b["content_hash"]
          exact << { "a" => a["key"], "b" => b["key"], "reason" => "exact" }
        end
      end
      exact
    end

    def similarity_report(definition, threshold: DEFAULT_SIMILARITY_THRESHOLD)
      vectors = definition["vectors"] || []
      pairs = []
      vectors.combination(2).each do |a, b|
        text_a = "#{a['name']} #{a['summary']} #{a['body']}"
        text_b = "#{b['name']} #{b['summary']} #{b['body']}"
        score = jaccard_similarity(text_a, text_b)
        next if score < threshold

        pairs << {
          "a" => a["key"],
          "b" => b["key"],
          "score" => score.round(3),
          "reason" => "similar"
        }
      end
      pairs.sort_by { |p| -p["score"] }
    end

    def parse_input(raw, format: nil)
      format ||= (raw.lstrip.start_with?("{") ? "json" : "yaml")
      parsed = case format
               when "yaml", "yml" then YAML.safe_load(raw, permitted_classes: [Date, Time])
               else JSON.parse(raw)
               end
      raise ArgumentError, "Expected object" unless parsed.is_a?(Hash)

      if parsed["format"] == BUNDLE_FORMAT
        parsed["sheet"] || parsed
      elsif parsed["definition"]
        parsed["definition"]
      else
        parsed
      end
    end

    def to_yaml(definition)
      YAML.dump(definition)
    end

    def build_bundle(sheet:, rankings: nil)
      {
        "format" => BUNDLE_FORMAT,
        "version" => BUNDLE_VERSION,
        "exported_at" => Time.now.utc.iso8601,
        "sheet" => {
          "name" => sheet.name,
          "slug" => sheet.slug,
          "description" => sheet.description,
          "is_master" => sheet.is_master,
          "definition" => sheet.definition
        },
        "rankings" => rankings || []
      }
    end

    def temples_sample_definition
      catalog_path = File.expand_path("../../data/catalog.json", __dir__)
      catalog = JSON.parse(File.read(catalog_path, encoding: "UTF-8"))
      temple_keys = catalog["categories"]["temples"] || []
      temple_skills = catalog["skills"].select { |s| temple_keys.include?(s["key"]) }

      mini_catalog = catalog.merge(
        "skills" => temple_skills,
        "categories" => { "temples" => temple_keys },
        "ui_groups" => { "temples" => catalog.dig("ui_groups", "temples") || [] },
        "types" => catalog["types"].first(4),
        "skill_count" => temple_skills.length,
        "type_count" => 4
      )
      from_catalog(mini_catalog, name: "Temples Sample", description: "Temple blindspot/focus vectors for merge testing")
    end
  end
end
