"""
Composio service wrapper.

Provides MCP server configuration for the Claude Agent SDK, plus dashboard
helpers for app management and OAuth flows.

Tool execution is handled automatically by the Agent SDK via MCP — no manual
tool loop or AnthropicProvider needed.
"""
import httpx
from composio import Composio
from app.config import settings

_composio = Composio(api_key=settings.composio_api_key)

COMPOSIO_API_BASE = "https://backend.composio.dev/api/v1"

# Toolkits exposed to the agent via Composio MCP
TOOLKITS = ["GMAIL", "GOOGLECALENDAR"]


def get_mcp_config() -> dict:
    """
    Return MCP server configuration for the Claude Agent SDK.

    Composio exposes per-toolkit MCP endpoints. We connect to Gmail and
    Google Calendar separately so each can be loaded independently.

    Verify exact URLs from:
      composio.dev/toolkits/googlecalendar/framework/claude-agents-sdk
      composio.dev/toolkits/gmail/framework/claude-agents-sdk
    """
    headers = {
        "x-composio-api-key": settings.composio_api_key,
        "x-composio-user-id": settings.composio_user_id,
    }
    return {
        "composio-calendar": {
            "type": "http",
            "url": "https://mcp.composio.dev/googlecalendar",
            "headers": headers,
        },
        "composio-gmail": {
            "type": "http",
            "url": "https://mcp.composio.dev/gmail",
            "headers": headers,
        },
    }


def authorize_app(app: str, user_id: str | None = None) -> str:
    """
    Kick off OAuth for an app and return the redirect URL.
    The user visits this URL to grant access.
    """
    uid = user_id or settings.composio_user_id
    session = _composio.create(user_id=uid)
    connection_request = session.authorize(app.lower())
    return connection_request.redirect_url


def list_all_apps() -> list[dict]:
    """
    Return all apps available in Composio with logo, description, and category.
    Results are sorted: no_auth apps first (no connect needed), then alphabetically.
    """
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
    """
    Return connected accounts for this user by calling the Composio REST API
    directly — more reliable than the SDK's session.toolkits() iteration.
    """
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
