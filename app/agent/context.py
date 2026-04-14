"""
Builds the context (system prompt + message history) for the Claude call.

Fetches conversation history from SQLite and relevant memories from
Supermemory in parallel, then combines them into a rich system prompt.
"""
import asyncio
from datetime import datetime
from app.db.database import get_recent_messages
from app.services.supermemory import search_memories
from app.config import settings


SYSTEM_TEMPLATE = """\
You are a highly capable personal AI assistant. You communicate exclusively \
through iMessage and help with tasks like email, calendar management, \
reminders, and general questions.

Current date and time: {datetime}
Your iMessage number: {my_number}

{memory_section}\
Guidelines:
- Be concise — this is a messaging interface, not a chat UI
- Use plain text; avoid markdown formatting in replies
- When using tools, complete the task fully before replying
- If you cannot complete a task, say why briefly
"""

MEMORY_SECTION = """\
## Memories about you
{memories}

"""


async def build_context(from_number: str, incoming_message: str) -> dict:
    """
    Return a dict with keys:
        system   — system prompt string
        messages — list of Anthropic message dicts (conversation history)
    """
    # Fetch history + memories in parallel
    history_rows, memory_snippets = await asyncio.gather(
        asyncio.to_thread(get_recent_messages, from_number, 20),
        search_memories(incoming_message, limit=5),
    )

    # Build memory section
    if memory_snippets:
        memories_text = "\n".join(f"- {s}" for s in memory_snippets)
        memory_section = MEMORY_SECTION.format(memories=memories_text)
    else:
        memory_section = ""

    system_prompt = SYSTEM_TEMPLATE.format(
        datetime=datetime.now().strftime("%A, %B %d %Y at %I:%M %p"),
        my_number=settings.my_sendblue_number,
        memory_section=memory_section,
    )

    # Convert SQLite history rows to Anthropic message format
    messages: list[dict] = []
    for row in history_rows:
        role = "user" if row["role"] == "user" else "assistant"
        messages.append({"role": role, "content": row["content"]})

    # Append the current incoming message (not yet in DB when context is built)
    messages.append({"role": "user", "content": incoming_message})

    return {"system": system_prompt, "messages": messages}
