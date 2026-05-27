"""Tests for Node-level fields (currently focused on is_transition).

Uses an in-memory SQLite DB to avoid touching ./bgmscape.db.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.api.deps import get_db
from backend.main import app


@pytest.fixture()
def client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import backend.models.graph  # noqa: F401
    Base.metadata.create_all(bind=test_engine)
    TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

    def _override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_graph(client):
    game = client.post("/api/games", json={"name": "G", "slug": "g"}).json()
    graph = client.post("/api/graphs", json={"name": "v1", "game_id": game["id"]}).json()
    return graph


def test_node_is_transition_defaults_to_false(client):
    graph = _make_graph(client)
    r = client.post(
        f"/api/graphs/{graph['id']}/nodes",
        json={"name": "Castle Grounds"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["is_transition"] is False


def test_node_is_transition_round_trips(client):
    graph = _make_graph(client)
    # Create with the flag set to True.
    create = client.post(
        f"/api/graphs/{graph['id']}/nodes",
        json={"name": "Course Clear", "is_transition": True},
    )
    assert create.status_code == 201
    node_id = create.json()["id"]
    assert create.json()["is_transition"] is True

    # Re-fetching the graph carries the flag through on the embedded node.
    fresh = client.get(f"/api/graphs/{graph['id']}").json()
    nodes_by_id = {n["id"]: n for n in fresh["nodes"]}
    assert nodes_by_id[node_id]["is_transition"] is True


def test_node_is_transition_can_be_toggled_via_patch(client):
    graph = _make_graph(client)
    node = client.post(
        f"/api/graphs/{graph['id']}/nodes",
        json={"name": "Lobby"},
    ).json()
    assert node["is_transition"] is False

    r = client.patch(f"/api/nodes/{node['id']}", json={"is_transition": True})
    assert r.status_code == 200
    assert r.json()["is_transition"] is True

    # And back off again.
    r = client.patch(f"/api/nodes/{node['id']}", json={"is_transition": False})
    assert r.status_code == 200
    assert r.json()["is_transition"] is False
