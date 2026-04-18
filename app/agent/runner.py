"""
Top-level agent orchestration using the Claude Agent SDK.

run_agent() is the single entry point called by the webhook handler.

Architecture:
  - Parent agent: routes and ACKs; uses the Agent tool to delegate.
  - composio-agent: Gmail, Calendar, and other Composio MCP tools (WebSearch/WebFetch disallowed).
  - research-agent: Claude Code built-in WebSearch + WebFetch only.
  - coding-agent: placeholder (no tools yet).

ACK streaming:
  When the parent delegates to a subagent, its first turn contains both an
  acknowledgment sentence and a tool_use block. We intercept that text and send
  it to the user immediately, so they get near-instant feedback while the
  subagent does the actual work. The final ResultMessage.result is sent as
  the complete reply.
"""
import asyncio
import json
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
from app.db.convex_client import (
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
Given the following conversation exchange, extract personal facts about the USER \
worth remembering long-term across future conversations.

Output a JSON array (max 3 items) where each item has:
  "fact"      - one concise, entity-centric sentence about the USER (e.g. "Ron likes basketball")
  "is_static" - true for permanent traits that never change (legal name, hometown, \
where they work/study, birth year, close relationships); \
false for preferences, habits, opinions, or decisions that may evolve

STRICT rules — violating these is worse than missing a fact:
- Output ONLY the raw JSON array — no markdown, no code fences (no ```), no text before or after the array
- NEVER extract calendar events, meetings, scheduled items, or anything from a calendar listing
- NEVER extract email contents, email subjects, sender names, or anything from email results
- NEVER extract results returned by any tool — those are task outputs, not personal facts
- NEVER extract things that are one-time or date-specific (e.g. "has meeting on Tuesday")
- ONLY extract facts the user directly stated about themselves or their preferences
- If nothing clearly qualifies, output exactly: NOTHING

Examples of what NOT to save:
  "Ron has a meeting with Alex at 3pm" → skip (calendar event)
  "Ron received an email from John" → skip (email result)
  "Ron's calendar shows 5 events today" → skip (tool output)

Examples of what TO save:
  "Ron prefers morning meetings" → save (preference the user stated)
  "Ron attends Georgia Tech" → save (personal fact the user stated)

User message: {user_msg}
Assistant reply: {assistant_reply}
"""

# Truncate assistant reply fed to Haiku — tool results (calendar, email) can be
# very long and confuse the model into extracting tool output as personal facts.
_REPLY_TRUNCATE = 600

# Reject markdown/JSON artifacts and other junk the model sometimes emits.
_JUNK_FACTS = frozenset(
    {
        "]",
        "[",
        "}",
        "{",
        "```",
        "```json",
        "```JSON",
        "null",
        "true",
        "false",
    }
)


def _strip_markdown_code_fences(text: str) -> str:
    """Remove ``` / ```json fences so json.loads can succeed."""
    s = text.strip()
    if not s.startswith("```"):
        return s
    first_nl = s.find("\n")
    if first_nl == -1:
        return s
    s = s[first_nl + 1 :]
    if s.rstrip().endswith("```"):
        s = s.rstrip()[:-3].rstrip()
    return s.strip()


def _extract_top_level_json_array(text: str) -> str | None:
    """Find a balanced [...] slice starting at the first '['."""
    start = text.find("[")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    quote: str | None = None
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                in_string = False
                quote = None
            continue
        if ch in "\"'":
            in_string = True
            quote = ch
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _is_valid_memory_fact(fact: str) -> bool:
    """Filter garbage facts (markdown shards, JSON punctuation, etc.)."""
    fact = fact.strip()
    if len(fact) < 10:
        return False
    if fact in _JUNK_FACTS or fact.lower() in _JUNK_FACTS:
        return False
    if fact.startswith("```"):
        return False
    words = fact.split()
    if len(words) < 2:
        return False
    if not any(c.isalpha() for c in fact):
        return False
    # Mostly punctuation / brackets — not a natural-language fact
    alnum = sum(1 for c in fact if c.isalnum())
    if alnum < len(fact) * 0.25:
        return False
    letters = sum(1 for c in fact if c.isalpha())
    if letters < 8:
        return False
    return True


