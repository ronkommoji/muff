import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export const list = query({
  handler: async (ctx) => {
    const rows = await ctx.db.query("routines").order("desc").collect();
    return rows.map((r) => ({
      id: r._id,
      name: r.name,
      prompt: r.prompt,
      hour: r.hour,
      minute: r.minute,
      timezone: r.timezone,
      enabled: r.enabled,
      last_run_at: r.lastRunAt ? toIso(r.lastRunAt) : null,
      created_at: toIso(r.createdAt),
    }));
  },
});

export const get = query({
  args: { id: v.id("routines") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.id);
    if (!r) return null;
    return {
      id: r._id,
      name: r.name,
      prompt: r.prompt,
      hour: r.hour,
      minute: r.minute,
      timezone: r.timezone,
      enabled: r.enabled,
      last_run_at: r.lastRunAt ? toIso(r.lastRunAt) : null,
      created_at: toIso(r.createdAt),
    };
  },
});

export const insert = mutation({
  args: {
    name: v.string(),
    prompt: v.string(),
    hour: v.number(),
    minute: v.number(),
    timezone: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("routines", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("routines"),
    name: v.optional(v.string()),
    prompt: v.optional(v.string()),
    hour: v.optional(v.number()),
    minute: v.optional(v.number()),
    timezone: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length === 0) return false;
    await ctx.db.patch(id, patch);
    return true;
  },
});

export const remove = mutation({
  args: { id: v.id("routines") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return false;
    await ctx.db.delete(args.id);
    return true;
  },
});

export const touchLastRun = internalMutation({
  args: { id: v.id("routines") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastRunAt: Date.now() });
  },
});

export const markRun = mutation({
  args: { id: v.id("routines") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastRunAt: Date.now() });
  },
});

export const listEnabled = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("routines")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});
