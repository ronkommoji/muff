import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export const insertToolCall = mutation({
  args: {
    messageId: v.optional(v.id("messages")),
    toolName: v.string(),
    inputJson: v.optional(v.string()),
    outputJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("toolCalls", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 50;
    const rows = await ctx.db
      .query("toolCalls")
      .order("desc")
      .take(lim);

    const results = [];
    for (const tc of rows) {
      let messageContent: string | null = null;
      if (tc.messageId) {
        const msg = await ctx.db.get(tc.messageId);
        messageContent = msg?.content ?? null;
      }
      results.push({
        id: tc._id,
        tool_name: tc.toolName,
        input_json: tc.inputJson ?? null,
        output_json: tc.outputJson ?? null,
        created_at: toIso(tc.createdAt),
        message_content: messageContent,
      });
    }
    return results;
  },
});

export const getToolUsageFrequency = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 15;
    const all = await ctx.db.query("toolCalls").collect();
    const counts: Record<string, number> = {};
    for (const tc of all) {
      counts[tc.toolName] = (counts[tc.toolName] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, lim)
      .map(([tool_name, count]) => ({ tool_name, count }));
  },
});
