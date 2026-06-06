"""
Wander engine — picks the next node during auto-traversal.

Two design rules drive the algorithm:

1. **Novelty preferred, revisits hard-avoided.** While any reachable neighbor
   has never been visited in this session, we won't pick a visited one. This
   stops the wander from getting stuck in 2- or 3-node loops on small graphs.

2. **LRU fallback when everything's been seen.** Once all reachable neighbors
   are already in the session's visited set, we pick whichever one was visited
   longest ago (smallest `last_visited_step` value). Ties are broken by
   edge weight via weighted random sample so dense / heavily-weighted edges
   still bias slightly.

The public API is two pure functions:

- ``plan_step``: pick exactly one next node from a current position.
- ``plan_path``: pick a horizon-N path by repeated ``plan_step`` calls,
  updating a *local* scratch copy of the visited / last-visited state between
  iterations so the plan doesn't re-pick the same novel node every step.

``get_next_node`` is preserved as a thin back-compat shim — older call sites
and the original test suite go through it. New code should call ``plan_step``
or ``plan_path`` directly.
"""

from __future__ import annotations

import random


def _reachable_neighbors(
    current_node_id: str,
    edges: list[dict],
) -> list[tuple[str, float]]:
    """Return list of (neighbor_id, edge_weight) reachable from current_node_id."""
    out: list[tuple[str, float]] = []
    for edge in edges:
        if edge["source_node_id"] == current_node_id:
            out.append((edge["target_node_id"], edge["weight"]))
        elif edge["bidirectional"] and edge["target_node_id"] == current_node_id:
            out.append((edge["source_node_id"], edge["weight"]))
    return out


def plan_step(
    current_node_id: str,
    edges: list[dict],
    visited: set[str],
    last_visited_step: dict[str, int],
) -> str:
    """
    Pick the next node from current_node_id under novelty + LRU rules.

    Args:
        current_node_id: Where we are now.
        edges: All edges in the graph (source_node_id, target_node_id, weight,
            bidirectional). Filtered internally to those touching current.
        visited: Node IDs already visited this session. The starting node is
            considered visited (sessions seed this on create).
        last_visited_step: Node ID -> step index when each visited node was
            last seen. Used for LRU fallback. Step indices are monotonic
            within a session; values can be compared directly.

    Returns:
        The chosen next node's ID. If current_node_id is a true dead end
        (no outgoing or bidirectional edges), returns current_node_id —
        the engine just stays put.
    """
    candidates = _reachable_neighbors(current_node_id, edges)
    if not candidates:
        return current_node_id

    # Partition: anything not in `visited` is a fresh pick.
    fresh = [(nid, w) for nid, w in candidates if nid not in visited]
    if fresh:
        return _weighted_sample(fresh)

    # All neighbors visited → LRU. Smallest last_visited_step wins.
    # If a neighbor somehow isn't in last_visited_step (shouldn't happen
    # given how the caller maintains state, but defensive), treat it as
    # never visited and prefer it strongly by using -1.
    min_step = min(last_visited_step.get(nid, -1) for nid, _ in candidates)
    oldest = [(nid, w) for nid, w in candidates if last_visited_step.get(nid, -1) == min_step]
    return _weighted_sample(oldest)


def plan_path(
    current_node_id: str,
    edges: list[dict],
    visited: set[str],
    last_visited_step: dict[str, int],
    start_step: int,
    horizon: int,
) -> list[str]:
    """
    Generate a horizon-step path starting *after* current_node_id.

    The returned list does NOT include current_node_id — it's the sequence
    of next steps. We maintain our own local copies of `visited` and
    `last_visited_step` so each simulated step updates the planning context,
    otherwise the planner would keep picking the same novel neighbor over
    and over.

    Greedy: at each step we just call ``plan_step``. Not globally optimal,
    but on graphs of this size (typically < 60 nodes) the result is a tour
    that visits all reachable fresh nodes before any LRU rotation kicks in.

    Args:
        current_node_id: Position we're planning from.
        edges: All edges in the graph.
        visited: Session-level visited set (will not be mutated).
        last_visited_step: Session-level LRU map (will not be mutated).
        start_step: Step counter to assign to the *first* planned step.
            Subsequent simulated steps increment by 1.
        horizon: Number of steps to plan.

    Returns:
        List of node IDs, length up to ``horizon``. May be shorter if a
        dead-end loop occurs (the planner returns when plan_step returns
        the same node it was called with — true dead end).
    """
    if horizon <= 0:
        return []

    sim_visited = set(visited)
    sim_lru = dict(last_visited_step)
    step = start_step
    current = current_node_id
    path: list[str] = []

    for _ in range(horizon):
        nxt = plan_step(current, edges, sim_visited, sim_lru)
        if nxt == current:
            # Dead end — stop planning rather than emit an infinite loop of
            # the same node.
            break
        path.append(nxt)
        sim_visited.add(nxt)
        sim_lru[nxt] = step
        step += 1
        current = nxt

    return path


def _weighted_sample(candidates: list[tuple[str, float]]) -> str:
    """Pick one (id, weight) entry weighted by weight. Falls back to uniform if all weights are <= 0."""
    ids = [nid for nid, _ in candidates]
    weights = [w for _, w in candidates]
    if not any(w > 0 for w in weights):
        return random.choice(ids)
    return random.choices(ids, weights=weights, k=1)[0]


# ── Back-compat shim ──────────────────────────────────────────────────────────


def get_next_node(
    current_node_id: str,
    edges: list[dict],
    wander_history: list[str],
) -> str:
    """
    Legacy single-step picker. Kept for back-compat with the original test
    suite and any call sites that haven't moved to plan_step yet.

    The old contract was: bias against nodes appearing in the recent
    wander_history. We translate that into the new framework by treating
    every distinct node in wander_history as "visited" and using their
    position in the list as a proxy for last_visited_step (later position =
    more recent = higher step index).

    The resulting behavior is stronger than the old recency-count penalty:
    a recently-visited neighbor is now hard-avoided when a fresh alternative
    exists, instead of just being weighted lower. This is intentional —
    matches the new wander rules — but means tests that relied on the old
    soft-bias semantics need updating (see test_wander.py).
    """
    visited: set[str] = set()
    last_visited_step: dict[str, int] = {}
    for i, node_id in enumerate(wander_history):
        visited.add(node_id)
        last_visited_step[node_id] = i  # later list position = more recent
    return plan_step(current_node_id, edges, visited, last_visited_step)
