#!/usr/bin/env python3
"""Build catalog.json from pipeline skills + types.json for the manual vectorizer UI."""

from __future__ import annotations

import json
import re
import socket
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT.parent
SKILLS_DIR = PIPELINE / "skills"
TYPES_PATH = PIPELINE / "config" / "types.json"
OUT_PATH = ROOT / "data" / "catalog.json"
TG61_SKILLS = PIPELINE.parent / "Type Grid 6.1" / "Typer" / "vectorizer" / "skills"

FRONTMATTER = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n(.*)\z", re.DOTALL)

# Mutually exclusive complex groups (binary mode: only one may be SET per group).
EXCLUSIVE_GROUPS: dict[str, list[str]] = {
    "idealistic-complexes": [
        "type-grid/control",
        "type-grid/fun",
        "type-grid/god",
        "type-grid/inferiority",
        "type-grid/limitless",
        "type-grid/people-pleaser",
        "type-grid/slave",
        "type-grid/savior",
        "type-grid/victim",
    ],
    "solipsistic-complexes": [
        "type-grid/covetous",
        "type-grid/credit",
        "type-grid/hedonistic",
        "type-grid/hubris",
        "type-grid/freedom",
        "type-grid/elitism",
        "type-grid/xanatos",
        "type-grid/vampire",
    ],
    "6.1-archetypes": [
        "6.1/king",
        "6.1/warrior",
        "6.1/magician",
        "6.1/consort",
        "6.1/lover",
        "6.1/maiden",
        "6.1/matron",
        "6.1/mother",
    ],
}

# Known type-grid pole pairs (from import_type_grid.py PAIRS).
TYPE_GRID_POLE_PAIRS: dict[str, str] = {
    "type-grid/male": "type-grid/female",
    "type-grid/female": "type-grid/male",
    "type-grid/initiating": "type-grid/responding",
    "type-grid/responding": "type-grid/initiating",
    "type-grid/authentic": "type-grid/harmonious",
    "type-grid/harmonious": "type-grid/authentic",
    "type-grid/visible": "type-grid/private",
    "type-grid/private": "type-grid/visible",
    "type-grid/authoritarian": "type-grid/laissez-faire",
    "type-grid/laissez-faire": "type-grid/authoritarian",
    "type-grid/confrontational": "type-grid/nonconfrontational",
    "type-grid/nonconfrontational": "type-grid/confrontational",
    "type-grid/experiential": "type-grid/observational",
    "type-grid/observational": "type-grid/experiential",
    "type-grid/independent": "type-grid/conformity",
    "type-grid/conformity": "type-grid/independent",
    "type-grid/partial": "type-grid/impartial",
    "type-grid/impartial": "type-grid/partial",
    "type-grid/individualistic": "type-grid/communalistic",
    "type-grid/communalistic": "type-grid/individualistic",
    "type-grid/people-oriented": "type-grid/task-oriented",
    "type-grid/task-oriented": "type-grid/people-oriented",
    "type-grid/cooperative": "type-grid/utilitarian",
    "type-grid/utilitarian": "type-grid/cooperative",
    "type-grid/doubtful": "type-grid/faithful",
    "type-grid/faithful": "type-grid/doubtful",
    "type-grid/absolutes": "type-grid/nuance",
    "type-grid/nuance": "type-grid/absolutes",
    "type-grid/separation-anxiety": "type-grid/closeness-anxiety",
    "type-grid/closeness-anxiety": "type-grid/separation-anxiety",
    "type-grid/influx": "type-grid/outflux",
    "type-grid/outflux": "type-grid/influx",
    "type-grid/drainers": "type-grid/chargers",
    "type-grid/chargers": "type-grid/drainers",
    "type-grid/fun": "type-grid/control",
    "type-grid/control": "type-grid/fun",
    "type-grid/god": "type-grid/inferiority",
    "type-grid/inferiority": "type-grid/god",
    "type-grid/limitless": "type-grid/people-pleaser",
    "type-grid/people-pleaser": "type-grid/limitless",
    "type-grid/xanatos": "type-grid/freedom",
    "type-grid/freedom": "type-grid/xanatos",
    "type-grid/elitism": "type-grid/hubris",
    "type-grid/hubris": "type-grid/elitism",
    "type-grid/hedonistic": "type-grid/covetous",
    "type-grid/covetous": "type-grid/hedonistic",
}


