"""
Dashboard API routes — read-only views of messages, memories, and tools.
Also exposes a POST endpoint to kick off Composio OAuth flows.

Data reads for messages, sessions, usage, logs, and routines now go through
Convex (via convex_client). Supermemory and Composio endpoints remain here
as REST since those are external services not migrated to Convex.
"""
import base64
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from app.db.convex_client import (
    get_all_messages, get_recent_tool_calls, get_usage_summary,
    get_logs, get_logs_total, get_log_event_types,
    get_db_tables, get_table_schema, get_table_rows,
    get_daily_cost, get_messages_per_day, get_tool_usage_frequency,
    get_messages_count_and_range,
    list_crons, get_cron, insert_cron, update_cron, delete_cron, touch_cron_last_run,
    list_all_sessions, get_messages_for_session,
)
from app.services.supermemory import search_memories, list_memories, get_graph
from app.services import composio as composio_svc
from app.config import settings

router = APIRouter()


def _check_auth(request: Request) -> None:
    """Enforce basic auth on dashboard API if DASHBOARD_PASSWORD is set."""
    if not settings.dashboard_password:
        return
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"})
    try:
        decoded = base64.b64decode(auth[6:]).decode()
        _, password = decoded.split(":", 1)
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if password != settings.dashboard_password:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/messages")
async def get_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    _check_auth(request)
    messages = get_all_messages(limit=limit, offset=offset)
    return {"messages": messages, "count": len(messages)}


@router.get("/tool-calls")
async def get_tool_calls(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    _check_auth(request)
    calls = get_recent_tool_calls(limit=limit)
    return {"tool_calls": calls, "count": len(calls)}


@router.get("/memories")
async def get_memories(
    request: Request,
    q: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=100),
):
    _check_auth(request)
    if q:
        snippets = await search_memories(q, limit=limit)
        return {"memories": [{"content": s} for s in snippets], "query": q}
    else:
        results = await list_memories(limit=limit)
        return {"memories": results}


@router.get("/graph")
async def get_memory_graph(
    request: Request,
    limit: int = Query(default=200, ge=1, le=500),
):
    _check_auth(request)
    try:
        data = await get_graph(limit=limit)
        return data
    except Exception as e:
        return JSONResponse(status_code=200, content={"documents": [], "edges": [], "totalCount": 0, "error": str(e)})


@router.get("/apps")
async def get_all_apps(request: Request):
    _check_auth(request)
    import asyncio

    try:
        all_apps, connected = await asyncio.gather(
            asyncio.to_thread(composio_svc.list_all_apps),
            asyncio.to_thread(composio_svc.list_connected_apps),
        )
    except Exception as e:
        return JSONResponse(status_code=200, content={"apps": [], "error": str(e)})

    connected_keys = {c["slug"].lower(): c for c in connected}
    for app in all_apps:
        conn = connected_keys.get(app["key"].lower())
        app["connected"] = bool(conn and conn.get("connected"))
        app["connection_id"] = conn["connection_id"] if conn else None

    return {"apps": all_apps}


@router.get("/usage")
async def get_usage(request: Request):
    _check_auth(request)
    return get_usage_summary()


@router.get("/tools")
async def get_tools(request: Request):
    _check_auth(request)
    try:
        apps = composio_svc.list_connected_apps()
    except Exception as e:
        return JSONResponse(status_code=200, content={"tools": [], "error": str(e)})
    return {"tools": apps}


@router.post("/tools/{app}/authorize")
async def authorize_tool(app: str, request: Request):
    _check_auth(request)
    try:
        url = composio_svc.authorize_app(app.upper())
        return {"app": app.upper(), "redirect_url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tools/{app}/test")
async def test_tool_connection(app: str, request: Request):
    """Test whether a connected app's OAuth token is functional."""
    _check_auth(request)
    import asyncio
    try:
        connected = await asyncio.to_thread(composio_svc.list_connected_apps)
    except Exception as e:
        return {"ok": False, "status": "error", "message": str(e)}

    match = next((c for c in connected if c["slug"].lower() == app.lower()), None)
    if not match:
        return {"ok": False, "status": "not_found", "message": "No connection found for this app."}

    import asyncio as aio
    result = await aio.to_thread(composio_svc.test_connection, app, match["connection_id"])
    return result


