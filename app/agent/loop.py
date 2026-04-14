"""
Claude agentic loop with Composio tool execution.

Runs the Claude message cycle, handling tool_use stop reasons by
delegating to Composio and re-calling Claude with the results.
Caps at MAX_ITERATIONS to prevent runaway loops.

Returns (reply_text, usage_dict) so the caller can record token costs.
"""
import json
from anthropic import Anthropic
from app.config import settings
from app.services import composio as composio_svc
from app.db.database import insert_tool_call

MAX_ITERATIONS = 10
MODEL = "claude-sonnet-4-6"
client = Anthropic(api_key=settings.anthropic_api_key)


def run_loop(
    context: dict,
    tools: list,
    user_id: str,
    parent_message_id: int = 0,
) -> tuple[str, dict]:
    """
    Execute the Claude message loop until a text response is produced.

    Returns:
        (reply_text, {"model": str, "input_tokens": int, "output_tokens": int})
    """
    messages = list(context["messages"])
    system = context["system"]

    total_input = 0
    total_output = 0

    for iteration in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system,
            tools=tools if tools else [],
            messages=messages,
        )

        # Accumulate token usage from every API call in the loop
        if response.usage:
            total_input += response.usage.input_tokens
            total_output += response.usage.output_tokens

        usage = {"model": MODEL, "input_tokens": total_input, "output_tokens": total_output}

        if response.stop_reason != "tool_use":
            for block in response.content:
                if hasattr(block, "text"):
                    return block.text, usage
            return "", usage

        # Handle tool calls via Composio
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        for block in tool_use_blocks:
            try:
                insert_tool_call(
                    message_id=parent_message_id,
                    tool_name=block.name,
                    input_json=json.dumps(block.input),
                    output_json="",
                )
            except Exception:
                pass

        tool_results = composio_svc.handle_tool_calls(response, user_id=user_id)

        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_blocks[i].id,
                    "content": json.dumps(result) if not isinstance(result, str) else result,
                }
                for i, result in enumerate(tool_results)
            ],
        })

    usage = {"model": MODEL, "input_tokens": total_input, "output_tokens": total_output}
    return "I ran into an issue completing that task. Please try again.", usage
