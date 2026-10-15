import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

// Captures TCGplayer's daily prices for One Piece (tcgcsv category 68) into
// tcgplayer_prices. Nothing reads them yet: neither tcgcsv nor PriceCharting
// keeps price history, so the history behind a future line graph starts with
// the first capture (docs/price-tracking-spec.md).
//
// tcgcsv publishes once a day, around 20:00Z, and says when in
// last-updated.txt. A run reads that first; if the last ok capture already has
// the same value, it stops ("unchanged"). The cron runs hourly, so a late
// update or a failed run is picked up within the hour: a day missed is a day
// no source can give back. Otherwise it reads every group's
// prices, checks every row, and only then writes, so a malformed feed writes
// nothing. A day's point is replaced, never duplicated, so a re-run is safe.
//
// Run by hand: npx convex run priceCapture:run '{"force": true}'

const BASE = "https://tcgcsv.com/tcgplayer/68";
const LAST_UPDATED = "https://tcgcsv.com/last-updated.txt";
const HEADERS = { "User-Agent": "koala-kollect-prices (+https://koalakollect.app)" };
const BATCH_SIZE = 250;
// A capture row still "running" after this long is treated as dead, not live.
const RUNNING_TTL_MS = 30 * 60 * 1000;

const nullableNumber = v.union(v.number(), v.null());
const priceRow = v.object({
  product_id: v.number(),
  sub_type: v.string(),
  group_id: v.number(),
  market: nullableNumber,
  low: nullableNumber,
  mid: nullableNumber,
  high: nullableNumber,
  direct_low: nullableNumber,
});
type PriceRow = typeof priceRow.type;

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.text();
}

async function getResults(url: string): Promise<unknown[]> {
  const body = JSON.parse(await getText(url)) as { success?: unknown; results?: unknown };
  if (body.success !== true || !Array.isArray(body.results)) throw new Error(`${url}: not a successful tcgcsv response`);
  return body.results;
}

