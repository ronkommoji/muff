import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PanelLeft } from "lucide-react"

const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_COLLAPSED = "3.5rem"

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{ "--sidebar-width": collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH } as React.CSSProperties}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return React.useContext(SidebarContext)
}

export function Sidebar({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out overflow-hidden shrink-0",
        collapsed ? "w-14" : "w-64",
        className
      )}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex h-14 items-center border-b px-3 shrink-0", className)}>{children}</div>
}

export function SidebarContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-1 flex-col gap-1 overflow-y-auto p-2", className)}>{children}</div>
}

export function SidebarFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border-t p-2 shrink-0", className)}>{children}</div>
}

export function SidebarGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>
}

export function SidebarGroupLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  if (collapsed) return null
  return (
    <span className={cn("px-2 py-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50", className)}>
      {children}
    </span>
  )
}

export function SidebarGroupContent({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>
}

export function SidebarMenu({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>
}

export function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>
}

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  tooltip?: string
}

export function SidebarMenuButton({ className, isActive, tooltip, children, ...props }: SidebarMenuButtonProps) {
  const { collapsed } = useSidebar()
  return (
    <button
      title={collapsed ? tooltip : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        collapsed && "justify-center px-0",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { collapsed, setCollapsed } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={() => setCollapsed(!collapsed)}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
}

export function SidebarInset({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-1 flex-col overflow-hidden", className)}>{children}</div>
}
