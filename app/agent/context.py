"""
Builds the system prompt for the Claude Agent SDK query.

Message history is managed by Agent SDK sessions. This module only constructs
the system prompt string with the current date/time and relevant long-term
memories fetched from Supermemory.
"""
from datetime import datetime
from app.services.supermemory import search_memories
from app.config import settings


SYSTEM_TEMPLATE = """\
You are a highly capable personal AI assistant communicating exclusively via iMessage.

Current date and time: {datetime}
Your iMessage number: {my_number}

{memory_section}\
You have two specialist agents you can delegate to:

  calendar-agent — use for ANY calendar or scheduling request:
    checking what's on the calendar, adding or updating events, finding free time.

  email-agent — use for ANY email request:
    reading or summarizing emails, searching the inbox, sending or replying to messages.

For calendar or email tasks:
  1. Respond immediately with a brief acknowledgment (one sentence, e.g. "On it, checking your calendar now.").
  2. In the same turn, call the appropriate specialist agent to handle the task.
  3. When the agent returns, send its result directly to the user — do not re-summarize or pad it.

For general questions, conversation, or anything that doesn't need calendar or email tools,
answer directly without delegating.

Guidelines:
- Be concise — this is a messaging interface, not a chat UI
- Use plain text; avoid markdown formatting in replies
- If you cannot complete a task, say why briefly
"""

MEMORY_SECTION = """\
## Memories about you
{memories}

"""


async def build_system_prompt(incoming_message: str) -> str:
    """
    Return the system prompt string with relevant memories injected.
    Called once per incoming message before running the agent query.
    """
    memory_snippets = await search_memories(incoming_message, limit=5)

    if memory_snippets:
        memories_text = "\n".join(f"- {s}" for s in memory_snippets)
        memory_section = MEMORY_SECTION.format(memories=memories_text)
    else:
        memory_section = ""

    return SYSTEM_TEMPLATE.format(
        datetime=datetime.now().strftime("%A, %B %d %Y at %I:%M %p"),
        my_number=settings.my_sendblue_number,
        memory_section=memory_section,
    )
