"""
Top-level agent orchestration using the Claude Agent SDK.

run_agent() is the single entry point called by the webhook handler.

Architecture:
  - Parent agent: handles routing and immediate acknowledgments.
    It has only the Agent tool — it delegates calendar and email work
    to specialist subagents rather than calling tools directly.
  - calendar-agent subagent: scoped to Composio Calendar MCP tools + calendar skill.
  - email-agent subagent: scoped to Composio Gmail MCP tools + email skill.

ACK streaming:
  When the parent delegates to a subagent, its first turn contains both an
  acknowledgment sentence and a tool_use block. We intercept that text and send
  it to the user immediately, so they get near-instant feedback while the
  subagent does the actual work. The final ResultMessage.result is sent as
  the complete reply.
"""
import asyncio
from pathlib import Path
from datetime import datetime
from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AgentDefinition,
    ResultMessage,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
)
from app.services.sendblue import SendbluePayload, send_message
from app.services.supermemory import add_memory
from app.agent.context import build_system_prompt
from app.db.database import (
    message_exists, insert_message, insert_usage,
    get_active_session, save_session,
    deactivate_current_session, list_past_sessions, set_active_session,
    insert_log,
)
from app.services.composio import get_mcp_config
from app.config import settings
from anthropic import Anthropic

# Sessions idle longer than this are auto-reset
SESSION_IDLE_HOURS = 8

# Project root — Agent SDK uses this to find .claude/skills/
PROJECT_ROOT = Path(__file__).resolve().parents[2]

HAIKU_MODEL = "claude-haiku-4-5-20251001"
_haiku_client = Anthropic(api_key=settings.anthropic_api_key)

MEMORY_EXTRACTION_PROMPT = """\
Given the following conversation exchange between a user and their AI assistant, \
extract any facts, preferences, decisions, or outcomes that are worth remembering \
long-term across future conversations.

Rules:
- Only extract durable, cross-session facts (e.g. preferences, personal details, \
  commitments, outcomes of completed tasks)
- Do NOT extract ephemeral logistics or things already tracked elsewhere
- If nothing is worth saving, respond with exactly: NOTHING
- Otherwise respond with one concise sentence per fact, one per line

User message: {user_msg}
Assistant reply: {assistant_reply}
"""

# ── Subagent definitions ──────────────────────────────────────────────────────

CALENDAR_AGENT = AgentDefinition(
    description=(
        "Handles ALL Google Calendar operations: checking what events are on the calendar "
        "for any date or date range, creating or scheduling meetings and events, finding "
        "free time slots, updating event details, and canceling events. "
        "Use this agent for any request that involves the calendar."
    ),
    prompt=(
        "You are a Google Calendar specialist. Complete the calendar task using your tools "
        "and return a concise plain-text summary suitable for iMessage. "
        "Do not use markdown. Keep your response to 1–3 lines unless a longer list is needed."
    ),
    tools=["mcp__composio-calendar__*"],
    model="sonnet",
    skills=["calendar"],
)

EMAIL_AGENT = AgentDefinition(
    description=(
        "Handles ALL Gmail operations: reading and summarizing emails, searching the inbox, "
        "sending new emails, drafting and sending replies, and checking for unread messages. "
        "Use this agent for any request that involves email."
    ),
    prompt=(
        "You are a Gmail specialist. Complete the email task using your tools "
        "and return a concise plain-text summary suitable for iMessage. "
        "Do not use markdown. Keep your response brief — sender, subject, and key point per email."
    ),
    tools=["mcp__composio-gmail__*"],
    model="sonnet",
    skills=["email"],
)


# ── Memory extraction ─────────────────────────────────────────────────────────

