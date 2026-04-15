from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.db.database import init_db
from app.routes.webhook import router as webhook_router
from app.routes.dashboard import router as dashboard_router
from app.config import settings

app = FastAPI(title="Personal Agent", docs_url=None, redoc_url=None)


# ── Startup / shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup() -> None:
    init_db()
    _start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    _stop_scheduler()


# ── Scheduler ─────────────────────────────────────────────────────────────────

_scheduler = None


def _start_scheduler() -> None:
    global _scheduler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from app.agent.crons import morning_briefing

    _scheduler = AsyncIOScheduler()

    if settings.morning_briefing_enabled:
        _scheduler.add_job(
            morning_briefing,
            CronTrigger(
                hour=settings.morning_briefing_hour,
                minute=settings.morning_briefing_minute,
                timezone=settings.morning_briefing_tz,
            ),
            id="morning_briefing",
            replace_existing=True,
        )
        print(
            f"[scheduler] Morning briefing scheduled at "
            f"{settings.morning_briefing_hour:02d}:{settings.morning_briefing_minute:02d} "
            f"{settings.morning_briefing_tz}"
        )

    _scheduler.start()
    print("[scheduler] Started")


def _stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[scheduler] Stopped")


# ── Routes ─────────────────────────────────────────────────────────────────────

app.include_router(webhook_router, prefix="/webhook")
app.include_router(dashboard_router, prefix="/api")

# Serve dashboard static files
_dashboard_dir = Path(__file__).parent / "dashboard"
app.mount("/static", StaticFiles(directory=str(_dashboard_dir)), name="static")


@app.get("/")
def root():
    return FileResponse(str(_dashboard_dir / "index.html"))
