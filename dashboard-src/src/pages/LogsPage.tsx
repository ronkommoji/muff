import React, { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Log, ToolCall } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight } from "lucide-react"
import ToolCallTable from "@/components/ToolCallTable"
import DbViewer from "@/components/DbViewer"
import type { SSESnapshot } from "@/lib/sse"

const LEVEL_VARIANTS: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  info: "secondary",
  warning: "default",
  error: "destructive",
}

const LOG_LIMIT = 50

interface Props { sseSnapshot?: SSESnapshot | null }

export default function LogsPage(_props: Props) {
  const [level, setLevel] = useState("")
  const [eventType, setEventType] = useState("")
  const [logPage, setLogPage] = useState(0)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const logsResult = useQuery(api.logs.list, {
    limit: LOG_LIMIT,
    offset: logPage * LOG_LIMIT,
    level: level || undefined,
    eventType: eventType || undefined,
  })

  const logs: Log[] = (logsResult?.logs ?? []) as unknown as Log[]
  const total = logsResult?.total ?? 0
  const logsLoading = logsResult === undefined

  const eventTypesData = useQuery(api.logs.getEventTypes)
  const eventTypes: string[] = eventTypesData ?? []

  const toolCallsData = useQuery(api.toolCalls.getRecent, { limit: 100 })
  const toolCalls: ToolCall[] = (toolCallsData ?? []) as unknown as ToolCall[]
  const tcLoading = toolCallsData === undefined

  const formatMeta = (s: string | null) => {
    if (!s) return null
    try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <Tabs defaultValue="logs">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="logs">
              Logs
              <Badge variant="secondary" className="ml-1.5 text-xs">{total}</Badge>
            </TabsTrigger>
            <TabsTrigger value="toolcalls">
              Tool Calls
              <Badge variant="secondary" className="ml-1.5 text-xs">{toolCalls.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="logs">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select value={level || "all"} onValueChange={v => { setLevel(v === "all" ? "" : v); setLogPage(0) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={eventType || "all"} onValueChange={v => { setEventType(v === "all" ? "" : v); setLogPage(0) }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {eventTypes.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}
              </SelectContent>
            </Select>

            <span className="ml-auto text-sm text-muted-foreground">{total} total</span>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Level</TableHead>
                    <TableHead className="w-40">Event Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-40">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    [...Array(10)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                        No logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map(log => (
                      <React.Fragment key={log.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          <TableCell>
                            <Badge variant={LEVEL_VARIANTS[log.level] ?? "outline"} className="text-xs">
                              {log.level}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
                          <TableCell className="text-sm max-w-[300px] truncate">{log.message}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        {expandedLog === log.id && log.metadata && (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                                {formatMeta(log.metadata)}
                              </pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between mt-3">
            <Button variant="outline" size="sm" disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {logPage + 1} of {Math.max(1, Math.ceil(total / LOG_LIMIT))}
            </span>
            <Button variant="outline" size="sm" disabled={(logPage + 1) * LOG_LIMIT >= total} onClick={() => setLogPage(p => p + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="toolcalls">
          <ToolCallTable toolCalls={toolCalls} loading={tcLoading} />
        </TabsContent>

        <TabsContent value="database">
          <DbViewer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
