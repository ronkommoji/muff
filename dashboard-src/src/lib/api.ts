const BASE = ""

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export interface Message {
  id: string | number
  message_handle: string | null
  from_number: string
  to_number: string
  content: string
  role: "user" | "assistant"
  service: string
  created_at: string
}

export interface ToolCall {
  id: string | number
  tool_name: string
  input_json: string | null
  output_json: string | null
  created_at: string
  message_content: string | null
}

export interface UsageSummary {
  total_cost_usd: number
  month_cost_usd: number
  total_input_tokens: number
  total_output_tokens: number
  per_model: Array<{
    model: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
    calls: number
  }>
  recent: Array<{
    model: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
    created_at: string
    message_preview: string | null
  }>
}

export interface ChartsData {
  daily_cost: Array<{ day: string; cost: number; input_tokens: number; output_tokens: number }>
  messages_per_day: Array<{ day: string; count: number }>
  tool_frequency: Array<{ tool_name: string; count: number }>
  per_model: Array<{ model: string; input_tokens: number; output_tokens: number; cost_usd: number; calls: number }>
}

export interface Memory {
  id?: string
  content: string
  created_at?: string
  is_static?: boolean
  metadata?: Record<string, unknown>
}

export interface GraphMemory {
  id: string
  memory: string
  isStatic: boolean
  changeType: string
  memoryRelations: Record<string, string>
  isInference: boolean
  isForgotten: boolean
  version: number
  parentMemoryId: string | null
  rootMemoryId: string | null
  createdAt: string
}

export interface GraphDocument {
  id: string
  title: string | null
  summary: string | null
  documentType: string
  x: number
  y: number
  createdAt: string
  memories: GraphMemory[]
}

export interface GraphEdge {
  source: string
  target: string
  similarity: number
}

export interface GraphData {
  documents: GraphDocument[]
  edges: GraphEdge[]
  totalCount: number
  error?: string
}

export interface Session {
  id: string | number
  phone_number: string
  session_id: string
  is_active: boolean
  preview: string | null
  created_at: string
  updated_at: string
}

export interface App {
  key: string
  displayName: string
  description: string
  logo: string
  categories: string[]
  connected: boolean
  connection_id: string | null
}

export interface Routine {
  id: string | number
  name: string
  prompt: string
  hour: number
  minute: number
  timezone: string
  enabled: boolean
  last_run_at: string | null
  next_run_at?: string | null
  created_at: string
}

export interface Log {
  id: string | number
  level: "info" | "warning" | "error"
  event_type: string
  message: string
  metadata: string | null
  created_at: string
}

export interface DbTable {
  name: string
}

export interface DbColumn {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export const api = {
  getMessages: (limit = 100, offset = 0) =>
    apiFetch<{ messages: Message[]; count: number }>(`/api/messages?limit=${limit}&offset=${offset}`),

  getMemories: (q = "", limit = 30) =>
    apiFetch<{ memories: Memory[] }>(`/api/memories?q=${encodeURIComponent(q)}&limit=${limit}`),

  getGraph: (limit = 200) =>
    apiFetch<GraphData>(`/api/graph?limit=${limit}`),

  getApps: () => apiFetch<{ apps: App[] }>("/api/apps"),

  getRoutines: () => apiFetch<{ routines: Routine[] }>("/api/routines"),

  createRoutine: (payload: {
    name: string
    prompt: string
    hour: number
    minute: number
    timezone: string
    enabled: boolean
  }) =>
    fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  updateRoutine: (id: number | string, payload: Partial<{
    name: string
    prompt: string
    hour: number
    minute: number
    timezone: string
    enabled: boolean
  }>) =>
    fetch(`/api/routines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  deleteRoutine: (id: number | string) =>
    fetch(`/api/routines/${id}`, { method: "DELETE" }).then(r => r.json()),

  runRoutineNow: (id: number | string) =>
    fetch(`/api/routines/${id}/run`, { method: "POST" }).then(r => r.json()),

  getToolCalls: (limit = 50) =>
    apiFetch<{ tool_calls: ToolCall[] }>(`/api/tool-calls?limit=${limit}`),

  getUsage: () => apiFetch<UsageSummary>("/api/usage"),

  getCharts: (days = 30) => apiFetch<ChartsData>(`/api/charts?days=${days}`),

  getLogs: (params: { limit?: number; offset?: number; level?: string; event_type?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.limit) q.set("limit", String(params.limit))
    if (params.offset) q.set("offset", String(params.offset))
    if (params.level) q.set("level", params.level)
    if (params.event_type) q.set("event_type", params.event_type)
    return apiFetch<{ logs: Log[]; count: number; total: number }>(`/api/logs?${q}`)
  },

  getLogEventTypes: () => apiFetch<{ event_types: string[] }>("/api/logs/event-types"),

  getDbTables: () => apiFetch<{ tables: string[] }>("/api/db/tables"),

  getTableSchema: (table: string) =>
    apiFetch<{ table: string; columns: DbColumn[] }>(`/api/db/tables/${table}/schema`),

  getTableRows: (table: string, limit = 50, offset = 0) =>
    apiFetch<{ rows: Record<string, unknown>[]; total: number }>(`/api/db/tables/${table}/rows?limit=${limit}&offset=${offset}`),

  authorizeApp: (app: string) =>
    fetch(`/api/tools/${app}/authorize`, { method: "POST" }).then(r => r.json()),

  testConnection: (app: string) =>
    fetch(`/api/tools/${app}/test`, { method: "POST" }).then(r => r.json()) as Promise<{ ok: boolean; status: string; message: string }>,

  reconnectApp: (app: string) =>
    fetch(`/api/tools/${app}/reconnect`, { method: "POST" }).then(r => r.json()) as Promise<{ app: string; redirect_url: string }>,

  getMessagesStats: () => apiFetch<{ count: number; min_date: string | null; max_date: string | null }>("/api/messages/stats"),

  getSessions: (limit = 100) =>
    apiFetch<{ sessions: Session[]; count: number }>(`/api/sessions?limit=${limit}`),

  getSessionMessages: (sessionId: string) =>
    apiFetch<{ messages: Message[]; session_id: string; count: number }>(`/api/sessions/${sessionId}/messages`),
}
