import { useEffect, useState } from "react"
import { api, type Memory } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Brain } from "lucide-react"
import MemoryGraph from "@/components/MemoryGraph"

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    api.getMemories("", 100)
      .then(d => { setMemories(d.memories); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSearch = async () => {
    setSearching(true)
    const q = query.trim() ? query : ""
    api.getMemories(q, 100)
      .then(d => { setMemories(d.memories); setSearching(false) })
      .catch(() => setSearching(false))
  }

  const handleClear = () => {
    setQuery("")
    setLoading(true)
    api.getMemories("", 100)
      .then(d => { setMemories(d.memories); setLoading(false) })
      .catch(() => setLoading(false))
  }

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      {/* Header + search */}
      <div className="flex items-center gap-3 shrink-0">
        <Brain className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Memory</h2>
        <Badge variant="secondary">{memories.length} stored</Badge>
        <div className="ml-auto flex gap-2">
          <Input
            placeholder="Search memories…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="w-64"
          />
          <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
            <Search className="h-4 w-4" />
          </Button>
          {query && (
            <Button variant="ghost" size="sm" onClick={handleClear}>Clear</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="list" className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
        </TabsList>

        {/* List tab */}
        <TabsContent value="list" className="flex-1 min-h-0 mt-3">
          <Card className="h-full overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-4">
                {loading || searching ? (
                  [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                ) : memories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Brain className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">No memories found.</p>
                  </div>
                ) : (
                  memories.map((m, i) => (
                    <div key={m.id ?? i} className="rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors">
                      <p className="text-sm leading-relaxed">{m.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {m.is_static && (
                          <Badge className="text-[10px] bg-rose-600 hover:bg-rose-600">static</Badge>
                        )}
                        {!!(m.metadata?.["source"]) && (
                          <Badge variant="outline" className="text-[10px]">
                            {String(m.metadata["source"])}
                          </Badge>
                        )}
                        {m.created_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(m.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* Graph tab */}
        <TabsContent value="graph" className="flex-1 min-h-0 mt-3">
          <Card className="h-full overflow-hidden">
            <CardContent className="p-0 h-full">
              <MemoryGraph />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
