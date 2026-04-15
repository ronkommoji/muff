import { useEffect, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Message, Session } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import MessageBubble from "@/components/MessageBubble"
import type { SSESnapshot } from "@/lib/sse"
import { MessageSquare, Wifi } from "lucide-react"

interface Props { sseSnapshot: SSESnapshot | null }

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 10) {
    return `+${digits.slice(0, digits.length - 10)} (•••) •••-${digits.slice(-4)}`
  }
  return phone
}

export default function ConversationsPage(_props: Props) {
  const sessionsData = useQuery(api.sessions.listAll, { limit: 100 })
  const sessions: Session[] = (sessionsData ?? []) as unknown as Session[]
  const sessionsLoading = sessionsData === undefined

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messagesData = useQuery(
    api.sessions.getSessionMessages,
    selectedId ? { sessionId: selectedId } : "skip"
  )
  const messages: Message[] = (messagesData ?? []) as unknown as Message[]
  const msgsLoading = selectedId !== null && messagesData === undefined

  useEffect(() => {
    if (sessionsData && sessionsData.length > 0 && !selectedId) {
      const active = sessionsData.find((s: { is_active: boolean }) => s.is_active) ?? sessionsData[0]
      if (active) setSelectedId((active as { session_id: string }).session_id)
    }
  }, [sessionsData, selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const selectedSession = sessions.find(s => s.session_id === selectedId)

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="text-sm font-semibold">Sessions</span>
          <Badge variant="secondary" className="text-xs">{sessions.length}</Badge>
        </div>

        <ScrollArea className="flex-1">
          {sessionsLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-10 px-4">
              No sessions yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {sessions.map(s => (
                <button
                  key={s.session_id}
                  onClick={() => setSelectedId(s.session_id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                    s.session_id === selectedId
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-xs font-medium truncate ${
                      s.session_id === selectedId ? "text-primary-foreground" : ""
                    }`}>
                      {maskPhone(s.phone_number)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.is_active && (
                        <span className="flex items-center gap-0.5">
                          <Wifi className={`h-3 w-3 ${
                            s.session_id === selectedId ? "text-primary-foreground/80" : "text-green-500"
                          }`} />
                        </span>
                      )}
                      <span className={`text-[10px] ${
                        s.session_id === selectedId ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}>
                        {formatRelative(s.updated_at)}
                      </span>
                    </div>
                  </div>
                  <p className={`text-[11px] truncate leading-snug ${
                    s.session_id === selectedId ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}>
                    {s.preview ?? "No preview"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            {selectedSession ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">
                  {maskPhone(selectedSession.phone_number)}
                </span>
                {selectedSession.is_active && (
                  <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                    Active
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] font-mono truncate max-w-[160px] shrink-0">
                  {selectedSession.session_id.slice(0, 12)}…
                </Badge>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Select a session</span>
            )}
          </div>
        </div>

        <Card className="flex-1 overflow-hidden m-4 mt-3">
          <ScrollArea className="h-full px-4 py-4">
            {!selectedId ? (
              <p className="text-center text-muted-foreground py-16 text-sm">
                Select a session to view messages
              </p>
            ) : msgsLoading ? (
              <div className="flex flex-col gap-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                    <Skeleton className="h-14 w-48 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-16 text-sm">
                No messages in this session.
              </p>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={bottomRef} />
          </ScrollArea>
        </Card>

        {messages.length > 0 && (
          <div className="px-4 pb-3 shrink-0">
            <p className="text-xs text-muted-foreground text-center">
              {messages.length} message{messages.length !== 1 ? "s" : ""} · started {selectedSession ? new Date(selectedSession.created_at).toLocaleDateString() : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
