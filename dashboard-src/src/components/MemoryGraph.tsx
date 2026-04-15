import { useEffect, useRef, useState } from "react"
import { Network as VisNetwork, DataSet } from "vis-network/standalone"
import { Network } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { api, type GraphData, type GraphMemory, type Memory } from "@/lib/api"

// ── Node colours ──────────────────────────────────────────────────────────────

const CHANGE_TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  created:  { bg: "hsl(220 70% 50%)", border: "hsl(220 70% 38%)" },
  updated:  { bg: "hsl(38  80% 48%)", border: "hsl(38  80% 36%)" },
  extended: { bg: "hsl(160 55% 40%)", border: "hsl(160 55% 30%)" },
  derived:  { bg: "hsl(270 55% 50%)", border: "hsl(270 55% 38%)" },
  forgotten:{ bg: "hsl(0   0%  55%)", border: "hsl(0   0%  40%)" },
}
const STATIC_COLOR  = { bg: "hsl(340 65% 48%)", border: "hsl(340 65% 36%)" }
const DEFAULT_COLOR = CHANGE_TYPE_COLORS.created

function nodeColor(mem: GraphMemory) {
  if (mem.isStatic) return STATIC_COLOR
  return CHANGE_TYPE_COLORS[mem.changeType] ?? DEFAULT_COLOR
}

// ── Edge colour from similarity score ────────────────────────────────────────

function edgeColor(similarity: number): string {
  const alpha = Math.round(30 + similarity * 180)
  return `rgba(100, 150, 255, ${(alpha / 255).toFixed(2)})`
}

// ── Legend items ──────────────────────────────────────────────────────────────

const LEGEND = [
  { label: "static (permanent)",  color: STATIC_COLOR.bg },
  { label: "created",             color: CHANGE_TYPE_COLORS.created.bg },
  { label: "updated",             color: CHANGE_TYPE_COLORS.updated.bg },
  { label: "extended",            color: CHANGE_TYPE_COLORS.extended.bg },
  { label: "derived (inferred)",  color: CHANGE_TYPE_COLORS.derived.bg },
]

// ── Build vis-network datasets from real graph API data ───────────────────────

function buildGraphFromApi(data: GraphData) {
  const memById = new Map<string, GraphMemory>()
  const nodes: object[] = []

  for (const doc of data.documents) {
    for (const mem of doc.memories) {
      if (mem.isForgotten) continue
      memById.set(mem.id, mem)
      const col = nodeColor(mem)
      const label = mem.memory.length > 55 ? mem.memory.slice(0, 55) + "…" : mem.memory
      nodes.push({
        id: mem.id,
        label,
        title: [
          mem.memory,
          `Type: ${mem.isStatic ? "static" : mem.changeType}`,
          mem.version > 1 ? `v${mem.version}` : null,
          mem.isInference ? "inferred" : null,
        ].filter(Boolean).join("\n"),
        color: { background: col.bg, border: col.border },
        font: { size: 11, color: "#ffffff" },
      })
    }
  }

  const edges: object[] = []
  const seen = new Set<string>()
  for (const edge of data.edges ?? []) {
    const key = [edge.source, edge.target].sort().join(":")
    if (seen.has(key)) continue
    if (!memById.has(edge.source) || !memById.has(edge.target)) continue
    seen.add(key)

    const srcMem = memById.get(edge.source)!
    const relType = srcMem.memoryRelations?.[edge.target] ?? ""
    const isVersionEdge = relType === "updates" || relType === "extends"

    edges.push({
      from: edge.source,
      to: edge.target,
      id: key,
      color: { color: isVersionEdge ? "hsl(38 80% 55%)" : edgeColor(edge.similarity) },
      width: isVersionEdge ? 2 : 1,
      dashes: relType === "derives",
      title: relType
        ? `${relType} (similarity: ${edge.similarity.toFixed(2)})`
        : `similarity: ${edge.similarity.toFixed(2)}`,
    })
  }

  return { nodes, edges, totalMemories: memById.size, totalEdges: edges.length }
}

// ── Fallback: build nodes-only graph from list_memories data ─────────────────

