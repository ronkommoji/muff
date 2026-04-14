"""
Dashboard API routes — read-only views of messages, memories, and tools.
Also exposes a POST endpoint to kick off Composio OAuth flows.
"""
import base64
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from app.db.database import get_all_messages, get_recent_tool_calls, get_usage_summary
from app.services.supermemory import search_memories, list_memories
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


@router.get("/apps")
async def get_all_apps(request: Request):
    """All Composio apps with logos, merged with connected status."""
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
