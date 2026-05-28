"""
tag_nodes_ambient.py — Best-guess ambient tagging for a game's default graph.

Walks every node in a game's default graph and infers `ambient_tags` from
the node's name (and region, when present) using substring matching. The
inferred tag set is PATCHed onto each node via /api/nodes/{id}.

Idempotent: re-running with the same heuristic produces the same tags.
Existing tags are overwritten — re-running after a heuristic tweak is the
intended workflow.

Usage (from the bgmscape/ root with the backend running):

    python scripts/tag_nodes_ambient.py oot sm64
    python scripts/tag_nodes_ambient.py --dry-run oot

The heuristic is intentionally optimistic: when no rule matches a node, the
script leaves it untagged rather than guessing. The editor's Preview button
is the easiest way to fine-tune individual nodes afterward.
"""
from __future__ import annotations

import argparse
import re
import sys

import requests


# ── Heuristic rules ──────────────────────────────────────────────────────────
#
# Each rule is (regex, tags). The regex runs against the lowercased node name
# joined with the lowercased region (if any). Tags from EVERY matching rule
# accumulate, deduplicated. Order doesn't matter — accumulation is set-based.
#
# Designed for OoT and SM64 specifically but the patterns generalize. When
# adding a new game, extend this list; nothing here is game-specific by name.

RULES: list[tuple[str, list[str]]] = [
    # ── Habitat / biome ────────────────────────────────────────────────────
    (r"\bfield\b|hyrule field|meadow|plain|ranch|prairie", ["field", "day"]),
    (r"\bforest\b|woods|grove|deku tree|kokiri|trees?", ["forest"]),
    (r"\bmountain\b|peak|cliff|highlands?|summit|gerudo valley", ["mountain"]),
    (r"\bdesert\b|wasteland|sand|\bgerudo\b|colossus|dune", ["desert"]),
    (r"\bcave\b|cavern|hideout|grotto", ["cave"]),
    (r"\bdungeon\b|temple|tower|fortress|crypt|sanctum|well|jabu", ["dungeon", "indoor"]),
    (r"\briver\b|stream|creek|brook|fountain|spring|water(fall)?", ["river"]),
    (r"\blake\b|pond|reservoir|hylia", ["river", "day"]),
    (r"\bocean\b|sea\b|beach|cove|shore|bay|docks|jolly roger", ["ocean"]),
    (r"\bswamp\b|marsh|bog", ["forest", "night"]),
    (r"\bsnow\b|ice|glacier|tundra|cool[, ]+cool|snowman", ["snow", "winter", "mountain"]),
    (r"\bvolcano\b|crater|lava|magma|fire|lethal lava", ["cave", "mountain"]),
    (r"\bvillage\b|town\b|city\b|market|kakariko|castle town", ["urban", "day"]),
    (r"\bcastle\b|fort\b|stronghold|peach'?s castle", ["urban"]),
    (r"\bgraveyard\b|tomb|crypt", ["field", "night"]),

    # ── Specific OoT locations ─────────────────────────────────────────────
    (r"zora'?s domain|jabu", ["river", "cave", "indoor"]),
    (r"zora'?s river", ["river", "forest", "day"]),
    (r"goron city", ["mountain", "cave", "indoor"]),
    (r"death mountain", ["mountain"]),
    (r"death mountain crater", ["cave", "mountain"]),
    (r"lost woods|sacred forest meadow", ["forest", "dusk"]),
    (r"lon lon ranch", ["field", "day"]),
    (r"haunted wasteland|desert colossus", ["desert", "night"]),
    (r"ice cavern", ["cave", "winter", "snow"]),
    (r"shadow temple|bottom of the well", ["dungeon", "indoor", "night", "cave"]),
    (r"spirit temple", ["desert", "dungeon", "indoor"]),
    (r"water temple", ["river", "dungeon", "indoor"]),
    (r"fire temple", ["dungeon", "cave", "indoor"]),
    (r"forest temple", ["forest", "dungeon", "indoor"]),
    (r"temple of time", ["indoor", "dawn", "urban"]),
    (r"ganon'?s? castle|tower", ["dungeon", "indoor", "night"]),
    (r"market(\s|$)|hyrule castle town", ["urban", "day"]),

    # ── Specific SM64 locations ────────────────────────────────────────────
    (r"bob[- ]omb battlefield", ["field", "day"]),
    (r"whomp'?s fortress", ["mountain", "field", "day"]),
    (r"cool,? cool mountain", ["mountain", "snow", "winter"]),
    (r"big boo'?s haunt", ["indoor", "night"]),
    (r"hazy maze cave", ["cave", "dungeon", "indoor"]),
    (r"shifting sand land", ["desert"]),
    (r"dire,? dire docks", ["ocean", "cave"]),
    (r"snowman'?s land", ["snow", "winter"]),
    (r"wet[- ]dry world", ["river", "urban"]),
    (r"tall,? tall mountain", ["mountain", "day"]),
    (r"tiny[- ]huge island", ["field", "forest", "day"]),
    (r"tick tock clock", ["indoor"]),
    (r"rainbow ride", ["indoor"]),
    (r"inside the castle walls|castle (inside|interior|courtyard)", ["indoor"]),
    (r"castle grounds", ["field", "day"]),
    (r"bowser('?s)? .*(road|sky|fire)", ["dungeon", "indoor"]),
    (r"metal cap|wing cap|vanish cap", ["cave", "dungeon"]),
    (r"underground|secret slide", ["cave", "dungeon", "indoor"]),

    # ── Time-of-day hints in names ─────────────────────────────────────────
    (r"\bnight\b|nocturne", ["night"]),
    (r"\bday\b", ["day"]),
    (r"\bdawn\b|sunrise|morning", ["dawn"]),
    (r"\bdusk\b|sunset|evening|twilight", ["dusk"]),
]


