import { useEffect, useState } from "react"
import { api, type DbColumn } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight, Database } from "lucide-react"

const DB_LIMIT = 50

export default function DbViewer() {
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState("")
  const [schema, setSchema] = useState<DbColumn[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbPage, setDbPage] = useState(0)
  const [loading, setLoading] = useState(false)

  // Load table list once
  useEffect(() => {
    api.getDbTables()
      .then(d => { setTables(d.tables); if (d.tables.length) setSelectedTable(d.tables[0]) })
      .catch(console.error)
  }, [])

  // Load schema + first page when table changes
  useEffect(() => {
    if (!selectedTable) return
    setLoading(true)
    setDbPage(0)
    Promise.all([
      api.getTableSchema(selectedTable),
      api.getTableRows(selectedTable, DB_LIMIT, 0),
    ]).then(([s, r]) => {
      setSchema(s.columns)
      setRows(r.rows)
      setDbTotal(r.total)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedTable])

  // Reload rows when page changes (but not on table change — that's handled above)
  useEffect(() => {
    if (!selectedTable || dbPage === 0) return
    setLoading(true)
    api.getTableRows(selectedTable, DB_LIMIT, dbPage * DB_LIMIT)
      .then(r => { setRows(r.rows); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dbPage, selectedTable])

  return (
    <div className="flex gap-4" style={{ minHeight: "500px" }}>
      {/* Left sidebar — table list */}
      <div className="w-48 shrink-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tables</span>
        </div>
        {tables.length === 0 ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          tables.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTable(t)}
              className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${
                selectedTable === t ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))
        )}
      </div>

      {/* Right panel — schema + rows */}
      <div className="flex flex-1 flex-col gap-3 min-w-0">
        {selectedTable && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold mr-1">{selectedTable}</span>
            {schema.map(col => (
              <Badge key={col.name} variant="outline" className="text-[10px]">
                {col.name}
                <span className="ml-1 text-muted-foreground">{col.type || "TEXT"}</span>
              </Badge>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{dbTotal} rows</span>
          </div>
        )}

        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            {loading ? (
              <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            ) : rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No rows found.</p>
            ) : (
              <ScrollArea className="h-[440px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(rows[0]).map(col => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((val, j) => (
                          <TableCell key={j} className="text-xs max-w-[200px] truncate">
                            {val === null
                              ? <span className="text-muted-foreground italic">null</span>
                              : String(val)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={dbPage === 0} onClick={() => setDbPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {dbPage + 1} of {Math.max(1, Math.ceil(dbTotal / DB_LIMIT))}
          </span>
          <Button variant="outline" size="sm" disabled={(dbPage + 1) * DB_LIMIT >= dbTotal} onClick={() => setDbPage(p => p + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}