function price(row: Record<string, unknown>, field: string, where: string): number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${where}: ${field} is ${JSON.stringify(value)}`);
  return value;
}

// One tcgcsv price row, checked. Anything unexpected throws, failing the run
// before any write.
export function parsePriceRow(raw: unknown, groupId: number): PriceRow {
  const row = (raw ?? {}) as Record<string, unknown>;
  const where = `group ${groupId} product ${JSON.stringify(row.productId)}`;
  if (typeof row.productId !== "number" || !Number.isInteger(row.productId)) throw new Error(`${where}: productId is not an integer`);
  if (typeof row.subTypeName !== "string" || row.subTypeName === "") throw new Error(`${where}: no subTypeName`);
  return {
    product_id: row.productId,
    sub_type: row.subTypeName,
    group_id: groupId,
    market: price(row, "marketPrice", where),
    low: price(row, "lowPrice", where),
    mid: price(row, "midPrice", where),
    high: price(row, "highPrice", where),
    direct_low: price(row, "directLowPrice", where),
  };
}

// tcgcsv's last-updated.txt (2026-10-15T20:06:01+0000) to the UTC date the
// day's points are written under.
export function captureDay(sourceUpdated: string): string {
  const ms = Date.parse(sourceUpdated.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (!Number.isFinite(ms)) throw new Error(`last-updated.txt is ${JSON.stringify(sourceUpdated)}`);
  return new Date(ms).toISOString().slice(0, 10);
}

export const run = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<"ok" | "unchanged" | "busy" | "failed"> => {
    let sourceUpdated: string;
    let day: string;
    try {
      sourceUpdated = (await getText(LAST_UPDATED)).trim();
      day = captureDay(sourceUpdated);
    } catch (e) {
      // Recorded, so a tcgcsv outage reads as failed runs, not as no runs.
      await ctx.runMutation(internal.priceCapture.recordFailure, { started_at: nowIso(), error: e instanceof Error ? e.message : String(e) });
      return "failed";
    }
    const last = await ctx.runQuery(internal.priceCapture.lastOk, {});
    if (!force && last?.source_updated === sourceUpdated) return "unchanged";

    const captureId = await ctx.runMutation(internal.priceCapture.begin, { source_updated: sourceUpdated, day, started_at: nowIso() });
    if (captureId === null) return "busy";
    try {
      const groups = await getResults(`${BASE}/groups`);
      const rows: PriceRow[] = [];
      const seen = new Set<string>();
      for (const group of groups) {
        const groupId = (group as { groupId?: unknown }).groupId;
        if (typeof groupId !== "number") throw new Error(`a group has groupId ${JSON.stringify(groupId)}`);
        for (const raw of await getResults(`${BASE}/${groupId}/prices`)) {
          const row = parsePriceRow(raw, groupId);
          const key = `${row.product_id}:${row.sub_type}`;
          // A product listed in two groups would get two points for one day.
          if (seen.has(key)) throw new Error(`${key} is priced twice (second time in group ${groupId})`);
          seen.add(key);
          rows.push(row);
        }
      }
      for (let at = 0; at < rows.length; at += BATCH_SIZE) {
        await ctx.runMutation(internal.priceCapture.writeBatch, { day, rows: rows.slice(at, at + BATCH_SIZE) });
      }
      await ctx.runMutation(internal.priceCapture.finish, { captureId, status: "ok", groups: groups.length, rows: rows.length });
      return "ok";
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.priceCapture.finish, { captureId, status: "failed", error });
      return "failed";
    }
  },
});

export const lastOk = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"price_captures"> | null> => {
    return await ctx.db
      .query("price_captures")
      .withIndex("by_started_at")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "ok"))
      .first();
  },
});

// Opens a capture row, or returns null when a live capture is already running.
export const begin = internalMutation({
  args: { source_updated: v.string(), day: v.string(), started_at: v.string() },
  handler: async (ctx, args): Promise<Id<"price_captures"> | null> => {
    const latest = await ctx.db.query("price_captures").withIndex("by_started_at").order("desc").first();
    if (latest?.status === "running") {
      if (Date.now() - Date.parse(latest.started_at) < RUNNING_TTL_MS) return null;
      // An action killed at the time limit never reaches its catch.
      await ctx.db.patch(latest._id, {
        status: "failed",
        error: `abandoned: still running after ${RUNNING_TTL_MS / 60_000} min`,
        finished_at: nowIso(),
      });
    }
    return await ctx.db.insert("price_captures", { ...args, source: "tcgcsv", status: "running" });
  },
});

// A run that failed before it knew tcgcsv's last-updated value.
export const recordFailure = internalMutation({
  args: { started_at: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("price_captures", { ...args, source: "tcgcsv", status: "failed", finished_at: nowIso() });
  },
});

export const finish = internalMutation({
  args: {
    captureId: v.id("price_captures"),
    status: v.union(v.literal("ok"), v.literal("failed")),
    error: v.optional(v.string()),
    groups: v.optional(v.number()),
    rows: v.optional(v.number()),
  },
  handler: async (ctx, { captureId, ...fields }) => {
    if ((await ctx.db.get(captureId))?.status !== "running") return;
    await ctx.db.patch(captureId, { ...fields, finished_at: nowIso() });
  },
});

// Writes one day's point for each row into its month's row, replacing a point
// already there for that day.
export const writeBatch = internalMutation({
  args: { day: v.string(), rows: v.array(priceRow) },
  handler: async (ctx, { day, rows }) => {
    const month = day.slice(0, 7);
    for (const { product_id, sub_type, group_id, ...prices } of rows) {
      const key = `${product_id}:${sub_type}`;
      const point = { d: day, ...prices };
      const existing = await ctx.db
        .query("tcgplayer_prices")
        .withIndex("by_key_month", (q) => q.eq("key", key).eq("month", month))
        .unique();
      if (existing === null) {
        await ctx.db.insert("tcgplayer_prices", { key, product_id, sub_type, group_id, month, points: [point] });
        continue;
      }
      const points = [...existing.points.filter((p) => p.d !== day), point].sort((a, b) => a.d.localeCompare(b.d));
      await ctx.db.patch(existing._id, { group_id, points });
    }
  },
});
