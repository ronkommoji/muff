"""
Top-level agent orchestration.

run_agent() is the single entry point called by the webhook handler.
It coordinates: context building, tool fetching, Claude loop, reply sending,
DB persistence, async memory extraction, and usage/cost logging.
"""
import asyncio
from app.services.sendblue import SendbluePayload, send_message
from app.services.supermemory import add_memory
from app.agent.context import build_context
from app.agent.loop import run_loop
from app.db.database import message_exists, insert_message, insert_usage
from app.services import composio as composio_svc
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

        # Record Haiku usage
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
                print(f"[memory] Saved: {fact}")
    except Exception as e:
        print(f"[memory] Error saving memory: {e}")


async def run_agent(payload: SendbluePayload) -> None:
    """
    Full agent pipeline for a single incoming iMessage.
    """
    if payload.is_outbound:
        return

    if payload.from_number != settings.user_phone_number:
        print(f"[agent] Ignoring message from unknown number: {payload.from_number}")
        return

    if not payload.content.strip():
        return

    if payload.message_handle and message_exists(payload.message_handle):
        print(f"[agent] Duplicate message_handle {payload.message_handle}, skipping")
        return

    user_msg_id = insert_message(
        message_handle=payload.message_handle or None,
        from_number=payload.from_number,
        to_number=payload.to_number or settings.my_sendblue_number,
        content=payload.content,
        role="user",
        service=payload.service,
    )

    print(f"[agent] Processing: '{payload.content[:60]}...'")

    try:
        context, tools = await asyncio.gather(
            build_context(payload.from_number, payload.content),
            asyncio.to_thread(composio_svc.get_tools, settings.composio_user_id),
        )

        reply, usage = await asyncio.to_thread(
            run_loop,
            context,
            tools,
            settings.composio_user_id,
            user_msg_id,
        )

        # Record Sonnet usage
        insert_usage(
            message_id=user_msg_id,
            model=usage["model"],
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
        )
        print(f"[usage] {usage['model']}: {usage['input_tokens']} in / {usage['output_tokens']} out")

        await send_message(to=payload.from_number, content=reply)
        print(f"[agent] Sent reply: '{reply[:60]}...'")

        insert_message(
            message_handle=None,
            from_number=settings.my_sendblue_number,
            to_number=payload.from_number,
            content=reply,
            role="assistant",
            service="iMessage",
        )

        asyncio.create_task(maybe_save_memory(payload.content, reply, user_msg_id))

    except Exception as e:
        print(f"[agent] Error processing message: {e}")
        try:
            await send_message(
                to=payload.from_number,
                content="Sorry, I ran into an error. Please try again in a moment.",
            )
        except Exception:
            pass
