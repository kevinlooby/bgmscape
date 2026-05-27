from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.services.wander import get_next_node

NODE_A = "node-a"
NODE_B = "node-b"
NODE_C = "node-c"

EDGE_AB = {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": True}
EDGE_BC = {"source_node_id": NODE_B, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": True}
EDGE_AB_UNI = {"source_node_id": NODE_A, "target_node_id": NODE_B, "weight": 1.0, "bidirectional": False}


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
    # NODE_B has been visited 5 times recently; NODE_C has not.
    # From NODE_A with edges to both B and C (equal base weight),
    # C should be chosen most of the time after recency penalty on B.
    edge_ac = {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": False}
    history = [NODE_B, NODE_B, NODE_B, NODE_B, NODE_B]
    results = [get_next_node(NODE_A, [EDGE_AB, edge_ac], wander_history=history) for _ in range(100)]
    c_count = results.count(NODE_C)
    b_count = results.count(NODE_B)
    # C should be chosen significantly more than B (recency penalty halves B's weight per visit)
    assert c_count > b_count * 2


def test_multiple_edges_sampled_over_runs():
    results = {get_next_node(NODE_A, [EDGE_AB, {"source_node_id": NODE_A, "target_node_id": NODE_C, "weight": 1.0, "bidirectional": False}],
                             wander_history=[]) for _ in range(50)}
    assert NODE_B in results
    assert NODE_C in results
