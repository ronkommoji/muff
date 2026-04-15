"""
Convex-backed database layer.

Drop-in replacement for database.py — same function signatures,
delegates to Convex mutations/queries via the Python sync client.
"""
import json
from convex import ConvexClient
from app.config import settings

_client: ConvexClient | None = None


def _get_client() -> ConvexClient:
    global _client
    if _client is None:
        _client = ConvexClient(settings.convex_url)
    return _client


def init_db() -> None:
    """No-op: Convex manages its own schema."""
    _get_client()
    print(f"[db] Convex client initialized → {settings.convex_url}")


# ── Message helpers ───────────────────────────────────────────────────────────

def message_exists(message_handle: str) -> bool:
    return _get_client().query("messages:messageExists", {"messageHandle": message_handle})


def insert_message(
    message_handle: str | None,
    from_number: str,
    to_number: str,
    content: str,
    role: str,
    service: str = "iMessage",
) -> str:
    """Returns the Convex document ID (string) instead of an integer."""
    args: dict = {
        "fromNumber": from_number,
        "toNumber": to_number,
        "content": content,
        "role": role,
        "service": service,
    }
    if message_handle:
        args["messageHandle"] = message_handle
    return _get_client().mutation("messages:insertMessage", args)


def get_recent_messages(from_number: str, limit: int = 20) -> list[dict]:
    return _get_client().query(
        "messages:getRecentMessages",
        {"fromNumber": from_number, "limit": limit},
    )


def get_all_messages(limit: int = 100, offset: int = 0) -> list[dict]:
    return _get_client().query(
        "messages:getAllMessages",
        {"limit": limit, "offset": offset},
    )


# ── Tool call helpers ─────────────────────────────────────────────────────────

def insert_tool_call(
    message_id: str,
    tool_name: str,
    input_json: str,
    output_json: str,
) -> None:
    _get_client().mutation("toolCalls:insertToolCall", {
        "messageId": message_id,
        "toolName": tool_name,
        "inputJson": input_json,
        "outputJson": output_json,
    })


# ── Usage / cost helpers ──────────────────────────────────────────────────────

def insert_usage(message_id: str, model: str, input_tokens: int, output_tokens: int) -> None:
    args: dict = {
        "model": model,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
    }
    if message_id:
        args["messageId"] = message_id
    _get_client().mutation("usage:insertUsage", args)


def get_usage_summary() -> dict:
    return _get_client().query("usage:getSummary")


def get_recent_tool_calls(limit: int = 50) -> list[dict]:
    return _get_client().query("toolCalls:getRecent", {"limit": limit})


# ── Log helpers ───────────────────────────────────────────────────────────────

def insert_log(
    level: str,
    event_type: str,
    message: str,
    metadata: dict | None = None,
) -> None:
    args: dict = {
        "level": level,
        "eventType": event_type,
        "message": message,
    }
    if metadata is not None:
        args["metadata"] = json.dumps(metadata)
    _get_client().mutation("logs:insertLog", args)


def get_logs(
    limit: int = 100,
    offset: int = 0,
    level: str | None = None,
    event_type: str | None = None,
) -> list[dict]:
    result = _get_client().query("logs:list", {
        "limit": limit,
        "offset": offset,
        "level": level or "",
        "eventType": event_type or "",
    })
    return result["logs"]


def get_logs_total(level: str | None = None, event_type: str | None = None) -> int:
    result = _get_client().query("logs:list", {
        "limit": 1,
        "offset": 0,
        "level": level or "",
        "eventType": event_type or "",
    })
    return result["total"]


def get_log_event_types() -> list[str]:
    return _get_client().query("logs:getEventTypes")


# ── Analytics / chart helpers ─────────────────────────────────────────────────

def get_daily_cost(days: int = 30) -> list[dict]:
    return _get_client().query("usage:getDailyCost", {"days": days})


def get_messages_per_day(days: int = 30) -> list[dict]:
    return _get_client().query("messages:getMessagesPerDay", {"days": days})


def get_tool_usage_frequency(limit: int = 15) -> list[dict]:
    return _get_client().query("toolCalls:getToolUsageFrequency", {"limit": limit})


def get_messages_count_and_range() -> dict:
    return _get_client().query("messages:getMessagesStats")


# ── Routine / cron helpers ────────────────────────────────────────────────────

def list_crons() -> list[dict]:
    return _get_client().query("routines:list")


