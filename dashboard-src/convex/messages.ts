import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export const messageExists = query({
  args: { messageHandle: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("messages")
      .withIndex("by_handle", (q) => q.eq("messageHandle", args.messageHandle))
      .first();
    return doc !== null;
  },
});

export const insertMessage = mutation({
  args: {
    messageHandle: v.optional(v.string()),
    fromNumber: v.string(),
    toNumber: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    service: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.messageHandle) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_handle", (q) =>
          q.eq("messageHandle", args.messageHandle)
        )
        .first();
      if (existing) return existing._id;
    }
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getRecentMessages = query({
  args: { fromNumber: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 20;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromNumber", args.fromNumber))
      .order("desc")
      .take(lim);
    return rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      created_at: toIso(r.createdAt),
    }));
  },
});

export const getAllMessages = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 100;
    const off = args.offset ?? 0;
    const all = await ctx.db
      .query("messages")
      .order("desc")
      .collect();
    const page = all.slice(off, off + lim);
    return page.map((r) => ({
      id: r._id,
      message_handle: r.messageHandle ?? null,
      from_number: r.fromNumber,
      to_number: r.toNumber,
      content: r.content,
      role: r.role,
      service: r.service,
      created_at: toIso(r.createdAt),
    }));
  },
});

export const getMessagesStats = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("messages").collect();
    if (all.length === 0) {
      return { count: 0, min_date: null, max_date: null };
    }
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const m of all) {
      if (m.createdAt < minTs) minTs = m.createdAt;
      if (m.createdAt > maxTs) maxTs = m.createdAt;
    }
    return {
      count: all.length,
      min_date: toIso(minTs),
      max_date: toIso(maxTs),
    };
  },
});

export const getMessagesPerDay = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const d = args.days ?? 30;
    const cutoff = Date.now() - d * 86_400_000;
    const all = await ctx.db.query("messages").collect();
    const counts: Record<string, number> = {};
    for (const m of all) {
      if (m.createdAt >= cutoff) {
        const day = new Date(m.createdAt).toISOString().slice(0, 10);
        counts[day] = (counts[day] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count }));
  },
});

export const getMessagesForSession = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!session) return [];

    const phone = session.phoneNumber;
    const start = session.createdAt;

    const nextSession = await ctx.db
      .query("sessions")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", phone))
      .order("asc")
      .filter((q) => q.gt(q.field("createdAt"), start))
      .first();

    const end = nextSession?.createdAt;

    const all = await ctx.db.query("messages").order("asc").collect();
    return all
      .filter((m) => {
        const isPhone =
          m.fromNumber === phone || m.toNumber === phone;
        const afterStart = m.createdAt >= start;
        const beforeEnd = end ? m.createdAt < end : true;
        return isPhone && afterStart && beforeEnd;
      })
      .map((m) => ({
        id: m._id,
        message_handle: m.messageHandle ?? null,
        from_number: m.fromNumber,
        to_number: m.toNumber,
        content: m.content,
        role: m.role,
        service: m.service,
        created_at: toIso(m.createdAt),
      }));
  },
});

export const getSessionMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!session) return [];

    const phone = session.phoneNumber;
    const start = session.createdAt;

    const nextSession = await ctx.db
      .query("sessions")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", phone))
      .order("asc")
      .filter((q) => q.gt(q.field("createdAt"), start))
      .first();

    const end = nextSession?.createdAt;

    const all = await ctx.db.query("messages").order("asc").collect();
    return all
      .filter((m) => {
        const isPhone =
          m.fromNumber === phone || m.toNumber === phone;
        const afterStart = m.createdAt >= start;
        const beforeEnd = end ? m.createdAt < end : true;
        return isPhone && afterStart && beforeEnd;
      })
      .map((m) => ({
        id: m._id,
        message_handle: m.messageHandle ?? null,
        from_number: m.fromNumber,
        to_number: m.toNumber,
        content: m.content,
        role: m.role,
        service: m.service,
        created_at: toIso(m.createdAt),
      }));
  },
});
