from __future__ import annotations

import random


def get_next_node(
    current_node_id: str,
    edges: list[dict],
    stay_probability: float,
    wander_history: list[str],
) -> str:
    """
    Determine the next node to visit during auto-wander.

    Args:
        current_node_id: ID of the node currently being visited.
        edges: List of edge dicts with keys: source_node_id, target_node_id, weight, bidirectional.
        stay_probability: Probability (0–1) of staying at the current node and re-looping the track.
        wander_history: Recently visited node IDs (most recent last, capped at 10).

    Returns:
        The ID of the next node to visit (may be current_node_id if staying or dead end).
    """
    # Step 1: stay check
    if random.random() < stay_probability:
        return current_node_id

    # Step 2: collect reachable neighbors with their base weights
    candidates: list[tuple[str, float]] = []
    for edge in edges:
        if edge["source_node_id"] == current_node_id:
            candidates.append((edge["target_node_id"], edge["weight"]))
        elif edge["bidirectional"] and edge["target_node_id"] == current_node_id:
            candidates.append((edge["source_node_id"], edge["weight"]))

    # Dead end — stay
    if not candidates:
        return current_node_id

    # Step 3: apply recency penalty using last 5 entries of history
    recency_window = wander_history[-5:]
    effective: list[tuple[str, float]] = []
    for node_id, base_weight in candidates:
        recency_count = recency_window.count(node_id)
        effective_weight = base_weight / (recency_count + 1)
        effective.append((node_id, effective_weight))

    # Step 4: weighted random sample
    node_ids = [n for n, _ in effective]
    weights = [w for _, w in effective]
    return random.choices(node_ids, weights=weights, k=1)[0]
