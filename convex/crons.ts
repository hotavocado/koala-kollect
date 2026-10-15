import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pull the card database once a day. A run at a commit already synced is a
// no-op, so this costs one GitHub API call on a quiet day.
crons.daily("sync card data", { hourUTC: 6, minuteUTC: 0 }, internal.dataSync.run, {});

// Capture TCGplayer's prices after tcgcsv's daily ~20:00Z update. Hourly, so a
// late update or a failed run is retried within the hour; a run that finds
// tcgcsv not updated since the last ok capture fetches one small file and
// writes nothing.
crons.hourly("capture tcgplayer prices", { minuteUTC: 30 }, internal.priceCapture.run, {});

export default crons;
