"""
Builds the system prompt for the Claude Agent SDK query.

Message history is now managed by Agent SDK sessions (stored on disk and
resumed via session_id) — this module only constructs the system prompt
with the current date/time and relevant long-term memories.
"""
from datetime import datetime
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
