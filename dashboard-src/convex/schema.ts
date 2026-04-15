import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    messageHandle: v.optional(v.string()),
    fromNumber: v.string(),
    toNumber: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    service: v.string(),
    createdAt: v.number(),
  })
    .index("by_handle", ["messageHandle"])
    .index("by_from", ["fromNumber", "createdAt"]),

  toolCalls: defineTable({
    messageId: v.optional(v.id("messages")),
    toolName: v.string(),
    inputJson: v.optional(v.string()),
    outputJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_created", ["createdAt"]),

  usage: defineTable({
    messageId: v.optional(v.id("messages")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_created", ["createdAt"]),

  sessions: defineTable({
    phoneNumber: v.string(),
    sessionId: v.string(),
    isActive: v.boolean(),
    preview: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_phone", ["phoneNumber", "updatedAt"])
    .index("by_phone_active", ["phoneNumber", "isActive", "updatedAt"]),

  logs: defineTable({
    level: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    eventType: v.string(),
    message: v.string(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_level", ["level", "createdAt"])
    .index("by_event_type", ["eventType", "createdAt"]),

  routines: defineTable({
    name: v.string(),
    prompt: v.string(),
    hour: v.number(),
    minute: v.number(),
    timezone: v.string(),
    enabled: v.boolean(),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_enabled", ["enabled"]),

  kv: defineTable({
    key: v.string(),
    value: v.optional(v.string()),
  })
    .index("by_key", ["key"]),
});
