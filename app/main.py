from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import logging

from app.db.convex_client import init_db
from app.routes.webhook import router as webhook_router
from app.routes.dashboard import router as dashboard_router
from app.config import settings

app = FastAPI(title="Personal Agent", docs_url=None, redoc_url=None)
logger = logging.getLogger(__name__)


# ── Startup / shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup() -> None:
    init_db()


# ── Internal endpoint for Convex cron callbacks ──────────────────────────────

@app.post("/internal/run-routine")
async def run_routine_internal(request: Request):
    """
    Called by Convex cron actions to trigger the agent pipeline.
    Accepts {"prompt": str, "routine_id": str | null}.
    """
    from app.agent.runner import run_agent
    from app.services.sendblue import SendbluePayload

    data = await request.json()
    prompt = data.get("prompt", "")
    if not prompt:
        return JSONResponse(status_code=400, content={"error": "prompt is required"})

    payload = SendbluePayload(
        content=prompt,
        from_number=settings.user_phone_number,
        to_number=settings.my_sendblue_number,
        message_handle=None,
        is_outbound=False,
        service="iMessage",
    )
    try:
        await run_agent(payload)
        return {"ok": True}
    except Exception as exc:
        logger.error("[internal] run-routine failed: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})


# ── Routes ─────────────────────────────────────────────────────────────────────

app.include_router(webhook_router, prefix="/webhook")
app.include_router(dashboard_router, prefix="/api")

_dashboard_dir = Path(__file__).parent / "dashboard"
_assets_dir = _dashboard_dir / "assets"

if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

app.mount("/static", StaticFiles(directory=str(_dashboard_dir)), name="static")


@app.get("/")
def root():
    return FileResponse(str(_dashboard_dir / "index.html"))
