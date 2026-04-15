import { cronJobs } from "convex/server";
// import { internal } from "./_generated/api";

const crons = cronJobs();

// Uncomment these when PYTHON_BACKEND_URL points to a publicly reachable server.
// For local dev, use the "Run Now" button in the dashboard or expose your
// server via ngrok/Cloudflare Tunnel, then re-enable.

// crons.daily(
//   "morning-briefing",
//   { hourUTC: 12, minuteUTC: 0 },
//   internal.cronActions.morningBriefing
// );

// crons.interval(
//   "check-routines",
//   { minutes: 1 },
//   internal.cronActions.checkRoutines
// );

export default crons;