function buildGraphFromList(memories: Memory[]) {
  const nodes: object[] = memories.map((m, i) => ({
    id: m.id ?? String(i),
    label: (m.content.length > 55 ? m.content.slice(0, 55) + "…" : m.content),
    title: m.content,
    color: m.is_static
      ? { background: STATIC_COLOR.bg, border: STATIC_COLOR.border }
      : { background: DEFAULT_COLOR.bg, border: DEFAULT_COLOR.border },
    font: { size: 11, color: "#ffffff" },
  }))

  return { nodes, edges: [], totalMemories: nodes.length, totalEdges: 0 }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MemoryGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef   = useRef<VisNetwork | null>(null)

  const [graphData,    setGraphData]    = useState<GraphData | null>(null)
  const [listMemories, setListMemories] = useState<Memory[] | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [apiError,     setApiError]     = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    const loadGraph = async () => {
      // Always try the real graph API first
      try {
        const data = await api.getGraph()
        const hasMemories = (data.documents ?? []).flatMap(d => d.memories).some(m => !m.isForgotten)

        if (hasMemories) {
          setGraphData(data)
          setLoading(false)
          return
        }

        // Graph API returned empty (or a server-side error was swallowed)
        const errMsg = data.error ? `Graph API: ${data.error}` : "Graph API returned no data"
        setApiError(errMsg)
      } catch (e) {
        setApiError(String(e))
      }

      // Fallback: load from the list endpoint (always works)
      try {
        const listData = await api.getMemories("", 100)
        setListMemories(listData.memories)
        setUsingFallback(true)
      } catch (e) {
        setApiError(prev => `${prev ?? ""}; list also failed: ${e}`)
      }

      setLoading(false)
    }

    loadGraph()
  }, [])

  const built = (() => {
    if (graphData) return buildGraphFromApi(graphData)
    if (listMemories && listMemories.length > 0) return buildGraphFromList(listMemories)
    return null
  })()

  useEffect(() => {
    if (!containerRef.current || !built || built.nodes.length === 0) return

    const nodesDS = new DataSet(built.nodes as never[])
    const edgesDS = new DataSet(built.edges as never[])

    networkRef.current?.destroy()
    networkRef.current = new VisNetwork(
      containerRef.current,
      { nodes: nodesDS, edges: edgesDS },
      {
        physics: {
          enabled: true,
          stabilization: { iterations: 150 },
          barnesHut: { gravitationalConstant: -4000, springLength: 140, damping: 0.15 },
        },
        nodes: {
          shape: "box",
          borderWidth: 1,
          borderWidthSelected: 2,
          widthConstraint: { maximum: 200 },
        },
        edges: {
          width: 1,
          smooth: { enabled: true, type: "continuous", roundness: 0.25 },
        },
        interaction: { hover: true, tooltipDelay: 80 },
        layout: { randomSeed: 42 },
      }
    )

    return () => {
      networkRef.current?.destroy()
      networkRef.current = null
    }
  }, [built])

  if (loading) return <Skeleton className="h-full w-full" />

  if (!built || built.totalMemories === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Network className="mx-auto h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No memories yet — graph will populate as you chat.</p>
          {apiError && (
            <p className="text-[10px] mt-2 text-destructive max-w-xs mx-auto">{apiError}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{built.totalMemories} memories</Badge>
          {!usingFallback && (
            <Badge variant="secondary" className="text-[10px]">{built.totalEdges} connections</Badge>
          )}
          {usingFallback && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              nodes only — no edge data
            </Badge>
          )}
        </div>

        {!usingFallback && (
          <div className="rounded-md border bg-card/90 backdrop-blur-sm px-3 py-2 flex flex-col gap-1">
            {LEGEND.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-block h-px w-4 shrink-0" style={{ borderTop: "2px solid hsl(38 80% 55%)" }} />
              <span className="text-[10px] text-muted-foreground">updates / extends</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 shrink-0 border-t border-dashed" style={{ borderColor: "hsl(215 20% 65%)" }} />
              <span className="text-[10px] text-muted-foreground">derives</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
