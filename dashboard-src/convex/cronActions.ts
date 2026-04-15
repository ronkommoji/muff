import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

async function callPythonBackend(prompt: string, routineId?: string) {
  const backendUrl = process.env.PYTHON_BACKEND_URL;
  if (!backendUrl) {
    console.error("PYTHON_BACKEND_URL not set in Convex environment");
    return;
  }
  const resp = await fetch(`${backendUrl}/internal/run-routine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, routine_id: routineId ?? null }),
  });
  if (!resp.ok) {
    console.error(`Python backend returned ${resp.status}: ${await resp.text()}`);
  }
}

export const morningBriefing = internalAction({
  handler: async () => {
    const prompt =
      "Good morning! Give me a quick daily briefing: " +
      "anything on my calendar today, and check if I have any urgent unread emails.";
    await callPythonBackend(prompt);
  },
});

export const checkRoutines = internalAction({
  handler: async (ctx) => {
    const routines = await ctx.runQuery(internal.routines.listEnabled);

    const now = new Date();
    for (const routine of routines) {
      const currentInTz = new Intl.DateTimeFormat("en-US", {
        timeZone: routine.timezone,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).format(now);
      const [hStr, mStr] = currentInTz.split(":");
      const currentHour = parseInt(hStr, 10);
      const currentMinute = parseInt(mStr, 10);

      if (currentHour !== routine.hour || currentMinute !== routine.minute) {
        continue;
      }

      if (routine.lastRunAt) {
        const hoursSinceRun =
          (now.getTime() - routine.lastRunAt) / (1000 * 60 * 60);
        if (hoursSinceRun < 23) continue;
      }

      console.log(`[cron] Triggering routine: ${routine.name}`);
      await callPythonBackend(routine.prompt, routine._id);
      await ctx.runMutation(internal.routines.touchLastRun, {
        id: routine._id,
      });
    }
  },
});
