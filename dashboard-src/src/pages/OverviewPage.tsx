import { useState, useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { api as restApi, type ChartsData } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { DollarSign, MessageSquare, Zap, TrendingUp } from "lucide-react"
import type { SSESnapshot } from "@/lib/sse"

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(222.2 84% 4.9%)",
    border: "1px solid hsl(217.2 32.6% 17.5%)",
    borderRadius: "6px",
    color: "hsl(210 40% 98%)",
  },
  labelStyle: { color: "hsl(215 20.2% 65.1%)" },
  itemStyle: { color: "hsl(210 40% 98%)" },
}

interface Props { sseSnapshot: SSESnapshot | null; connected?: boolean }

export default function OverviewPage({ sseSnapshot }: Props) {
  const usage = useQuery(api.usage.getSummary)
  const stats = useQuery(api.messages.getMessagesStats)
  const [days, setDays] = useState("30")
  const [charts, setCharts] = useState<ChartsData | null>(null)

  useEffect(() => {
    restApi.getCharts(Number(days)).then(setCharts).catch(console.error)
  }, [days])

  const msgCount = stats?.count ?? null

  const statCards = [
    {
      title: "Total Spend",
      value: usage ? `$${usage.total_cost_usd.toFixed(4)}` : null,
      sub: "all time",
      icon: DollarSign,
    },
    {
      title: "This Month",
      value: usage ? `$${usage.month_cost_usd.toFixed(4)}` : null,
      sub: "current month",
      icon: TrendingUp,
    },
    {
      title: "Messages",
      value: msgCount !== null ? String(msgCount) : null,
      sub: "total stored",
      icon: MessageSquare,
    },
    {
      title: "Total Tokens",
      value: usage ? ((usage.total_input_tokens + usage.total_output_tokens) / 1000).toFixed(1) + "k" : null,
      sub: `${usage?.total_input_tokens.toLocaleString() ?? "—"} in / ${usage?.total_output_tokens.toLocaleString() ?? "—"} out`,
      icon: Zap,
    },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {card.value !== null ? (
                <>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground">{card.sub}</p>
                </>
              ) : (
                <Skeleton className="h-8 w-24" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Cost</CardTitle>
            <CardDescription>USD spent per day</CardDescription>
          </CardHeader>
          <CardContent>
            {charts ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={charts.daily_cost}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(3)}`} width={60} />
                  <Tooltip formatter={(v) => [`$${(v as number).toFixed(4)}`, "Cost"]} {...TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="cost" stroke={COLORS[0]} fill="url(#costGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-[220px] w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages Per Day</CardTitle>
            <CardDescription>Inbound + outbound</CardDescription>
          </CardHeader>
          <CardContent>
            {charts ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.messages_per_day}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-[220px] w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
            <CardDescription>Spend breakdown</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {charts && charts.per_model.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.per_model} dataKey="cost_usd" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? '').split('-')[1] ?? name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {charts.per_model.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `$${(v as number).toFixed(4)}`} {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : charts ? (
              <p className="text-sm text-muted-foreground py-10">No usage data yet.</p>
            ) : (
              <Skeleton className="h-[220px] w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool Call Frequency</CardTitle>
            <CardDescription>Most used tools</CardDescription>
          </CardHeader>
          <CardContent>
            {charts && charts.tool_frequency.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.tool_frequency} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="tool_name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={COLORS[2]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : charts ? (
              <p className="text-sm text-muted-foreground py-10">No tool calls recorded yet.</p>
            ) : (
              <Skeleton className="h-[220px] w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
