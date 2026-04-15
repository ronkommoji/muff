"""
Top-level agent orchestration using the Claude Agent SDK.

run_agent() is the single entry point called by the webhook handler.
It coordinates: system prompt + memory building, session resumption,
Agent SDK query execution (tool loop handled automatically via MCP),
reply sending, DB persistence, usage logging, and async memory extraction.
"""
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage
from app.services.sendblue import SendbluePayload, send_message
from app.services.supermemory import add_memory
from app.agent.context import build_system_prompt
from app.db.database import (
    message_exists, insert_message, insert_usage,
    get_session_id, save_session_id,
    insert_log,
)
from app.services.composio import get_mcp_config
from app.config import settings
from anthropic import Anthropic

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


async def run_agent(payload: SendbluePayload) -> None:
    """
    Full agent pipeline for a single incoming iMessage.

    Flow:
      1. Validate + deduplicate, insert user message to DB
      2. Build system prompt (with relevant memories injected)
      3. Look up Agent SDK session_id for this user (None = new session)
      4. Run query() — Agent SDK handles tool loop via Composio MCP automatically
      5. Capture ResultMessage: save session_id, log usage, send reply
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
        session_id = get_session_id(payload.from_number)

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model="sonnet",
            resume=session_id,
            tools=[],
            mcp_servers=get_mcp_config(),
            allowed_tools=["mcp__composio-calendar__*", "mcp__composio-gmail__*"],
            max_turns=10,
            max_budget_usd=0.50,
        )

        reply = None
        async for message in query(prompt=payload.content, options=options):
            if isinstance(message, ResultMessage):
                save_session_id(payload.from_number, message.session_id)

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
