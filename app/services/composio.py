"""
Composio service wrapper.

Uses the composio + composio_anthropic packages to provide Claude-compatible
tool definitions for Gmail, Google Calendar, and any other connected apps.
"""
import httpx
from composio import Composio
from composio_anthropic import AnthropicProvider
from app.config import settings

_composio = Composio(
    api_key=settings.composio_api_key,
    provider=AnthropicProvider(),
)

COMPOSIO_API_BASE = "https://backend.composio.dev/api/v1"

# Apps we want to expose as tools to the agent
APPS = ["GMAIL", "GOOGLECALENDAR"]


def get_tools(user_id: str | None = None) -> list:
    """Return Claude-format tool definitions for all connected apps."""
    uid = user_id or settings.composio_user_id
    session = _composio.create(user_id=uid)
    return session.tools()


def handle_tool_calls(response, user_id: str | None = None) -> list:
    """Execute tool calls from a Claude response and return tool_result blocks."""
    uid = user_id or settings.composio_user_id
    return _composio.provider.handle_tool_calls(user_id=uid, response=response)


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