@router.post("/tools/{app}/reconnect")
async def reconnect_tool(app: str, request: Request):
    """Force-reauthorize a connected app by generating a fresh OAuth URL."""
    _check_auth(request)
    try:
        url = composio_svc.authorize_app(app.upper())
        return {"app": app.upper(), "redirect_url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Routines / cron jobs ──────────────────────────────────────────────────────

@router.get("/routines")
async def get_routines(request: Request):
    _check_auth(request)
    routines = list_crons()
    for routine in routines:
        routine["enabled"] = bool(routine.get("enabled", False))
        routine["next_run_at"] = None
    return {"routines": routines}


@router.post("/routines")
async def create_routine(request: Request):
    _check_auth(request)

    data = await request.json()
    name = (data.get("name") or "").strip()
    prompt = (data.get("prompt") or "").strip()
    timezone = (data.get("timezone") or "").strip()
    hour = int(data.get("hour", 8))
    minute = int(data.get("minute", 0))
    enabled = bool(data.get("enabled", True))

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")
    if not timezone:
        raise HTTPException(status_code=400, detail="Timezone is required.")
    if not (0 <= hour <= 23):
        raise HTTPException(status_code=400, detail="Hour must be between 0 and 23.")
    if not (0 <= minute <= 59):
        raise HTTPException(status_code=400, detail="Minute must be between 0 and 59.")

    routine_id = insert_cron(
        name=name,
        prompt=prompt,
        hour=hour,
        minute=minute,
        timezone=timezone,
        enabled=enabled,
    )
    routine = get_cron(routine_id)
    if not routine:
        raise HTTPException(status_code=500, detail="Failed to load created routine.")
    routine["enabled"] = bool(routine["enabled"])
    return {"routine": routine}


@router.patch("/routines/{routine_id}")
async def patch_routine(routine_id: str, request: Request):
    _check_auth(request)

    data = await request.json()
    kwargs: dict = {}

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        kwargs["name"] = name
    if "prompt" in data:
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt cannot be empty.")
        kwargs["prompt"] = prompt
    if "timezone" in data:
        timezone = (data.get("timezone") or "").strip()
        if not timezone:
            raise HTTPException(status_code=400, detail="Timezone cannot be empty.")
        kwargs["timezone"] = timezone
    if "hour" in data:
        hour = int(data.get("hour"))
        if not (0 <= hour <= 23):
            raise HTTPException(status_code=400, detail="Hour must be between 0 and 23.")
        kwargs["hour"] = hour
    if "minute" in data:
        minute = int(data.get("minute"))
        if not (0 <= minute <= 59):
            raise HTTPException(status_code=400, detail="Minute must be between 0 and 59.")
        kwargs["minute"] = minute
    if "enabled" in data:
        kwargs["enabled"] = bool(data.get("enabled"))

    updated = update_cron(routine_id, **kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="Routine not found or no changes applied.")

    routine = get_cron(routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found.")
    routine["enabled"] = bool(routine["enabled"])
    return {"routine": routine}


@router.delete("/routines/{routine_id}")
async def remove_routine(routine_id: str, request: Request):
    _check_auth(request)
    deleted = delete_cron(routine_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Routine not found.")
    return {"ok": True}


async def _run_routine_once(routine_id: str) -> None:
    from app.agent.runner import run_agent
    from app.services.sendblue import SendbluePayload

    routine = get_cron(routine_id)
    if not routine:
        return

    payload = SendbluePayload(
        content=routine["prompt"],
        from_number=settings.user_phone_number,
        to_number=settings.my_sendblue_number,
        message_handle=None,
        is_outbound=False,
        service="iMessage",
    )
    await run_agent(payload)
    touch_cron_last_run(routine_id)


@router.post("/routines/{routine_id}/run")
async def run_routine_now(routine_id: str, request: Request, background_tasks: BackgroundTasks):
    _check_auth(request)
    routine = get_cron(routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found.")
    background_tasks.add_task(_run_routine_once, routine_id)
    return {"ok": True}


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs")
async def get_logs_route(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    level: str = Query(default=""),
    event_type: str = Query(default=""),
):
    _check_auth(request)
    lvl = level.strip() or None
    evt = event_type.strip() or None
    logs = get_logs(limit=limit, offset=offset, level=lvl, event_type=evt)
    total = get_logs_total(level=lvl, event_type=evt)
    return {"logs": logs, "count": len(logs), "total": total}


@router.get("/logs/event-types")
async def get_log_event_types_route(request: Request):
    _check_auth(request)
    return {"event_types": get_log_event_types()}


# ── Charts ────────────────────────────────────────────────────────────────────

@router.get("/charts")
async def get_charts(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    _check_auth(request)
    summary = get_usage_summary()
    return {
        "daily_cost": get_daily_cost(days=days),
        "messages_per_day": get_messages_per_day(days=days),
        "tool_frequency": get_tool_usage_frequency(),
        "per_model": summary["per_model"],
    }


# ── Messages stats ─────────────────────────────────────────────────────────────

@router.get("/messages/stats")
async def get_messages_stats(request: Request):
    _check_auth(request)
    return get_messages_count_and_range()


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def get_sessions(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
):
    _check_auth(request)
    sessions = list_all_sessions(limit=limit)
    for s in sessions:
        s["is_active"] = bool(s.get("is_active", False))
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, request: Request):
    _check_auth(request)
    messages = get_messages_for_session(session_id)
    return {"messages": messages, "session_id": session_id, "count": len(messages)}


# ── DB viewer ─────────────────────────────────────────────────────────────────

@router.get("/db/tables")
async def db_list_tables(request: Request):
    _check_auth(request)
    return {"tables": get_db_tables()}


@router.get("/db/tables/{table_name}/schema")
async def db_table_schema(table_name: str, request: Request):
    _check_auth(request)
    try:
        columns = get_table_schema(table_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"table": table_name, "columns": columns}


@router.get("/db/tables/{table_name}/rows")
async def db_table_rows(
    table_name: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    _check_auth(request)
    try:
        rows, total = get_table_rows(table_name, limit=limit, offset=offset)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"table": table_name, "rows": rows, "total": total, "limit": limit, "offset": offset}
