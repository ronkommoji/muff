"""
Cron job implementations.

NOTE: Scheduling is now handled by Convex (see dashboard-src/convex/crons.ts).
This file is kept only for the morning_briefing function which may be called
from the /internal/run-routine endpoint via Convex cron actions.
"""
import logging

logger = logging.getLogger(__name__)


async def morning_briefing() -> None:
    """
    Send a daily morning briefing to the user via the agent.
    Synthesizes an inbound message and runs the full agent pipeline,
    so the user receives an iMessage with their calendar + email summary.
    """
    from app.agent.runner import run_agent
    from app.services.sendblue import SendbluePayload
    from app.config import settings

    logger.info("[cron] Triggering morning briefing")
    payload = SendbluePayload(
        content=settings.morning_briefing_prompt,
        from_number=settings.user_phone_number,
        to_number=settings.my_sendblue_number,
        message_handle=None,
        is_outbound=False,
        service="iMessage",
    )
    try:
        await run_agent(payload)
        logger.info("[cron] Morning briefing sent")
    except Exception as e:
        logger.error(f"[cron] Morning briefing failed: {e}")
