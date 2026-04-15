import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
};
const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export const insertUsage = mutation({
  args: {
    messageId: v.optional(v.id("messages")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const costUsd = calcCost(args.model, args.inputTokens, args.outputTokens);
    return await ctx.db.insert("usage", {
      messageId: args.messageId,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd,
      createdAt: Date.now(),
    });
  },
});

export const getSummary = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("usage").collect();

    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;
    let monthCost = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const perModelMap: Record<
      string,
      { input_tokens: number; output_tokens: number; cost_usd: number; calls: number }
    > = {};

    for (const u of all) {
      totalCost += u.costUsd;
      totalIn += u.inputTokens;
      totalOut += u.outputTokens;
      if (u.createdAt >= monthStart) monthCost += u.costUsd;

      if (!perModelMap[u.model]) {
        perModelMap[u.model] = { input_tokens: 0, output_tokens: 0, cost_usd: 0, calls: 0 };
      }
      const pm = perModelMap[u.model];
      pm.input_tokens += u.inputTokens;
      pm.output_tokens += u.outputTokens;
      pm.cost_usd += u.costUsd;
      pm.calls += 1;
    }

    const sorted = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    const recent = [];
    for (const u of sorted) {
      let messagePreview: string | null = null;
      if (u.messageId) {
        const msg = await ctx.db.get(u.messageId);
        messagePreview = msg?.content?.slice(0, 100) ?? null;
      }
      recent.push({
        model: u.model,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cost_usd: Math.round(u.costUsd * 1_000_000) / 1_000_000,
        created_at: toIso(u.createdAt),
        message_preview: messagePreview,
      });
    }

    return {
      total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
      month_cost_usd: Math.round(monthCost * 1_000_000) / 1_000_000,
      total_input_tokens: totalIn,
      total_output_tokens: totalOut,
      per_model: Object.entries(perModelMap).map(([model, data]) => ({
        model,
        ...data,
        cost_usd: Math.round(data.cost_usd * 1_000_000) / 1_000_000,
      })),
      recent,
    };
  },
});

export const getDailyCost = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const d = args.days ?? 30;
    const cutoff = Date.now() - d * 86_400_000;
    const all = await ctx.db.query("usage").collect();

    const byDay: Record<
      string,
      { cost: number; input_tokens: number; output_tokens: number }
    > = {};

    for (const u of all) {
      if (u.createdAt >= cutoff) {
        const day = new Date(u.createdAt).toISOString().slice(0, 10);
        if (!byDay[day]) byDay[day] = { cost: 0, input_tokens: 0, output_tokens: 0 };
        byDay[day].cost += u.costUsd;
        byDay[day].input_tokens += u.inputTokens;
        byDay[day].output_tokens += u.outputTokens;
      }
    }

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, data]) => ({ day, ...data }));
  },
});
