import { useEffect, useState } from "react"
import { api, type App } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExternalLink, Search, CheckCircle, Plug, RefreshCw, Activity, AlertTriangle, XCircle } from "lucide-react"

type TestResult = { ok: boolean; status: string; message: string } | null

export default function ConnectorsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [filter, setFilter] = useState("")
  const [appsLoading, setAppsLoading] = useState(true)
  const [oauthApp, setOauthApp] = useState<App | null>(null)
  const [oauthUrl, setOauthUrl] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [isReconnect, setIsReconnect] = useState(false)

  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  const loadApps = () => {
    setAppsLoading(true)
    api.getApps()
      .then(d => { setApps(d.apps); setAppsLoading(false) })
      .catch(() => setAppsLoading(false))
  }

  useEffect(() => { loadApps() }, [])

  const filtered = apps.filter(a =>
    !filter ||
    (a.displayName ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (a.key ?? "").toLowerCase().includes(filter.toLowerCase())
  )

  const connectedApps = apps.filter(a => a.connected)

  const handleConnect = async (app: App) => {
    setIsReconnect(false)
    setOauthApp(app)
    setOauthUrl(null)
    setOauthLoading(true)
    try {
      const res = await api.authorizeApp(app.key)
      setOauthUrl(res.redirect_url ?? null)
    } catch {
      setOauthUrl(null)
    }
    setOauthLoading(false)
  }

  const handleReconnect = async (app: App) => {
    setIsReconnect(true)
    setOauthApp(app)
    setOauthUrl(null)
    setOauthLoading(true)
    try {
      const res = await api.reconnectApp(app.key)
      setOauthUrl(res.redirect_url ?? null)
    } catch {
      setOauthUrl(null)
    }
    setOauthLoading(false)
  }

  const handleTest = async (app: App) => {
    setTestingKey(app.key)
    setTestResults(prev => ({ ...prev, [app.key]: null }))
    try {
      const result = await api.testConnection(app.key)
      setTestResults(prev => ({ ...prev, [app.key]: result }))
    } catch (e) {
      setTestResults(prev => ({
        ...prev,
        [app.key]: { ok: false, status: "error", message: String(e) },
      }))
    }
    setTestingKey(null)
  }

  const handleTestAll = async () => {
    for (const app of connectedApps) {
      await handleTest(app)
    }
  }

  const capitalize = (s: string | undefined | null) =>
    (s ?? "").replace(/\b\w/g, c => c.toUpperCase())

  const TestBadge = ({ appKey }: { appKey: string }) => {
    const result = testResults[appKey]
    if (!result) return null
    if (result.ok) {
      return (
        <Badge variant="secondary" className="gap-1 text-green-600">
          <CheckCircle className="h-3 w-3" /> Healthy
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> {result.status}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Connected summary + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary">{connectedApps.length} connected</Badge>
        </div>
        {connectedApps.map(a => (
          <Badge key={a.key} variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            {capitalize(a.displayName)}
          </Badge>
        ))}
        {connectedApps.length > 0 && (
          <Button variant="outline" size="sm" className="ml-2 h-7 text-xs gap-1" onClick={handleTestAll}>
            <Activity className="h-3 w-3" /> Test All
          </Button>
        )}
      </div>

      {/* Connected apps detail cards */}
      {connectedApps.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connectedApps.map(app => (
            <Card key={app.key} className="border-green-200 dark:border-green-800">
              <CardContent className="flex items-start gap-3 p-4">
                <img
                  src={app.logo}
                  alt={app.displayName}
                  className="h-9 w-9 rounded-lg object-contain shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                />
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{capitalize(app.displayName)}</span>
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <TestBadge appKey={app.key} />
                  </div>
                  {testResults[app.key] && !testResults[app.key]!.ok && (
                    <div className="flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{testResults[app.key]!.message}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleTest(app)}
                      disabled={testingKey === app.key}
                    >
                      {testingKey === app.key ? (
                        <><RefreshCw className="h-3 w-3 animate-spin" /> Testing...</>
                      ) : (
                        <><Activity className="h-3 w-3" /> Test</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleReconnect(app)}
                    >
                      <RefreshCw className="h-3 w-3" /> Reconnect
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold shrink-0">Available Connectors</h2>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search connectors…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="pl-8 w-64"
          />
        </div>
      </div>

      {/* Apps grid */}
      {appsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">No connectors match "{filter}".</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.filter(a => !a.connected).slice(0, 30).map(app => (
            <Card key={app.key} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <img
                  src={app.logo}
                  alt={app.displayName}
                  className="h-9 w-9 rounded-lg object-contain shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                />
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <span className="text-sm font-medium truncate">{capitalize(app.displayName)}</span>
                  {app.categories?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {app.categories.slice(0, 2).join(", ")}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    className="mt-1 h-7 text-xs"
                    onClick={() => handleConnect(app)}
                  >
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* OAuth dialog */}
      <Dialog open={!!oauthApp} onOpenChange={open => { if (!open) { setOauthApp(null); loadApps() } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isReconnect ? "Reconnect" : "Connect"} {oauthApp ? capitalize(oauthApp.displayName) : ""}
            </DialogTitle>
            <DialogDescription>
              {isReconnect
                ? `Click Authorize to refresh your ${oauthApp?.displayName} connection with new OAuth tokens.`
                : `Click Authorize below to connect via OAuth. You'll be redirected to ${oauthApp?.displayName}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOauthApp(null); loadApps() }}>Cancel</Button>
            {oauthLoading ? (
              <Button disabled>Loading…</Button>
            ) : oauthUrl ? (
              <Button asChild>
                <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="gap-1">
                  Authorize <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : (
              <Button disabled>No URL returned</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
