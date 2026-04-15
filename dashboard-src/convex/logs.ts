import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export const insertLog = mutation({
  args: {
    level: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    eventType: v.string(),
    message: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("logs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    level: v.optional(v.string()),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 100;
    const off = args.offset ?? 0;

    let rows;
    if (args.level && args.level !== "") {
      rows = await ctx.db
        .query("logs")
        .withIndex("by_level", (q) =>
          q.eq(
            "level",
            args.level as "info" | "warning" | "error"
          )
        )
        .order("desc")
        .collect();
    } else {
      rows = await ctx.db.query("logs").order("desc").collect();
    }

    if (args.eventType && args.eventType !== "") {
      rows = rows.filter((r) => r.eventType === args.eventType);
    }

    const page = rows.slice(off, off + lim);
    return {
      logs: page.map((r) => ({
        id: r._id,
        level: r.level,
        event_type: r.eventType,
        message: r.message,
        metadata: r.metadata ?? null,
        created_at: toIso(r.createdAt),
      })),
      count: page.length,
      total: rows.length,
    };
  },
});

export const getEventTypes = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("logs").collect();
    const types = new Set<string>();
    for (const r of all) types.add(r.eventType);
    return Array.from(types).sort();
  },
});
