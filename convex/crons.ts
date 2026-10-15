import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pull the card database once a day. A run at a commit already synced is a
// no-op, so this costs one GitHub API call on a quiet day.
crons.daily("sync card data", { hourUTC: 6, minuteUTC: 0 }, internal.dataSync.run, {});

// Capture TCGplayer's prices once a day, after tcgcsv's ~20:00Z update. A run
// that finds tcgcsv not yet updated since the last capture writes nothing.
crons.daily("capture tcgplayer prices", { hourUTC: 21, minuteUTC: 30 }, internal.priceCapture.run, {});

export default crons;