def get_cron(cron_id: str) -> dict | None:
    return _get_client().query("routines:get", {"id": cron_id})


def insert_cron(
    name: str,
    prompt: str,
    hour: int,
    minute: int,
    timezone: str,
    enabled: bool = True,
) -> str:
    """Returns the Convex document ID."""
    return _get_client().mutation("routines:insert", {
        "name": name,
        "prompt": prompt,
        "hour": hour,
        "minute": minute,
        "timezone": timezone,
        "enabled": enabled,
    })


def update_cron(
    cron_id: str,
    *,
    name: str | None = None,
    prompt: str | None = None,
    hour: int | None = None,
    minute: int | None = None,
    timezone: str | None = None,
    enabled: bool | None = None,
) -> bool:
    args: dict = {"id": cron_id}
    if name is not None:
        args["name"] = name
    if prompt is not None:
        args["prompt"] = prompt
    if hour is not None:
        args["hour"] = hour
    if minute is not None:
        args["minute"] = minute
    if timezone is not None:
        args["timezone"] = timezone
    if enabled is not None:
        args["enabled"] = enabled
    return _get_client().mutation("routines:update", args)


def delete_cron(cron_id: str) -> bool:
    return _get_client().mutation("routines:remove", {"id": cron_id})


def touch_cron_last_run(cron_id: str) -> None:
    _get_client().mutation("routines:markRun", {"id": cron_id})


# ── Session helpers ───────────────────────────────────────────────────────────

def get_active_session(phone_number: str) -> dict | None:
    return _get_client().query(
        "sessions:getActiveSession",
        {"phoneNumber": phone_number},
    )


def save_session(phone_number: str, session_id: str, preview: str | None = None) -> None:
    args: dict = {
        "phoneNumber": phone_number,
        "sessionId": session_id,
    }
    if preview is not None:
        args["preview"] = preview
    _get_client().mutation("sessions:saveSession", args)


def deactivate_current_session(phone_number: str) -> None:
    _get_client().mutation(
        "sessions:deactivateCurrentSession",
        {"phoneNumber": phone_number},
    )


def list_all_sessions(limit: int = 100) -> list[dict]:
    return _get_client().query("sessions:listAll", {"limit": limit})


def get_messages_for_session(session_id: str) -> list[dict]:
    return _get_client().query(
        "sessions:getSessionMessages",
        {"sessionId": session_id},
    )


def list_past_sessions(phone_number: str, limit: int = 5) -> list[dict]:
    return _get_client().query(
        "sessions:listPastSessions",
        {"phoneNumber": phone_number, "limit": limit},
    )


def set_active_session(phone_number: str, session_id: str) -> None:
    _get_client().mutation(
        "sessions:setActiveSession",
        {"phoneNumber": phone_number, "sessionId": session_id},
    )


# ── DB viewer helpers (limited compatibility) ────────────────────────────────

_TABLES = ["messages", "toolCalls", "usage", "sessions", "logs", "routines", "kv"]


def get_db_tables() -> list[str]:
    return list(_TABLES)


def get_table_schema(table_name: str) -> list[dict]:
    """Return a simplified schema description for the DB viewer."""
    from .schema_info import TABLE_SCHEMAS
    if table_name not in TABLE_SCHEMAS:
        raise ValueError(f"Unknown table: {table_name}")
    return TABLE_SCHEMAS[table_name]


def get_table_rows(
    table_name: str,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Generic row viewer — uses the appropriate Convex query."""
    if table_name not in _TABLES:
        raise ValueError(f"Unknown table: {table_name}")

    if table_name == "messages":
        rows = get_all_messages(limit=limit, offset=offset)
        stats = get_messages_count_and_range()
        return rows, stats["count"]
    elif table_name == "toolCalls":
        rows = get_recent_tool_calls(limit=limit)
        return rows, len(rows)
    elif table_name == "usage":
        summary = get_usage_summary()
        return summary.get("recent", [])[:limit], len(summary.get("recent", []))
    elif table_name == "sessions":
        rows = list_all_sessions(limit=limit)
        return rows, len(rows)
    elif table_name == "logs":
        result = _get_client().query("logs:list", {
            "limit": limit,
            "offset": offset,
        })
        return result["logs"], result["total"]
    elif table_name == "routines":
        rows = list_crons()
        return rows[offset : offset + limit], len(rows)
    elif table_name == "kv":
        return [], 0
    else:
        raise ValueError(f"Unknown table: {table_name}")
