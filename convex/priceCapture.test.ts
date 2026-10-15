/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { captureDay, parsePriceRow } from "./priceCapture";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const newTest = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof newTest>;

type Feed = { updated: string; groups: Record<number, unknown[]> };

function priceRow(productId: number, subTypeName: string, market: number | null): Record<string, unknown> {
  return { productId, subTypeName, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: market, directLowPrice: null };
}

// Serves tcgcsv's three endpoints from a feed the test can change between runs.
function serve(feed: Feed) {
  const fetchMock = vi.fn(async (url: string) => {
    const json = (results: unknown[]) => new Response(JSON.stringify({ success: true, errors: [], results }));
    if (url === "https://tcgcsv.com/last-updated.txt") return new Response(feed.updated);
    if (url === "https://tcgcsv.com/tcgplayer/68/groups") return json(Object.keys(feed.groups).map((id) => ({ groupId: Number(id) })));
    const m = url.match(/^https:\/\/tcgcsv\.com\/tcgplayer\/68\/(\d+)\/prices$/);
    if (m && feed.groups[Number(m[1])]) return json(feed.groups[Number(m[1])]);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function prices(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("tcgplayer_prices").collect());
}
async function captures(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("price_captures").collect());
}

describe("priceCapture.run", () => {
  test("writes one row per product and finish, with the day's point, and closes the capture ok", async () => {
    const t = newTest();
    serve({ updated: "2026-10-15T20:06:01+0000", groups: { 17659: [priceRow(409506, "Normal", 2100.68), priceRow(409506, "Foil", null)], 24068: [priceRow(512344, "Normal", 0.25)] } });
    expect(await t.action(internal.priceCapture.run, {})).toBe("ok");

    const rows = (await prices(t)).sort((a, b) => a.key.localeCompare(b.key));
    expect(rows.map((r) => [r.key, r.group_id, r.month])).toEqual([
      ["409506:Foil", 17659, "2026-10"],
      ["409506:Normal", 17659, "2026-10"],
      ["512344:Normal", 24068, "2026-10"],
    ]);
    expect(rows[1].points).toEqual([{ d: "2026-10-15", market: 2100.68, low: 1, mid: 2, high: 3, direct_low: null }]);
    expect(rows[0].points[0].market).toBeNull();

    const [capture] = await captures(t);
    expect(capture).toMatchObject({ status: "ok", source: "tcgcsv", source_updated: "2026-10-15T20:06:01+0000", day: "2026-10-15", groups: 2, rows: 3 });
    expect(capture.finished_at).toBeDefined();
  });

  test("stops without a capture row when tcgcsv has not updated since the last ok capture", async () => {
    const t = newTest();
    const fetchMock = serve({ updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(1, "Normal", 5)] } });
    await t.action(internal.priceCapture.run, {});
    fetchMock.mockClear();

    expect(await t.action(internal.priceCapture.run, {})).toBe("unchanged");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://tcgcsv.com/last-updated.txt"]);
    expect(await captures(t)).toHaveLength(1);
  });

  test("adds the next day's point to the month's row, and a forced re-run replaces a day rather than repeating it", async () => {
    const t = newTest();
    const feed: Feed = { updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(1, "Normal", 5)] } };
    serve(feed);
    await t.action(internal.priceCapture.run, {});
    feed.updated = "2026-10-16T20:04:00+0000";
    feed.groups[1] = [priceRow(1, "Normal", 6)];
    await t.action(internal.priceCapture.run, {});
    feed.groups[1] = [priceRow(1, "Normal", 7)];
    expect(await t.action(internal.priceCapture.run, { force: true })).toBe("ok");

    const rows = await prices(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].points.map((p) => [p.d, p.market])).toEqual([
      ["2026-10-15", 5],
      ["2026-10-16", 7],
    ]);
    expect(await captures(t)).toHaveLength(3);
  });

  test("starts a new row when the month turns", async () => {
    const t = newTest();
    const feed: Feed = { updated: "2026-10-31T20:00:00+0000", groups: { 1: [priceRow(1, "Normal", 5)] } };
    serve(feed);
    await t.action(internal.priceCapture.run, {});
    feed.updated = "2026-11-01T20:00:00+0000";
    await t.action(internal.priceCapture.run, {});

    const rows = (await prices(t)).sort((a, b) => a.month.localeCompare(b.month));
    expect(rows.map((r) => [r.month, r.points.map((p) => p.d)])).toEqual([
      ["2026-10", ["2026-10-31"]],
      ["2026-11", ["2026-11-01"]],
    ]);
  });

  test("a malformed row fails the capture and writes nothing", async () => {
    const t = newTest();
    serve({ updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(1, "Normal", 5)], 2: [{ productId: 2, marketPrice: 1 }] } });
    expect(await t.action(internal.priceCapture.run, {})).toBe("failed");

    expect(await prices(t)).toEqual([]);
    const [capture] = await captures(t);
    expect(capture.status).toBe("failed");
    expect(capture.error).toContain("group 2 product 2: no subTypeName");
  });

  test("a product priced in two groups fails the capture and writes nothing", async () => {
    const t = newTest();
    serve({ updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(9, "Normal", 5)], 2: [priceRow(9, "Normal", 6)] } });
    expect(await t.action(internal.priceCapture.run, {})).toBe("failed");

    expect(await prices(t)).toEqual([]);
    expect((await captures(t))[0].error).toBe("9:Normal is priced twice (second time in group 2)");
  });

  test("a failed fetch fails the capture", async () => {
    const t = newTest();
    serve({ updated: "2026-10-15T20:06:01+0000", groups: {} }).mockImplementation(async (url: string) =>
      url.endsWith("last-updated.txt") ? new Response("2026-10-15T20:06:01+0000") : new Response("down", { status: 503 }),
    );
    expect(await t.action(internal.priceCapture.run, {})).toBe("failed");
    expect((await captures(t))[0].error).toBe("https://tcgcsv.com/tcgplayer/68/groups: HTTP 503");
  });

  test("an unreadable last-updated.txt is recorded as a failed run", async () => {
    const t = newTest();
    serve({ updated: "<html>", groups: {} });
    expect(await t.action(internal.priceCapture.run, {})).toBe("failed");
    const [capture] = await captures(t);
    expect(capture).toMatchObject({ status: "failed", error: 'last-updated.txt is "<html>"' });
    expect(capture.day).toBeUndefined();
    expect(await prices(t)).toEqual([]);
  });

  test("a failed run is retried by the next run, though tcgcsv has not updated since", async () => {
    const t = newTest();
    const feed: Feed = { updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(1, "Normal", 5)], 2: [{ productId: 2 }] } };
    serve(feed);
    expect(await t.action(internal.priceCapture.run, {})).toBe("failed");
    feed.groups[2] = [priceRow(2, "Normal", 6)];
    expect(await t.action(internal.priceCapture.run, {})).toBe("ok");
    expect(await prices(t)).toHaveLength(2);
  });

  test("does not start while another capture is running", async () => {
    const t = newTest();
    serve({ updated: "2026-10-15T20:06:01+0000", groups: { 1: [priceRow(1, "Normal", 5)] } });
    await t.run(async (ctx) => {
      await ctx.db.insert("price_captures", { source: "tcgcsv", source_updated: "x", day: "2026-10-15", started_at: new Date().toISOString(), status: "running" });
    });
    expect(await t.action(internal.priceCapture.run, {})).toBe("busy");
    expect(await prices(t)).toEqual([]);
  });
});

describe("parsing", () => {
  test("captureDay reads tcgcsv's +0000 offset as UTC", () => {
    expect(captureDay("2026-10-15T20:06:01+0000\n")).toBe("2026-10-15");
    expect(captureDay("2026-10-15T23:30:00-0200")).toBe("2026-10-16");
    expect(() => captureDay("<html>")).toThrow('last-updated.txt is "<html>"');
  });

  test("parsePriceRow refuses a negative or non-numeric price", () => {
    expect(() => parsePriceRow({ productId: 1, subTypeName: "Normal", marketPrice: -1 }, 7)).toThrow("group 7 product 1: marketPrice is -1");
    expect(() => parsePriceRow({ productId: 1, subTypeName: "Normal", lowPrice: "1.00" }, 7)).toThrow('lowPrice is "1.00"');
    expect(parsePriceRow({ productId: 1, subTypeName: "Normal" }, 7)).toMatchObject({ market: null, low: null, direct_low: null });
  });
});
