import React, { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ToolCall } from "@/lib/api"

function formatJson(s: string | null): string {
  if (!s) return "—"
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

interface Props {
  toolCalls: ToolCall[]
  loading: boolean
}

export default function ToolCallTable({ toolCalls, loading }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : toolCalls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  No tool calls recorded.
                </TableCell>
              </TableRow>
            ) : (
              toolCalls.map(tc => (
                <React.Fragment key={tc.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpanded(expanded === tc.id ? null : tc.id)}
                  >
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{tc.tool_name}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {tc.message_content ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(tc.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {expanded === tc.id ? "▲" : "▼"}
                    </TableCell>
                  </TableRow>
                  {expanded === tc.id && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="grid gap-3 p-2 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-semibold text-muted-foreground">INPUT</p>
                            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                              {formatJson(tc.input_json)}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-semibold text-muted-foreground">OUTPUT</p>
                            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                              {formatJson(tc.output_json)}
                            </pre>
                          </div>
                        </div>
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
  )
}
