# api/index.py — Vercel Python serverless entrypoint
#
# Vercel's @vercel/python builder looks for a file matching the "src" pattern
# in vercel.json. It imports this module and exposes the top-level `app`
# (an ASGI application) as the handler.
#
# We re-export the FastAPI `app` instance from backend/main.py so all
# business logic stays in one place.

import sys
import os

# Ensure the backend/ directory is on the import path so `from main import app`
# resolves to backend/main.py regardless of where Vercel invokes this file.
_backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(_backend_dir))

from main import app  # noqa: F401  — re-exported as the ASGI handler
