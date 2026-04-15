import { useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { api as restApi, type Routine } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Id } from "../../convex/_generated/dataModel"

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"]

type RoutineForm = {
  name: string
  prompt: string
  hour: number
  minute: number
  timezone: string
  enabled: boolean
}

const defaultForm: RoutineForm = {
  name: "",
  prompt: "",
  hour: 8,
  minute: 0,
  timezone: "America/New_York",
  enabled: true,
}

function formatSchedule(r: Routine): string {
  const date = new Date()
  date.setHours(r.hour, r.minute, 0, 0)
  return `${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${r.timezone}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Never"
  return parsed.toLocaleString()
}

export default function RoutinesPage() {
  const routinesData = useQuery(api.routines.list)
  const routines: Routine[] = (routinesData ?? []) as unknown as Routine[]
  const loading = routinesData === undefined

  const insertRoutine = useMutation(api.routines.insert)
  const updateRoutine = useMutation(api.routines.update)
  const removeRoutine = useMutation(api.routines.remove)

  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)
  const [form, setForm] = useState<RoutineForm>(defaultForm)

  const sorted = useMemo(
    () => [...routines].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)),
    [routines]
  )

  const openCreate = () => {
    setEditing(null)
    setForm(defaultForm)
    setOpen(true)
  }

  const openEdit = (routine: Routine) => {
    setEditing(routine)
    setForm({
      name: routine.name,
      prompt: routine.prompt,
      hour: routine.hour,
      minute: routine.minute,
      timezone: routine.timezone,
      enabled: routine.enabled,
    })
    setOpen(true)
  }

  const saveRoutine = async () => {
    setSaving(true)
    try {
      if (editing) {
        await updateRoutine({
          id: editing.id as Id<"routines">,
          ...form,
        })
      } else {
        await insertRoutine(form)
      }
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (routine: Routine) => {
    await updateRoutine({
      id: String(routine.id) as Id<"routines">,
      enabled: !routine.enabled,
    })
  }

  const handleDelete = async (routineId: string | number) => {
    await removeRoutine({ id: String(routineId) as Id<"routines"> })
  }

  const handleRunNow = async (routineId: string | number) => {
    const rid = String(routineId)
    setRunningId(rid)
    try {
      await restApi.runRoutineNow(rid)
    } finally {
      setRunningId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center">
        <div>
          <h2 className="text-lg font-semibold">Routines</h2>
          <p className="text-sm text-muted-foreground">Build and schedule automated prompts for your agent.</p>
        </div>
        <Button className="ml-auto" onClick={openCreate}>New Routine</Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Loading routines...</TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No routines yet. Create one to get started.</TableCell>
              </TableRow>
            ) : (
              sorted.map(routine => (
                <TableRow key={routine.id}>
                  <TableCell>
                    <div className="font-medium">{routine.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{routine.prompt}</div>
                  </TableCell>
                  <TableCell>{formatSchedule(routine)}</TableCell>
                  <TableCell>
                    <Badge variant={routine.enabled ? "secondary" : "outline"}>
                      {routine.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(routine.last_run_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleToggle(routine)}>
                        {routine.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRunNow(routine.id)} disabled={runningId === String(routine.id)}>
                        {runningId === String(routine.id) ? "Running..." : "Run Now"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(routine)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(routine.id)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Routine" : "New Routine"}</DialogTitle>
            <DialogDescription>Configure when this routine runs and what prompt it sends.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              placeholder="Routine name"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Prompt to send to the agent"
              value={form.prompt}
              onChange={e => setForm(prev => ({ ...prev, prompt: e.target.value }))}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                type="number"
                min={0}
                max={23}
                value={form.hour}
                onChange={e => setForm(prev => ({ ...prev, hour: Number(e.target.value) }))}
                placeholder="Hour"
              />
              <Input
                type="number"
                min={0}
                max={59}
                value={form.minute}
                onChange={e => setForm(prev => ({ ...prev, minute: Number(e.target.value) }))}
                placeholder="Minute"
              />
              <Select
                value={form.timezone}
                onValueChange={tz => setForm(prev => ({ ...prev, timezone: tz }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={form.enabled ? "secondary" : "outline"}
              onClick={() => setForm(prev => ({ ...prev, enabled: !prev.enabled }))}
            >
              {form.enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveRoutine} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update Routine" : "Create Routine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
