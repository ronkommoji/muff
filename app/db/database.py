import os
import sqlite3
from pathlib import Path
from app.config import settings

_db: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


def init_db() -> None:
    global _db
    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    _db = sqlite3.connect(str(db_path), check_same_thread=False)
    _db.row_factory = sqlite3.Row
    _db.execute("PRAGMA journal_mode=WAL")
    _db.execute("PRAGMA foreign_keys=ON")

    schema_path = Path(__file__).parent / "schema.sql"
    _db.executescript(schema_path.read_text())
    _db.commit()

    print(f"[db] Initialized at {db_path.resolve()}")


# ── Message helpers ───────────────────────────────────────────────────────────

def message_exists(message_handle: str) -> bool:
    row = get_db().execute(
        "SELECT 1 FROM messages WHERE message_handle = ?", (message_handle,)
    ).fetchone()
    return row is not None


def insert_message(
    message_handle: str | None,
    from_number: str,
    to_number: str,
    content: str,
    role: str,
    service: str = "iMessage",
) -> int:
    db = get_db()
    cur = db.execute(
        """INSERT OR IGNORE INTO messages
           (message_handle, from_number, to_number, content, role, service)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (message_handle, from_number, to_number, content, role, service),
    )
    db.commit()
    return cur.lastrowid or 0


def get_recent_messages(from_number: str, limit: int = 20) -> list[dict]:
    rows = get_db().execute(
        """SELECT role, content, created_at FROM messages
           WHERE from_number = ? OR to_number = ?
           ORDER BY created_at DESC LIMIT ?""",
        (from_number, from_number, limit),
    ).fetchall()
    # Return in chronological order for the prompt
    return [dict(r) for r in reversed(rows)]


def get_all_messages(limit: int = 100, offset: int = 0) -> list[dict]:
    rows = get_db().execute(
        """SELECT id, message_handle, from_number, to_number, content, role, service, created_at
           FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?""",
        (limit, offset),
    ).fetchall()
    return [dict(r) for r in rows]


# ── Tool call helpers ─────────────────────────────────────────────────────────

def insert_tool_call(
    message_id: int,
    tool_name: str,
    input_json: str,
    output_json: str,
) -> None:
    db = get_db()
    db.execute(
        """INSERT INTO tool_calls (message_id, tool_name, input_json, output_json)
           VALUES (?, ?, ?, ?)""",
        (message_id, tool_name, input_json, output_json),
    )
    db.commit()


# ── Usage / cost helpers ──────────────────────────────────────────────────────

# Pricing per million tokens (as of April 2026)
_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6":        {"input": 3.00,  "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80,  "output": 4.00},
}
_DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    p = _PRICING.get(model, _DEFAULT_PRICING)
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000


def insert_usage(message_id: int, model: str, input_tokens: int, output_tokens: int) -> None:
    cost = calc_cost(model, input_tokens, output_tokens)
    db = get_db()
    db.execute(
        "INSERT INTO usage (message_id, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?)",
        (message_id, model, input_tokens, output_tokens, cost),
    )
    db.commit()


def get_usage_summary() -> dict:
    db = get_db()
    row = db.execute(
        "SELECT COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0) FROM usage"
    ).fetchone()
    total_cost, total_in, total_out = row[0], row[1], row[2]

    month_row = db.execute(
        "SELECT COALESCE(SUM(cost_usd),0) FROM usage WHERE created_at >= date('now','start of month')"
    ).fetchone()

    per_model = db.execute(
        "SELECT model, SUM(input_tokens), SUM(output_tokens), SUM(cost_usd), COUNT(*) FROM usage GROUP BY model"
    ).fetchall()

    recent = db.execute(
        """SELECT u.model, u.input_tokens, u.output_tokens, u.cost_usd, u.created_at,
                  m.content as message_preview
           FROM usage u LEFT JOIN messages m ON m.id = u.message_id
           ORDER BY u.created_at DESC LIMIT 50"""
    ).fetchall()

    return {
        "total_cost_usd": round(total_cost, 6),
        "month_cost_usd": round(month_row[0], 6),
        "total_input_tokens": total_in,
        "total_output_tokens": total_out,
        "per_model": [
            {
                "model": r[0],
                "input_tokens": r[1],
                "output_tokens": r[2],
                "cost_usd": round(r[3], 6),
                "calls": r[4],
            }
            for r in per_model
        ],
        "recent": [dict(r) for r in recent],
    }


def get_recent_tool_calls(limit: int = 50) -> list[dict]:
    rows = get_db().execute(
        """SELECT tc.id, tc.tool_name, tc.input_json, tc.output_json, tc.created_at,
                  m.content as message_content
           FROM tool_calls tc
           LEFT JOIN messages m ON m.id = tc.message_id
           ORDER BY tc.created_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


# ── Session helpers ───────────────────────────────────────────────────────────

def get_session_id(phone_number: str) -> str | None:
    row = get_db().execute(
        "SELECT session_id FROM sessions WHERE phone_number = ?", (phone_number,)
    ).fetchone()
    return row["session_id"] if row else None


def save_session_id(phone_number: str, session_id: str) -> None:
    db = get_db()
    db.execute(
        """INSERT INTO sessions (phone_number, session_id, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(phone_number) DO UPDATE SET
               session_id = excluded.session_id,
               updated_at = excluded.updated_at""",
        (phone_number, session_id),
    )
    db.commit()
