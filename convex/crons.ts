import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pull the card database once a day. A run at a commit already synced is a
// no-op, so this costs one GitHub API call on a quiet day.
crons.daily("sync card data", { hourUTC: 6, minuteUTC: 0 }, internal.dataSync.run, {});

export default crons;