def _parse_memory_extraction_response(text: str) -> list[tuple[str, bool]]:
    """
    Parse Haiku output into (fact, is_static) pairs.
    Handles fenced JSON; never treats markdown lines as facts unless they pass validation.
    """
    raw = text.strip()
    if not raw or raw.upper() == "NOTHING":
        return []

    cleaned = _strip_markdown_code_fences(raw)
    to_parse = cleaned
    try:
        json.loads(to_parse)
    except json.JSONDecodeError:
        extracted = _extract_top_level_json_array(cleaned)
        if extracted:
            to_parse = extracted

    items: list[dict] | None = None
    try:
        parsed = json.loads(to_parse)
        if isinstance(parsed, list):
            items = [x for x in parsed if isinstance(x, dict)]
    except (json.JSONDecodeError, TypeError):
        items = None

    if items is not None:
        out: list[tuple[str, bool]] = []
        for item in items:
            fact = item.get("fact")
            if not isinstance(fact, str) or not fact.strip():
                continue
            if not _is_valid_memory_fact(fact):
                continue
            out.append((fact.strip(), bool(item.get("is_static", False))))
        return out

    # Last resort: plain lines (only if they look like real sentences, not fence shards)
    facts: list[tuple[str, bool]] = []
    for line in raw.splitlines():
        line = line.strip().strip("- ").strip()
        if not line or line.upper() == "NOTHING":
            continue
        if _is_valid_memory_fact(line):
            facts.append((line, False))
    return facts

# ── Subagent definitions ──────────────────────────────────────────────────────

COMPOSIO_AGENT = AgentDefinition(
    description=(
        "Handles ALL productivity tool operations: Google Calendar (checking events, "
        "creating meetings, finding free time), Gmail (reading, searching, sending, "
        "replying to emails), and any other connected Composio tools. "
        "Use this agent for ANY request involving calendar, email, or connected apps."
    ),
    prompt=(
        "You are a productivity tools specialist with access to Gmail, Google Calendar, "
        "and other connected apps via Composio.\n\n"
        "Workflow:\n"
        "1. Use COMPOSIO_SEARCH_TOOLS to find the right tool for the task.\n"
        "2. If a connection is needed, use COMPOSIO_MANAGE_CONNECTIONS.\n"
        "3. Call the discovered tool to complete the request.\n"
        "4. Return a concise plain-text summary suitable for iMessage.\n\n"
        "Do not use markdown. Keep responses brief."
    ),
    model="sonnet",
    disallowedTools=["WebFetch", "WebSearch"],
)

CODING_AGENT = AgentDefinition(
    description=(
        "Handles code-related tasks: writing code, debugging, explaining code, "
        "code review, and technical questions. Use for any programming request."
    ),
    prompt=(
        "You are a coding specialist. Help with code tasks and return concise answers "
        "suitable for iMessage. Use plain text, no markdown."
    ),
    tools=[],
    model="sonnet",
)

RESEARCH_AGENT = AgentDefinition(
    description=(
        "Handles research that needs the public web: current events, news, facts, "
        "documentation, sports scores, and anything requiring up-to-date online "
        "information. Use when the user asks to look something up or needs external sources."
    ),
    prompt=(
        "You are a research specialist. Claude Code provides:\n"
        "- WebSearch — find relevant pages and URLs for a query.\n"
        "- WebFetch — read the full text from specific URLs (from the user or from WebSearch).\n"
        "Use WebSearch first when you need to discover sources; use WebFetch to pull details from "
        "the best URLs. You may repeat as needed.\n"
        "Synthesize into a concise plain-text reply suitable for iMessage. No markdown. "
        "If results are thin, say so briefly."
    ),
    tools=["WebSearch", "WebFetch"],
    model="sonnet",
)


# ── Memory extraction ─────────────────────────────────────────────────────────

