from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.db.base import Base
from backend.db.session import engine
from backend.api.routes import graphs, nodes, edges, audio, sessions

# Import models so SQLAlchemy registers them before create_all
import backend.models.graph  # noqa: F401

app = FastAPI(title="bgmscape API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphs.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(audio.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health():
    return {"status": "ok"}