# Verified 6.1 pole pairs (complementary 0/10 in all 128 types).
SIX_ONE_POLE_PAIRS: dict[str, str] = {
    "6.1/flexible": "6.1/inflexible",
    "6.1/inflexible": "6.1/flexible",
    "6.1/grateful": "6.1/ungrateful",
    "6.1/ungrateful": "6.1/grateful",
    "6.1/macro": "6.1/micro",
    "6.1/micro": "6.1/macro",
    "6.1/personal": "6.1/impersonal",
    "6.1/impersonal": "6.1/personal",
    "6.1/charitable": "6.1/frugal",
    "6.1/frugal": "6.1/charitable",
    "6.1/ascetic": "6.1/materialist",
    "6.1/materialist": "6.1/ascetic",
}


def load_skill(path: Path, skills_root: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig")
    match = FRONTMATTER.match(raw)
    body = match.group(1).strip() if match else raw.strip()

    relative = path.relative_to(skills_root)
    parts = list(relative.parts)
    filename = parts.pop()
    skill_id = Path(filename).stem
    category = parts
    key = "/".join(category + [skill_id]) if category else skill_id

    first_line = body.splitlines()[0].strip() if body else skill_id

    return {
        "id": skill_id,
        "key": key,
        "category": category,
        "name": skill_id.replace("-", " ").title(),
        "summary": first_line,
        "body": body,
        "path": str(path),
    }


def discover_skills(skills_root: Path) -> list[dict]:
    skills = [load_skill(path, skills_root) for path in sorted(skills_root.rglob("*.md"))]
    return sorted(skills, key=lambda s: s["key"])


def _slug_to_id(slug: str) -> str:
    return slug.replace("_", "-")


def _split_combined_folder(folder: str, known_ids: set[str]) -> list[str]:
    """Split TG5/TG6 combined axis folders into pipeline skill ids."""
    name = folder.removesuffix("_foundation")
    if "_vs_" in name:
        return [_slug_to_id(part) for part in name.split("_vs_", 1)]
    if "_or_" in name:
        return [_slug_to_id(part) for part in name.split("_or_", 1)]

    for left in sorted(known_ids, key=len, reverse=True):
        left_us = left.replace("-", "_")
        prefix = f"{left_us}_"
        if name.startswith(prefix):
            right = _slug_to_id(name[len(prefix) :])
            if right in known_ids:
                return [left, right]

    single = _slug_to_id(name)
    if single in known_ids:
        return [single]
    return []


def _pipeline_id_for_tg6(group_path: str, tg_slug: str) -> str:
    slug = _slug_to_id(tg_slug)
    if group_path.endswith("/archetype_ally"):
        return f"ally-{slug}"
    if group_path.endswith("/archetype_enemy"):
        return f"enemy-{slug}"
    return slug


def _group_label(group_path: str) -> str:
    leaf = group_path.split("/")[-1]
    return leaf.replace("_", " ").title()


def load_reference_groups(skill_keys: set[str]) -> dict[str, str]:
    """Map pipeline skill key -> reference taxonomy group path from Type Grid 6.1."""
    if not TG61_SKILLS.is_dir():
        return {}

    by_prefix: dict[str, set[str]] = defaultdict(set)
    for key in skill_keys:
        if "/" in key:
            by_prefix[key.split("/", 1)[0]].add(key.split("/", 1)[1])

    membership: dict[str, str] = {}

    for skill_file in TG61_SKILLS.rglob("SKILL.md"):
        rel = skill_file.relative_to(TG61_SKILLS).parts
        if len(rel) < 2 or rel[0] not in {"tg5", "tg6"}:
            continue

        top = rel[0]
        pipeline_prefix = "type-grid" if top == "tg5" else "6.1"
        known_ids = by_prefix.get(pipeline_prefix, set())
        inner = rel[1:-1]

        if not inner:
            continue

        if len(inner) == 1:
            folder = inner[0]
            group_path = f"{top}/{folder}"
            member_ids = _split_combined_folder(folder, known_ids)
        else:
            group_path = f"{top}/{'/'.join(inner[:-1])}"
            tg_slug = inner[-1]
            if top == "tg6":
                member_ids = [_pipeline_id_for_tg6(group_path, tg_slug)]
            else:
                member_ids = [_slug_to_id(tg_slug)]

        for member_id in member_ids:
            key = f"{pipeline_prefix}/{member_id}"
            if key in skill_keys:
                membership[key] = group_path

    return membership


def assign_groups(skill_keys: set[str]) -> dict[str, str]:
    """Map skill key -> exclusive group id."""
    membership: dict[str, str] = {}
    for group_id, members in EXCLUSIVE_GROUPS.items():
        for key in members:
            if key in skill_keys:
                membership[key] = group_id
    return membership


def _is_ten(value) -> bool:
    try:
        return float(value) == 10.0
    except (TypeError, ValueError):
        return False


def _never_cooccur_at_10(types: list[dict], category: str, a: str, b: str) -> bool:
    ka, kb = f"{category}/{a}", f"{category}/{b}"
    return all(
        not (_is_ten(t.get("ideals", {}).get(ka)) and _is_ten(t.get("ideals", {}).get(kb)))
        for t in types
    )


def _hot_counts(types: list[dict], category: str, members: list[str]) -> tuple[int, int]:
    keys = [f"{category}/{m}" for m in members]
    counts = [sum(1 for k in keys if _is_ten(t.get("ideals", {}).get(k))) for t in types]
    return min(counts), max(counts)


def _exactly_one_hot(types: list[dict], category: str, members: list[str]) -> bool:
    lo, hi = _hot_counts(types, category, members)
    return lo == 1 and hi == 1


def _at_most_one_hot(types: list[dict], category: str, members: list[str]) -> bool:
    _, hi = _hot_counts(types, category, members)
    return hi <= 1


def _grow_clique(
    seed: str,
    ids: list[str],
    blocked: set[str],
    never_fn,
    valid_fn=None,
) -> list[str]:
    group = [seed]
    changed = True
    while changed:
        changed = False
        for cand in ids:
            if cand in blocked or cand in group:
                continue
            if not all(never_fn(cand, member) for member in group):
                continue
            trial = sorted(group + [cand])
            if valid_fn is not None and not valid_fn(trial):
                continue
            group = trial
            changed = True
    return sorted(group)


def _label_for_members(members: list[str]) -> str:
    labels = [m.replace("-", " ").title() for m in members]
    if len(labels) <= 4:
        return " · ".join(labels)
    return f"{labels[0]} · … · {labels[-1]} ({len(labels)})"


def _prefix_bucket(skill_id: str) -> str | None:
    cognitive = {"ti", "te", "fi", "fe", "ni", "ne", "si", "se"}
    if skill_id in cognitive:
        return "cognitive-functions"
    if skill_id.startswith("ally-"):
        return "archetype-allies"
    if skill_id.startswith("enemy-"):
        return "archetype-enemies"
    for prefix in ("heart", "soul", "mind", "body"):
        if skill_id.startswith(f"{prefix}-"):
            return f"{prefix}-cross-refs"
    return None


def _prefix_label(bucket: str) -> str:
    return bucket.replace("-", " ").title()


def discover_ui_groups(
    skills: list[dict],
    types: list[dict],
    pole_pairs: dict[str, str],
    reference_membership: dict[str, str],
) -> dict[str, list[dict]]:
    """Build UI sub-groups within each top-level skill folder."""
    skill_by_key = {s["key"]: s for s in skills}
    by_category: dict[str, list[str]] = defaultdict(list)
    for skill in skills:
        top = skill["category"][0] if skill["category"] else "other"
        by_category[top].append(skill["id"])

    ui_groups: dict[str, list[dict]] = {}

    for category, ids in sorted(by_category.items()):
        if category == "other":
            continue

        ids = sorted(set(ids))
        assigned: set[str] = set()
        groups: list[dict] = []

        def add_group(members: list[str], kind: str, label: str | None = None) -> None:
            members = sorted(set(members))
            if not members:
                return
            if assigned.intersection(members):
                return
            keys = [f"{category}/{m}" for m in members if f"{category}/{m}" in skill_by_key]
            if not keys:
                return
            group_id = "-".join(members)
            groups.append(
                {
                    "id": group_id,
                    "label": label or _label_for_members(members),
                    "keys": keys,
                    "kind": kind,
                }
            )
            assigned.update(members)

        # 1) Reference taxonomy groups (Type Grid 6.1 folder structure).
        ref_buckets: dict[str, list[str]] = defaultdict(list)
        for skill_id in ids:
            key = f"{category}/{skill_id}"
            group_path = reference_membership.get(key)
            if group_path:
                ref_buckets[group_path].append(skill_id)
        for group_path in sorted(ref_buckets):
            members = ref_buckets[group_path]
            add_group(members, "reference", _group_label(group_path))

        never = lambda a, b: _never_cooccur_at_10(types, category, a, b)  # noqa: E731
        exact = lambda members: _exactly_one_hot(types, category, members)  # noqa: E731

        # 2) Exact-one-hot cliques for unmapped (pipeline temples folder).
        if category == "temples":
            while True:
                best: list[str] | None = None
                for seed in ids:
                    if seed in assigned:
                        continue
                    clique = _grow_clique(seed, ids, assigned, never)
                    if len(clique) >= 3 and exact(clique) and (best is None or len(clique) < len(best)):
                        best = clique
                if not best:
                    break
                add_group(best, "exact-one-hot")

        # 3) Pole-pair components for unmapped pairs.
        pair_adj: dict[str, set[str]] = defaultdict(set)
        for key, opposite in pole_pairs.items():
            if not key.startswith(f"{category}/"):
                continue
            left = key.split("/", 1)[1]
            right = opposite.split("/", 1)[1]
            if left in ids and right in ids:
                pair_adj[left].add(right)
                pair_adj[right].add(left)

        visited: set[str] = set()
        for node in ids:
            if node in assigned or node in visited:
                continue
            stack = [node]
            component: list[str] = []
            while stack:
                cur = stack.pop()
                if cur in visited or cur in assigned:
                    continue
                visited.add(cur)
                component.append(cur)
                stack.extend(pair_adj.get(cur, []))
            if len(component) >= 2:
                add_group(component, "pole-pair")

        # 4) Pipeline skill subfolders.
        subfolder: dict[str, list[str]] = defaultdict(list)
        for skill in skills:
            if not skill["category"] or skill["category"][0] != category:
                continue
            if len(skill["category"]) > 1 and skill["id"] not in assigned:
                subfolder["/".join(skill["category"][1:])].append(skill["id"])
        for folder, members in sorted(subfolder.items()):
            add_group(members, "subfolder", _group_label(folder))

        # 5) Residual prefix buckets.
        prefix_members: dict[str, list[str]] = defaultdict(list)
        for skill_id in ids:
            if skill_id in assigned:
                continue
            bucket = _prefix_bucket(skill_id)
            if bucket:
                prefix_members[bucket].append(skill_id)
        for bucket, members in sorted(prefix_members.items()):
            add_group(members, "prefix", _prefix_label(bucket))

        remaining = [f"{category}/{i}" for i in ids if i not in assigned]
        if remaining:
            groups.append(
                {
                    "id": "other",
                    "label": "Other",
                    "keys": remaining,
                    "kind": "other",
                }
            )

        ui_groups[category] = groups

    return ui_groups


def main() -> int:
    if not SKILLS_DIR.is_dir():
        print(f"Skills directory not found: {SKILLS_DIR}", file=sys.stderr)
        return 1
    if not TYPES_PATH.is_file():
        print(f"Types file not found: {TYPES_PATH}", file=sys.stderr)
        return 1

    skills = discover_skills(SKILLS_DIR)
    skill_keys = {s["key"] for s in skills}

    types_doc = json.loads(TYPES_PATH.read_text(encoding="utf-8"))
    weights = types_doc.get("weights") or {}
    types = types_doc.get("types") or []
    meta = types_doc.get("meta") or {}

    pole_pairs = dict(TYPE_GRID_POLE_PAIRS)
    for a, b in SIX_ONE_POLE_PAIRS.items():
        if a in skill_keys and b in skill_keys:
            pole_pairs[a] = b

    exclusive_groups = {
        gid: [k for k in keys if k in skill_keys]
        for gid, keys in EXCLUSIVE_GROUPS.items()
    }
    exclusive_groups = {k: v for k, v in exclusive_groups.items() if v}

    group_membership = assign_groups(skill_keys)
    reference_membership = load_reference_groups(skill_keys)
    ui_groups = discover_ui_groups(skills, types, pole_pairs, reference_membership)

    categories: dict[str, list[str]] = defaultdict(list)
    for skill in skills:
        top = skill["category"][0] if skill["category"] else "other"
        categories[top].append(skill["key"])

    catalog = {
        "version": "1.0.0",
        "built_at": datetime.now(UTC).isoformat(),
        "built_on": socket.gethostname(),
        "generated_from": {
            "skills_dir": str(SKILLS_DIR.resolve()),
            "types_path": str(TYPES_PATH.resolve()),
        },
        "meta": meta,
        "skill_count": len(skills),
        "type_count": len(types),
        "categories": dict(sorted(categories.items())),
        "skills": skills,
        "types": [
            {
                "id": t["id"],
                "name": t.get("name") or t["id"],
                "meta": t.get("meta") or {},
                "ideals": t.get("ideals") or {},
            }
            for t in types
        ],
        "weights": {k: weights.get(k, 1.0) for k in sorted(skill_keys)},
        "exclusive_groups": exclusive_groups,
        "group_membership": group_membership,
        "pole_pairs": {k: pole_pairs[k] for k in sorted(pole_pairs) if k in skill_keys},
        "ui_groups": ui_groups,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(skills)} skills, {len(types)} types, {len(weights)} weights)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