async def maybe_save_memory(user_msg: str, assistant_reply: str, parent_message_id: int) -> None:
    """
    Use a cheap Haiku call to extract memorable facts from an exchange
    and store them in Supermemory. Records token usage. Runs as a background task.
    """
    try:
        truncated_reply = (
            assistant_reply[:_REPLY_TRUNCATE] + "…[truncated]"
            if len(assistant_reply) > _REPLY_TRUNCATE
            else assistant_reply
        )
        response = await asyncio.to_thread(
            _haiku_client.messages.create,
            model=HAIKU_MODEL,
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": MEMORY_EXTRACTION_PROMPT.format(
                        user_msg=user_msg,
                        assistant_reply=truncated_reply,
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
        facts = _parse_memory_extraction_response(text)

        # Hard cap — never store more than 3 facts per exchange
        facts = facts[:3]

        for fact, is_static in facts:
            if fact:
                await add_memory(fact, is_static=is_static, metadata={"source": "conversation"})
                insert_log("info", "memory.saved", "Saved memory fact", {"fact": fact, "is_static": is_static})
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
        insert_log("info", "agent.building_prompt", "Building system prompt")
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

        insert_log("info", "agent.querying", "Starting agent query", {"session_id": session_id})

        mcp_config = get_mcp_config()
        insert_log("info", "agent.mcp_config", f"MCP servers: {list(mcp_config.keys())}", {
            "servers": {k: v.get("url", "")[:80] for k, v in mcp_config.items()},
        })

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model="sonnet",
            resume=session_id,
            # Built-ins: Agent (delegate) + Claude Code web tools for research-agent
            tools=["Agent", "WebSearch", "WebFetch"],
            allowed_tools=["Agent", "WebSearch", "WebFetch"],
            mcp_servers=mcp_config,
            permission_mode="bypassPermissions",
            agents={
                "composio-agent": COMPOSIO_AGENT,
                "coding-agent": CODING_AGENT,
                "research-agent": RESEARCH_AGENT,
            },
            cwd=str(PROJECT_ROOT),
            setting_sources=["project"],
            max_turns=8,
            max_budget_usd=0.50,
        )

        ack_sent = False
        reply = None

        async def _run_query():
            nonlocal ack_sent, reply
            turn_count = 0
            async for message in query(prompt=payload.content, options=options):
                turn_count += 1
                msg_type = type(message).__name__
                print(f"[agent] Turn {turn_count}: {msg_type}", flush=True)

                if isinstance(message, AssistantMessage):
                    blocks = message.content or []
                    block_types = [type(b).__name__ for b in blocks]
                    print(f"[agent]   blocks: {block_types}", flush=True)
                    for b in blocks:
                        if isinstance(b, TextBlock) and b.text.strip():
                            print(f"[agent]   text: {b.text[:120]}", flush=True)
                        if isinstance(b, ToolUseBlock):
                            print(f"[agent]   tool_use: name={b.name} id={b.id}", flush=True)
                            insert_log("info", "agent.tool_use", f"Tool call: {b.name}", {"tool": b.name, "id": b.id})

                if isinstance(message, AssistantMessage) and not ack_sent:
                    blocks = message.content or []
                    has_tool_use = any(isinstance(b, ToolUseBlock) for b in blocks)
                    first_text = next(
                        (b.text.strip() for b in blocks if isinstance(b, TextBlock) and b.text.strip()),
                        None,
                    )
                    if first_text and has_tool_use:
                        await send_message(to=payload.from_number, content=first_text)
                        print(f"[agent] ACK sent: '{first_text}'")
                        ack_sent = True

                if isinstance(message, ResultMessage):
                    print(f"[agent]   result subtype={message.subtype}, turns={message.num_turns}", flush=True)
                    if hasattr(message, 'result') and message.result:
                        print(f"[agent]   result text: {message.result[:200]}", flush=True)
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

        try:
            await asyncio.wait_for(_run_query(), timeout=300)
        except asyncio.TimeoutError:
            insert_log("error", "agent.timeout", "Agent query timed out after 300s", {"from": payload.from_number})
            await send_message(to=payload.from_number, content="Sorry, that took too long. Please try again.")
            return

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
        print(f"[agent] Unhandled error: {e}", flush=True)
        try:
            insert_log("error", "agent.error", f"Error processing message: {e}", {"error": str(e), "from": payload.from_number})
        except Exception as log_err:
            print(f"[agent] Failed to log error: {log_err}", flush=True)
        try:
            await send_message(
                to=payload.from_number,
                content="Sorry, I ran into an error. Please try again in a moment.",
            )
        except Exception:
            pass
