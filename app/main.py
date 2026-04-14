from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.db.database import init_db
from app.routes.webhook import router as webhook_router
from app.routes.dashboard import router as dashboard_router

app = FastAPI(title="Personal Agent", docs_url=None, redoc_url=None)

# Initialize DB on startup
@app.on_event("startup")
def on_startup():
    init_db()

# Mount API routes
app.include_router(webhook_router, prefix="/webhook")
app.include_router(dashboard_router, prefix="/api")

# Serve dashboard static files
_dashboard_dir = Path(__file__).parent / "dashboard"
app.mount("/static", StaticFiles(directory=str(_dashboard_dir)), name="static")

@app.get("/")
def root():
    return FileResponse(str(_dashboard_dir / "index.html"))
