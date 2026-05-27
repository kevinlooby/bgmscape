"""Tests for the Game entity and default-graph constraints.

These tests use an in-memory SQLite DB so they don't touch the real ./bgmscape.db.
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
    """Spin up a fresh in-memory DB per test and override the dep injection."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Import models so create_all sees them.
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


def test_create_game_with_valid_slug(client):
    r = client.post("/api/games", json={"name": "Ocarina of Time", "slug": "oot"})
    assert r.status_code == 201
    body = r.json()
    assert body["slug"] == "oot"
    assert body["name"] == "Ocarina of Time"
    assert body["default_graph_id"] is None
    assert body["graphs"] == []


def test_create_game_rejects_invalid_slug(client):
    r = client.post("/api/games", json={"name": "Bad", "slug": "Has Caps!"})
    assert r.status_code == 422


def test_create_game_rejects_duplicate_slug(client):
    client.post("/api/games", json={"name": "A", "slug": "dup"})
    r = client.post("/api/games", json={"name": "B", "slug": "dup"})
    assert r.status_code == 409


def test_creating_a_graph_under_a_game_sets_default(client):
    game = client.post("/api/games", json={"name": "G", "slug": "g"}).json()
    graph = client.post("/api/graphs", json={"name": "v1", "game_id": game["id"]}).json()
    fresh = client.get(f"/api/games/{game['id']}").json()
    assert fresh["default_graph_id"] == graph["id"]
    # A second graph under the same game should NOT replace the default.
    graph2 = client.post("/api/graphs", json={"name": "v2", "game_id": game["id"]}).json()
    fresh2 = client.get(f"/api/games/{game['id']}").json()
    assert fresh2["default_graph_id"] == graph["id"]
    # Both graphs appear in the game's graph list, with is_default reflecting reality.
    by_id = {g["id"]: g for g in fresh2["graphs"]}
    assert by_id[graph["id"]]["is_default"] is True
    assert by_id[graph2["id"]]["is_default"] is False


def test_setting_default_to_graph_from_another_game_is_rejected(client):
    game_a = client.post("/api/games", json={"name": "A", "slug": "a"}).json()
    game_b = client.post("/api/games", json={"name": "B", "slug": "b"}).json()
    graph_in_b = client.post("/api/graphs", json={"name": "b1", "game_id": game_b["id"]}).json()

    # Try to set game_a's default to a graph that lives under game_b.
    r = client.patch(f"/api/games/{game_a['id']}", json={"default_graph_id": graph_in_b["id"]})
    assert r.status_code == 400


def test_setting_default_to_graph_in_same_game_is_accepted(client):
    game = client.post("/api/games", json={"name": "G", "slug": "g"}).json()
    g1 = client.post("/api/graphs", json={"name": "v1", "game_id": game["id"]}).json()
    g2 = client.post("/api/graphs", json={"name": "v2", "game_id": game["id"]}).json()
    # v1 is the auto-assigned default; switch to v2.
    r = client.patch(f"/api/games/{game['id']}", json={"default_graph_id": g2["id"]})
    assert r.status_code == 200
    assert r.json()["default_graph_id"] == g2["id"]
    # Sanity: previous default was v1
    assert g1["id"] != g2["id"]


def test_list_graphs_filters_by_game(client):
    game_a = client.post("/api/games", json={"name": "A", "slug": "a"}).json()
    game_b = client.post("/api/games", json={"name": "B", "slug": "b"}).json()
    client.post("/api/graphs", json={"name": "a1", "game_id": game_a["id"]})
    client.post("/api/graphs", json={"name": "b1", "game_id": game_b["id"]})
    client.post("/api/graphs", json={"name": "b2", "game_id": game_b["id"]})

    a_list = client.get("/api/graphs", params={"game_id": game_a["id"]}).json()
    b_list = client.get("/api/graphs", params={"game_id": game_b["id"]}).json()
    assert {g["name"] for g in a_list} == {"a1"}
    assert {g["name"] for g in b_list} == {"b1", "b2"}


def test_get_game_by_slug(client):
    client.post("/api/games", json={"name": "Super Mario 64", "slug": "sm64"})
    r = client.get("/api/games/by-slug/sm64")
    assert r.status_code == 200
    assert r.json()["name"] == "Super Mario 64"
    assert client.get("/api/games/by-slug/nope").status_code == 404


def test_import_graph_resolves_or_creates_game_from_slug(client):
    # No game exists yet — import should create one.
    payload = {
        "version": "1",
        "name": "Imported Graph",
        "game_slug": "test-game",
        "game_title": "Test Game",
        "nodes": [],
        "edges": [],
    }
    r = client.post("/api/graphs/import", json=payload)
    assert r.status_code == 201
    graph = r.json()
    assert graph["game_id"] is not None

    # The game now exists with slug=test-game and default_graph_id set to this graph.
    game = client.get("/api/games/by-slug/test-game").json()
    assert game["default_graph_id"] == graph["id"]
    assert game["name"] == "Test Game"
