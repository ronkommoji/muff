import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return row?.value ?? null;
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("kv", { key: args.key, value: args.value });
    }
  },
});
