import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export const getActiveSession = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_phone_active", (q) =>
        q.eq("phoneNumber", args.phoneNumber).eq("isActive", true)
      )
      .order("desc")
      .first();
    if (!row) return null;
    return {
      session_id: row.sessionId,
      updated_at: toIso(row.updatedAt),
    };
  },
});

export const saveSession = mutation({
  args: {
    phoneNumber: v.string(),
    sessionId: v.string(),
    preview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: Date.now() });
    } else {
      const active = await ctx.db
        .query("sessions")
        .withIndex("by_phone_active", (q) =>
          q
            .eq("phoneNumber", args.phoneNumber)
            .eq("isActive", true)
        )
        .collect();
      for (const s of active) {
        await ctx.db.patch(s._id, { isActive: false });
      }
      await ctx.db.insert("sessions", {
        phoneNumber: args.phoneNumber,
        sessionId: args.sessionId,
        isActive: true,
        preview: args.preview,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const deactivateCurrentSession = mutation({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("sessions")
      .withIndex("by_phone_active", (q) =>
        q
          .eq("phoneNumber", args.phoneNumber)
          .eq("isActive", true)
      )
      .collect();
    for (const s of active) {
      await ctx.db.patch(s._id, { isActive: false });
    }
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 100;
    const rows = await ctx.db
      .query("sessions")
      .order("desc")
      .take(lim);

    return rows.map((s) => ({
      id: s._id,
      phone_number: s.phoneNumber,
      session_id: s.sessionId,
      is_active: s.isActive,
      preview: s.preview ?? null,
      created_at: toIso(s.createdAt),
      updated_at: toIso(s.updatedAt),
    }));
  },
});

export const listPastSessions = query({
  args: { phoneNumber: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit ?? 5;
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .order("desc")
      .filter((q) => q.eq(q.field("isActive"), false))
      .take(lim);

    return rows.map((s) => ({
      session_id: s.sessionId,
      preview: s.preview ?? null,
      updated_at: toIso(s.updatedAt),
    }));
  },
});

export const setActiveSession = mutation({
  args: { phoneNumber: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("sessions")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .collect();
    for (const s of all) {
      if (s.isActive) {
        await ctx.db.patch(s._id, { isActive: false });
      }
    }
    const target = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (target) {
      await ctx.db.patch(target._id, {
        isActive: true,
        updatedAt: Date.now(),
      });
    }
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
        const isPhone = m.fromNumber === phone || m.toNumber === phone;
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