def infer_tags(node: dict) -> list[str]:
    """Apply the rules to a node, returning a deduplicated sorted tag list."""
    haystack = (node.get("name") or "").lower()
    if node.get("region"):
        haystack += " " + node["region"].lower()

    tags: set[str] = set()
    for pattern, rule_tags in RULES:
        if re.search(pattern, haystack):
            tags.update(rule_tags)
    return sorted(tags)


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def die(msg: str) -> None:
    print(f"\nx  {msg}", file=sys.stderr)
    sys.exit(1)


def get_default_graph(base: str, slug: str) -> dict:
    r = requests.get(f"{base}/api/games/by-slug/{slug}", timeout=10)
    if not r.ok:
        die(f"Game lookup failed for slug={slug!r}: {r.status_code} {r.text}")
    game = r.json()
    if not game.get("default_graph_id"):
        die(f"Game {slug!r} has no default_graph_id set")

    r = requests.get(f"{base}/api/graphs/{game['default_graph_id']}", timeout=10)
    if not r.ok:
        die(f"Graph fetch failed: {r.status_code} {r.text}")
    return r.json()


def patch_tags(base: str, node_id: str, tags: list[str]) -> None:
    r = requests.patch(
        f"{base}/api/nodes/{node_id}",
        json={"ambient_tags": tags},
        timeout=10,
    )
    if not r.ok:
        die(f"PATCH /nodes/{node_id} failed: {r.status_code} {r.text}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+", help="One or more game slugs (e.g. oot sm64)")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--dry-run", action="store_true", help="Print proposed tags without writing")
    args = parser.parse_args()

    for slug in args.slugs:
        print(f"\n=== {slug} ===")
        graph = get_default_graph(args.base_url, slug)
        nodes = graph.get("nodes", [])
        print(f"  Graph: {graph['name']} ({len(nodes)} nodes)")

        tagged = 0
        untagged = 0
        for node in sorted(nodes, key=lambda n: n.get("name", "")):
            tags = infer_tags(node)
            name = node.get("name", "(unnamed)")
            region = node.get("region", "")
            region_str = f" [{region}]" if region else ""
            if tags:
                tagged += 1
                tag_str = ", ".join(tags)
                print(f"  + {name}{region_str:<18}  ->  {tag_str}")
                if not args.dry_run:
                    patch_tags(args.base_url, node["id"], tags)
            else:
                untagged += 1
                print(f"  . {name}{region_str:<18}  (no rule matched — left untagged)")

        verb = "would tag" if args.dry_run else "tagged"
        print(f"  -> {verb} {tagged} node(s); {untagged} left untagged")


if __name__ == "__main__":
    main()
