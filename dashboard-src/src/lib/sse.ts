/**
 * Replaces the old EventSource-based SSE hook with Convex reactive queries.
 * Components that imported useSSE / SSESnapshot continue to work unchanged.
 */
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Message, ToolCall, UsageSummary } from "./api"

export interface SSESnapshot {
  messages: Message[]
  tool_calls: ToolCall[]
  usage: UsageSummary
}

export function useSSE() {
  const usage = useQuery(api.usage.getSummary)
  const toolCalls = useQuery(api.toolCalls.getRecent, { limit: 50 })
  const messages = useQuery(api.messages.getAllMessages, { limit: 100 })

  const connected = usage !== undefined

  const snapshot: SSESnapshot | null =
    usage && toolCalls && messages
      ? {
          messages: messages as unknown as Message[],
          tool_calls: toolCalls as unknown as ToolCall[],
          usage: usage as unknown as UsageSummary,
        }
      : null

  return { snapshot, connected }
}
