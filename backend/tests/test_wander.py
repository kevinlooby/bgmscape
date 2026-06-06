from __future__ import annotations

import pytest

from backend.services.wander import get_next_node, plan_path, plan_step

NODE_A = "node-a"
NODE_B = "node-b"
NODE_C = "node-c"
NODE_D = "node-d"
NODE_H = "node-h"  # hub-style node

EDGE_AB = {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True}
EDGE_BC = {"source_node_id": NODE_B, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True}
EDGE_AB_UNI = {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": False}


# ── Back-compat tests for the get_next_node shim ──────────────────────────────


def test_dead_end_returns_current():
    result = get_next_node(NODE_A, [], wander_history=[])
    assert result == NODE_A


def test_single_neighbor_always_picked():
    results = {get_next_node(NODE_A, [EDGE_AB], wander_history=[]) for _ in range(20)}
    assert results == {NODE_B}


def test_bidirectional_traversable_both_ways():
    # B → A via bidirectional edge (B is target, A is source)
    results = {get_next_node(NODE_B, [EDGE_AB], wander_history=[]) for _ in range(20)}
    assert NODE_A in results


def test_unidirectional_not_traversable_in_reverse():
    # A→B unidirectional: from B there are no reachable nodes → dead end
    result = get_next_node(NODE_B, [EDGE_AB_UNI], wander_history=[])
    assert result == NODE_B


def test_recency_penalty_reduces_probability():
    # NODE_B has been visited recently; NODE_C has not. Under the new
    # novelty rules the recently-visited node is hard-avoided while a
    # fresh alternative exists, so C wins every time (stronger than the
    # old soft-bias behavior the test was originally written for).
    edge_ac = {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": False}
    history = [NODE_B, NODE_B, NODE_B, NODE_B, NODE_B]
    results = [get_next_node(NODE_A, [EDGE_AB, edge_ac], wander_history=history) for _ in range(100)]
    assert results.count(NODE_C) > results.count(NODE_B) * 2


def test_multiple_edges_sampled_over_runs():
    edge_ac = {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": False}
    results = {get_next_node(NODE_A, [EDGE_AB, edge_ac], wander_history=[]) for _ in range(50)}
    assert NODE_B in results
    assert NODE_C in results


# ── New plan_step tests ───────────────────────────────────────────────────────


def test_plan_step_prefers_unvisited():
    """On a clique with one visited node, the next pick is always fresh."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
    ]
    visited = {NODE_A}
    last_seen = {NODE_A: 1}
    results = {plan_step(NODE_A, edges, visited, last_seen) for _ in range(50)}
    assert results == {NODE_B, NODE_C}  # never A; both fresh options reached


def test_plan_step_hard_avoid_when_alternatives():
    """If one neighbor is visited and another is fresh, the visited one is never picked."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
    ]
    visited = {NODE_A, NODE_B}
    last_seen = {NODE_A: 1, NODE_B: 2}
    for _ in range(50):
        assert plan_step(NODE_A, edges, visited, last_seen) == NODE_C


def test_plan_step_lru_fallback_when_all_visited():
    """When every reachable neighbor is visited, pick the oldest by step index."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
    ]
    # B was visited at step 5, C at step 2 → C is older, C wins LRU.
    visited = {NODE_A, NODE_B, NODE_C}
    last_seen = {NODE_A: 1, NODE_B: 5, NODE_C: 2}
    for _ in range(50):
        assert plan_step(NODE_A, edges, visited, last_seen) == NODE_C


def test_plan_step_lru_tiebreak_by_weight():
    """Tie on last_visited_step → weighted random across the tied set."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
    ]
    visited = {NODE_A, NODE_B, NODE_C}
    last_seen = {NODE_A: 1, NODE_B: 2, NODE_C: 2}  # B and C tied at step 2
    results = {plan_step(NODE_A, edges, visited, last_seen) for _ in range(50)}
    assert results == {NODE_B, NODE_C}


# ── New plan_path tests ───────────────────────────────────────────────────────


def test_plan_path_visits_all_in_clique():
    """4-node clique, horizon=3 starting from A → visits B, C, D in some order, no repeats."""
    nodes = [NODE_A, NODE_B, NODE_C, NODE_D]
    edges = []
    for i, src in enumerate(nodes):
        for dst in nodes[i + 1:]:
            edges.append({"source_node_id": src, "target_node_id": dst, "weight": 1.0, "bidirectional": True})

    path = plan_path(NODE_A, edges, visited={NODE_A}, last_visited_step={NODE_A: 1}, start_step=2, horizon=3)
    assert len(path) == 3
    assert sorted(path) == sorted([NODE_B, NODE_C, NODE_D])


def test_plan_path_traverses_chokepoint_correctly():
    """Hub H connected to four leaves A, B, C, D — starting at H, the path
    should interleave H with each leaf rather than pile up on one branch.

    The leaves are dead ends (only connected to H), so the path must look
    like H→leaf→H→leaf→… with all four leaves visited before any repeat.
    """
    leaves = [NODE_A, NODE_B, NODE_C, NODE_D]
    edges = [
        {"source_node_id": NODE_H, "target_node_id": leaf, "weight": 1.0, "bidirectional": True}
        for leaf in leaves
    ]
    # 8 steps from H: leaf, H, leaf, H, leaf, H, leaf, H
    path = plan_path(NODE_H, edges, visited={NODE_H}, last_visited_step={NODE_H: 1}, start_step=2, horizon=8)
    assert len(path) == 8
    # Steps 0, 2, 4, 6 are leaves; 1, 3, 5, 7 are H (the only way back).
    leaf_positions = [path[i] for i in (0, 2, 4, 6)]
    hub_positions = [path[i] for i in (1, 3, 5, 7)]
    assert sorted(leaf_positions) == sorted(leaves)  # all four leaves visited exactly once
    assert hub_positions == [NODE_H, NODE_H, NODE_H, NODE_H]


def test_plan_path_lru_rotation_after_exhaustion():
    """Once every neighbor has been visited, the planner cycles oldest-first."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_D, "weight": 1.0, "bidirectional": True},
    ]
    visited = {NODE_A, NODE_B, NODE_C, NODE_D}
    # Oldest first: B (step 2), C (step 3), D (step 4)
    last_seen = {NODE_A: 1, NODE_B: 2, NODE_C: 3, NODE_D: 4}
    path = plan_path(NODE_A, edges, visited, last_seen, start_step=5, horizon=3)
    # First pick is the oldest neighbor (B); the planner then advances to B,
    # whose only reachable neighbor is A (already the most-recently-visited
    # after we left it). The cycle continues: A → B → A → C? No — from B
    # the only neighbor is A, so path[1] = A. From A again the choices are
    # B/C/D with B now being newest (just visited at step 5), so the next
    # oldest is C (step 3). So expected: [B, A, C].
    assert path[0] == NODE_B
    assert path[1] == NODE_A
    assert path[2] == NODE_C


def test_plan_path_dead_end_truncates():
    """If we hit a dead end mid-plan the path stops short of `horizon`."""
    # A → B unidirectional only, no other edges. B has nowhere to go.
    edges = [EDGE_AB_UNI]
    path = plan_path(NODE_A, edges, visited={NODE_A}, last_visited_step={NODE_A: 1}, start_step=2, horizon=5)
    # Step 1: A → B. Step 2: B has no reachable neighbors → plan_step returns B,
    # plan_path breaks. So path is just [B].
    assert path == [NODE_B]


def test_plan_path_zero_horizon_returns_empty():
    assert plan_path(NODE_A, [EDGE_AB], visited=set(), last_visited_step={}, start_step=0, horizon=0) == []


def test_plan_path_does_not_mutate_inputs():
    """Caller's visited / last_visited_step must not change after plan_path."""
    edges = [
        {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True},
        {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True},
    ]
    visited = {NODE_A}
    last_seen = {NODE_A: 1}
    plan_path(NODE_A, edges, visited, last_seen, start_step=2, horizon=2)
    assert visited == {NODE_A}
    assert last_seen == {NODE_A: 1}
