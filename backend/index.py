"""Vercel FastAPI entrypoint; importing never migrates or provisions accounts."""

import os

if __package__:
    from .app.main import create_app
else:
    from app.main import create_app

if os.getenv("VERCEL") and os.getenv("APP_ENV") != "staging":
    raise RuntimeError("Deploys Vercel são exclusivos de homologação nesta versão.")

app = create_app()
