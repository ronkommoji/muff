import { useState } from "react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useSSE } from "@/lib/sse"
import OverviewPage from "@/pages/OverviewPage"
import ConversationsPage from "@/pages/ConversationsPage"
import MemoryPage from "@/pages/MemoryPage"
import ConnectorsPage from "@/pages/ConnectorsPage"
import RoutinesPage from "@/pages/RoutinesPage"
import LogsPage from "@/pages/LogsPage"
import { LayoutDashboard, MessageSquare, Brain, Plug, ScrollText, Bot, Clock3 } from "lucide-react"

type Page = "overview" | "conversations" | "memory" | "connectors" | "routines" | "logs"

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ElementType; tooltip: string }> = [
  { id: "overview",       label: "Overview",       icon: LayoutDashboard, tooltip: "Overview" },
  { id: "conversations",  label: "Conversations",  icon: MessageSquare,   tooltip: "Conversations" },
  { id: "memory",         label: "Memory",         icon: Brain,           tooltip: "Memory" },
  { id: "connectors",     label: "Connectors",     icon: Plug,            tooltip: "Connectors" },
  { id: "routines",       label: "Routines",       icon: Clock3,          tooltip: "Routines" },
  { id: "logs",           label: "Logs",           icon: ScrollText,      tooltip: "Logs" },
]

export default function App() {
  const [page, setPage] = useState<Page>("overview")
  const { snapshot, connected } = useSSE()

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">Muff</span>
              <span className="text-[10px] text-muted-foreground truncate">Personal AI Agent</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(item => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={page === item.id}
                      tooltip={item.tooltip}
                      onClick={() => setPage(item.id)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className={`h-2 w-2 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-red-400"}`} />
            <span className="text-xs text-muted-foreground truncate">
              {connected
                ? snapshot?.usage
                  ? `$${snapshot.usage.month_cost_usd.toFixed(4)} this month`
                  : "Connected"
                : "Disconnected"}
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 shrink-0">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">{NAV_ITEMS.find(n => n.id === page)?.label}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={connected ? "secondary" : "destructive"} className="text-xs">
              {connected ? "● Live" : "○ Offline"}
            </Badge>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-auto">
          {page === "overview"      && <OverviewPage sseSnapshot={snapshot} connected={connected} />}
          {page === "conversations" && <ConversationsPage sseSnapshot={snapshot} />}
          {page === "memory"        && <MemoryPage />}
          {page === "connectors"    && <ConnectorsPage />}
          {page === "routines"      && <RoutinesPage />}
          {page === "logs"          && <LogsPage sseSnapshot={snapshot} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
