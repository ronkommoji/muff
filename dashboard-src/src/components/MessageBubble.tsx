import type { Message } from "@/lib/api"

interface Props { msg: Message }

export default function MessageBubble({ msg }: Props) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        <p className={`mt-1 text-[10px] ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {new Date(msg.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}