async def maybe_save_memory(user_msg: str, assistant_reply: str, parent_message_id: int) -> None:
    """
    Use a cheap Haiku call to extract memorable facts from an exchange
    and store them in Supermemory. Records token usage. Runs as a background task.
    """
    try:
        response = await asyncio.to_thread(
            _haiku_client.messages.create,
            model=HAIKU_MODEL,
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": MEMORY_EXTRACTION_PROMPT.format(
                        user_msg=user_msg,
                        assistant_reply=assistant_reply,
                    ),
                }
            ],
        )

        if response.usage:
            insert_usage(
                message_id=parent_message_id,
                model=HAIKU_MODEL,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        text = response.content[0].text.strip() if response.content else "NOTHING"
        if text == "NOTHING":
            return

        facts = [line.strip("- ").strip() for line in text.splitlines() if line.strip()]
        for fact in facts:
            if fact and fact != "NOTHING":
                await add_memory(fact, metadata={"source": "conversation"})
                insert_log("info", "memory.saved", "Saved memory fact", {"fact": fact})
    except Exception as e:
        try:
            insert_log("error", "memory.error", f"Error saving memory: {e}", {"error": str(e)})
        except Exception:
            pass


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def run_agent(payload: SendbluePayload) -> None:
    """
    Full agent pipeline for a single incoming iMessage.

    Flow:
      1. Validate + deduplicate, insert user message to DB
      2. Build system prompt with relevant memories
      3. Look up Agent SDK session_id for this user (None = new session)
      4. Stream query() — intercept first ACK text and send immediately if parent delegates
      5. On ResultMessage: save session_id, log usage, send final reply
      6. Persist assistant reply to DB, fire background memory extraction
    """
    if payload.is_outbound:
        return

    if payload.from_number != settings.user_phone_number:
        insert_log("warning", "agent.unauthorized", "Message from unknown number", {"from": payload.from_number})
        return

    if not payload.content.strip():
        return

    if payload.message_handle and message_exists(payload.message_handle):
        insert_log("info", "agent.duplicate", "Duplicate message skipped", {"handle": payload.message_handle})
        return

    # ── Zero-token session commands ───────────────────────────────────────────
    # Handled with pure string matching — no AI calls, no tokens consumed.
    cmd = payload.content.strip().lower()

    if cmd in ("reset", "new"):
        deactivate_current_session(payload.from_number)
        await send_message(
            to=payload.from_number,
            content="Done, starting fresh. Your saved memories still apply.",
        )
        return

    if cmd in ("resume s", "sessions", "s"):
        past = list_past_sessions(payload.from_number, limit=5)
        if not past:
            await send_message(
                to=payload.from_number,
                content="No past sessions to resume. You're already in your only session.",
            )
        else:
            lines = ["Past sessions — reply with the number to resume:"]
            for i, s in enumerate(past, 1):
                date = s["updated_at"][:10]
                preview = (s["preview"] or "no preview")[:50]
                lines.append(f"{i}. {date} — {preview}")
            await send_message(to=payload.from_number, content="\n".join(lines))
        return

    if cmd.startswith("resume ") and cmd[7:].strip().isdigit():
        n = int(cmd[7:].strip())
        past = list_past_sessions(payload.from_number, limit=5)
        if 1 <= n <= len(past):
            chosen = past[n - 1]
            set_active_session(payload.from_number, chosen["session_id"])
            date = chosen["updated_at"][:10]
            await send_message(
                to=payload.from_number,
                content=f"Resumed your session from {date}. Pick up where you left off.",
            )
        else:
            count = len(past)
            await send_message(
                to=payload.from_number,
                content=f"Pick a number between 1 and {count}.",
            )
        return
    # ─────────────────────────────────────────────────────────────────────────

    user_msg_id = insert_message(
        message_handle=payload.message_handle or None,
        from_number=payload.from_number,
        to_number=payload.to_number or settings.my_sendblue_number,
        content=payload.content,
        role="user",
        service=payload.service,
    )

    insert_log("info", "agent.message_received", "Processing message", {"from": payload.from_number, "preview": payload.content[:60]})

    try:
        system_prompt = await build_system_prompt(payload.content)

        # Resolve session — auto-reset if idle too long
        active = get_active_session(payload.from_number)
        if active:
            hours_idle = (
                datetime.now() - datetime.fromisoformat(active["updated_at"])
            ).total_seconds() / 3600
            if hours_idle >= SESSION_IDLE_HOURS:
                print(f"[session] Auto-reset after {hours_idle:.1f}h idle")
                deactivate_current_session(payload.from_number)
                session_id = None
            else:
                session_id = active["session_id"]
        else:
            session_id = None

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model="sonnet",
            resume=session_id,
            # Parent only has the Agent tool — it delegates, never calls MCP tools directly
            tools=["Agent"],
            # MCP servers are available to subagents (tools= in AgentDefinition scopes them)
            mcp_servers=get_mcp_config(),
            allowed_tools=["Agent"],
            agents={
                "calendar-agent": CALENDAR_AGENT,
                "email-agent": EMAIL_AGENT,
            },
            # Load project-level skills from .claude/skills/
            cwd=str(PROJECT_ROOT),
            setting_sources=["project"],
            max_turns=5,
            max_budget_usd=0.50,
        )

        ack_sent = False
        reply = None

        async for message in query(prompt=payload.content, options=options):

            # Intercept the parent's first turn for an immediate ACK.
            # Pattern: parent emits acknowledgment text + ToolUseBlock(name="Agent") in one turn.
            # We send the text immediately so the user knows we're on it.
            if isinstance(message, AssistantMessage) and not ack_sent:
                blocks = message.content or []
                has_delegation = any(
                    isinstance(b, ToolUseBlock) and b.name == "Agent"
                    for b in blocks
                )
                first_text = next(
                    (b.text.strip() for b in blocks if isinstance(b, TextBlock) and b.text.strip()),
                    None,
                )
                if first_text and has_delegation:
                    await send_message(to=payload.from_number, content=first_text)
                    print(f"[agent] ACK sent: '{first_text}'")
                    ack_sent = True

            if isinstance(message, ResultMessage):
                save_session(
                    payload.from_number,
                    message.session_id,
                    preview=payload.content[:60],
                )

                if message.usage:
                    u = message.usage
                    model_name = (
                        next(iter(message.model_usage), "claude-sonnet-4-6")
                        if message.model_usage else "claude-sonnet-4-6"
                    )
                    insert_usage(
                        message_id=user_msg_id,
                        model=model_name,
                        input_tokens=u.get("input_tokens", 0),
                        output_tokens=u.get("output_tokens", 0),
                    )
                    insert_log("info", "usage.logged", "Usage recorded", {
                        "cost_usd": round(message.total_cost_usd, 6),
                        "turns": message.num_turns,
                        "input_tokens": u.get("input_tokens", 0),
                        "output_tokens": u.get("output_tokens", 0),
                    })

                if message.subtype == "success":
                    reply = message.result

        if reply:
            await send_message(to=payload.from_number, content=reply)
            insert_log("info", "agent.reply_sent", "Reply sent", {"to": payload.from_number, "preview": reply[:60]})

            insert_message(
                message_handle=None,
                from_number=settings.my_sendblue_number,
                to_number=payload.from_number,
                content=reply,
                role="assistant",
                service="iMessage",
            )

            asyncio.create_task(maybe_save_memory(payload.content, reply, user_msg_id))
        else:
            await send_message(
                to=payload.from_number,
                content="Sorry, I wasn't able to complete that. Please try again.",
            )

    except Exception as e:
        insert_log("error", "agent.error", f"Error processing message: {e}", {"error": str(e), "from": payload.from_number})
        try:
            await send_message(
                to=payload.from_number,
                content="Sorry, I ran into an error. Please try again in a moment.",
            )
        except Exception:
            pass
