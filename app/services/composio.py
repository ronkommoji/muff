"""
Composio service wrapper.

Provides MCP server configuration for the Claude Agent SDK, plus dashboard
helpers for app management and OAuth flows.
"""
import httpx
from composio import Composio
from app.config import settings

_composio = Composio(api_key=settings.composio_api_key)

COMPOSIO_API_BASE = "https://backend.composio.dev/api/v1"

TOOLKITS = ["GMAIL", "GOOGLECALENDAR"]

_mcp_config: dict | None = None


def _log(level: str, event: str, message: str, metadata: dict | None = None) -> None:
    print(f"[composio] {message}", flush=True)
    try:
        from app.db.convex_client import insert_log
        insert_log(level, event, message, metadata)
    except Exception:
        pass


def get_mcp_config() -> dict:
    """
    Return MCP server config for the Claude Agent SDK.

    Uses session.mcp which gives a single URL with all connected tools.
    Subagents scope their tools via the `tools` pattern in AgentDefinition.
    """
    global _mcp_config
    if _mcp_config is not None:
        return _mcp_config

    session = _composio.create(user_id=settings.composio_user_id)
    url = session.mcp.url
    headers = session.mcp.headers

    _mcp_config = {
        "composio": {
            "type": "http",
            "url": url,
            "headers": headers,
        },
    }
    _log("info", "composio.mcp_ready", f"MCP server ready: {url[:80]}...", {"url": url})
    return _mcp_config


def authorize_app(app: str, user_id: str | None = None) -> str:
    uid = user_id or settings.composio_user_id
    session = _composio.create(user_id=uid)
    connection_request = session.authorize(app.lower())
    _log("info", "composio.oauth_started", f"OAuth started for {app}", {"app": app})
    return connection_request.redirect_url


def test_connection(app_key: str, connection_id: str) -> dict:
    headers = {"x-api-key": settings.composio_api_key}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{COMPOSIO_API_BASE}/connectedAccounts/{connection_id}",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        status = data.get("status", "unknown")
        if status == "ACTIVE":
            return {"ok": True, "status": status, "message": "Connection is active and healthy."}
        elif status == "EXPIRED":
            return {"ok": False, "status": status, "message": "Token expired. Reconnect to reauthorize."}
        else:
            return {"ok": False, "status": status, "message": f"Connection status: {status}. May need reauthorization."}
    except Exception as e:
        return {"ok": False, "status": "error", "message": str(e)}


def list_all_apps() -> list[dict]:
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{COMPOSIO_API_BASE}/apps",
            headers={"x-api-key": settings.composio_api_key},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    result = []
    for app in items:
        if not app.get("enabled", True):
            continue
        result.append({
            "key": app.get("key", ""),
            "displayName": app.get("displayName") or app.get("name", ""),
            "description": app.get("description", ""),
            "logo": app.get("logo", ""),
            "categories": app.get("categories", []),
            "no_auth": app.get("no_auth", False),
            "actionsCount": app.get("meta", {}).get("actionsCount", 0),
        })

    result.sort(key=lambda a: a["displayName"].lower())
    return result


def list_connected_apps(user_id: str | None = None) -> list[dict]:
    uid = user_id or settings.composio_user_id
    headers = {"x-api-key": settings.composio_api_key}

    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{COMPOSIO_API_BASE}/connectedAccounts",
            headers=headers,
            params={"user_uuid": uid, "showActiveOnly": "false"},
        )
        resp.raise_for_status()
        data = resp.json()

    accounts = data.get("items", [])
    result = []
    for acct in accounts:
        result.append({
            "slug": acct.get("appName", acct.get("integrationId", "unknown")),
            "connected": acct.get("status") == "ACTIVE",
            "connection_id": acct.get("id"),
            "status": acct.get("status", "unknown"),
        })
    return result
