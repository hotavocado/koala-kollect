/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { loadPrinting } from "./cards";
import fixtureV2 from "./fixtures/contract-v2-valid.jsonl?raw";
import schema from "./schema";
import { type RecordType, RETIRED_TYPE, TYPE_TO_TABLE, sha256Hex } from "./syncCore";

// A print's origin, read off data written by the real sync. The base is the
// contract's v2 examples (data 56ff7c3, byte for byte). They hold one real
// origin case: prt_0cvlfhj8iyh4 listed under the jp bucket and a product
// minted from its source text. A second commit adds the rows the other cases
// need and syncs them the same way, as the data repo would.
//
// One v2 row is left out of both commits: the printing_design convex/schema.ts
// refuses for its missing confidence (dataSync.test.ts, "contract v2
// examples", records that finding). It says nothing about origin, and with it
// the sync stops before the products are written.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const T = "2026-10-15T00:00:00Z";
const ZORO = "card_0a1b2c3d4e5f";
const ATMOS = "card_op17002atmos";

type Rec = { key: string } & Record<string, unknown>;
type Row = { type: string; record: Rec };

const v2Rows = (): Row[] =>
  fixtureV2
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => !(r.type === "printing_design" && r.record.key === "prt_000000000001"));

// v2 products the cases lean on, by what they are in the examples.
const BUCKET = "en:569901"; // Promotion card, is_bucket
const MINTED = "jp:src_0123456789ab"; // minted from source text, no series_id
// v2's own case (1): a jp printing under the jp limited bucket and the product
// minted from its source text. Its card has no row in the examples.
const REAL_PRINT = "prt_0cvlfhj8iyh4";
const REAL_CARD = "card_u7r535idr6h9";
const JP_BUCKET = "jp:550801";
const REAL_MINTED = "jp:src_65d97f38684b";
const OP17_JP = "jp:550117"; // jp OP-17 booster, dated
const BOOSTER = "en:569117"; // added below: en OP-17 booster with a product page

function enPrinting(key: string, variant: string): Row {
  return {
    type: "printing",
    record: {
      key,
      card_key: ZORO,
      site: "en",
      rarity: "L",
      variant,
      image_url: `https://en.onepiece-cardgame.com/images/cardlist/card/${key}.png`,
      source_text: "Promotion card",
      block_icon: 1,
      first_seen_at: T,
    },
  };
}

function link(printing: string, product: string, removedAt?: string): Row {
  return {
    type: "printing_product",
    record: {
      key: `${printing}@${product}`,
      printing_key: printing,
      product_key: product,
      first_seen_at: T,
      ...(removedAt && { removed_at: removedAt }),
    },
  };
}

function claim(key: string, printing: string, distribution: string): Row {
  return {
    type: "printing_distribution",
    record: {
      key,
      printing_key: printing,
      distribution_key: distribution,
      source: "official_event",
      source_url: "https://www.onepiece-cardgame.com/events/cs/",
      quote: "参加賞",
      confidence: "authoritative",
      observed_at: T,
    },
  };
}

// (1b) as v2's own case (1), plus a claim: still the minted product.
const BUCKET_AND_MINTED = "prt_000000000002";
// (2) bucket only + a claim: the distribution.
const BUCKET_AND_CLAIM = "prt_000000000003";
// (3) a set card under its booster: the booster.
const SET_CARD = "prt_000000000004";
// (4) bucket only, no claims: none.
const BUCKET_ONLY = "prt_0000000000b4";
// (5) a removed real listing, the only current one a bucket: the real product.
const REMOVED_REAL = "prt_0000000000b5";
// (6) v2's own: listed under a product row that never synced, one claim.
const MISSING_PRODUCT = "prt_000000000001";
// v2's own stamped Release Event print, once its card exists.
const STAMPED = "prt_op17002stamp";

const EXTRA: Row[] = [
  {
    type: "product",
    record: {
      key: BOOSTER,
      site: "en",
      series_id: "569117",
      code: "OP-17",
      name: "The World's Strongest Warriors",
      kind: "booster",
      release_date: "2026-11-07",
      release_date_source: "https://en.onepiece-cardgame.com/products/boosters/op17.php",
      product_url: "https://en.onepiece-cardgame.com/products/boosters/op17.php",
      first_seen_at: T,
    },
  },
  // v2 names these cards on their printings but carries no row for them. A
  // card row only lets cards.print read the printing; no origin row is added.
  {
    type: "card",
    record: {
      key: REAL_CARD,
      number: "OP08-105",
      category: "character",
      colors: ["purple"],
      attributes: ["special"],
      facts_site: "jp",
      first_seen_at: T,
    },
  },
  {
    type: "card",
    record: {
      key: ATMOS,
      number: "OP17-002",
      category: "character",
      colors: ["red"],
      attributes: ["strike"],
      facts_site: "jp",
      first_seen_at: T,
    },
  },
  enPrinting(BUCKET_ONLY, "alt_art"),
  enPrinting(REMOVED_REAL, "reprint"),
  link(BUCKET_AND_MINTED, BUCKET),
  link(BUCKET_AND_MINTED, MINTED),
  claim("ev_00000000000000c1", BUCKET_AND_MINTED, "dist_0000000000a3"),
  link(BUCKET_AND_CLAIM, BUCKET),
  claim("ev_00000000000000c2", BUCKET_AND_CLAIM, "dist_0000000000a2"),
  link(SET_CARD, BOOSTER),
  link(BUCKET_ONLY, BUCKET),
  link(REMOVED_REAL, OP17_JP, "2026-10-01T00:00:00Z"),
  link(REMOVED_REAL, BUCKET),
];

// The data repo's layout, as dataSync.test.ts builds it: one file per type,
// or per type and site. Every row here is a mapped type or the retired list;
// ingest_run is audit only and never in a manifest, and nothing else is
// dropped.
const ONE_FILE: ReadonlySet<string> = new Set(["card", "distribution", "printing_distribution"]);
function files(rows: Row[]): Record<string, { type: string; lines: string[] }> {
  const out: Record<string, { type: string; lines: string[] }> = {};
  for (const { type, record } of rows) {
    if (type === "ingest_run") continue;
    expect(type in TYPE_TO_TABLE || type === RETIRED_TYPE, type).toBe(true);
    const table = type === RETIRED_TYPE ? "retired_printings" : TYPE_TO_TABLE[type as RecordType];
    const path =
      !ONE_FILE.has(type) && type !== RETIRED_TYPE && typeof record.site === "string"
        ? `data/${table}/${record.site}.jsonl`
        : `data/${table}.jsonl`;
    out[path] ??= { type, lines: [] };
    out[path].lines.push(JSON.stringify(record));
  }
  return out;
}

async function repoAt(rows: Row[]): Promise<Map<string, string>> {
  const enc = new TextEncoder();
  const bodies = new Map<string, string>();
  const manifest = { schema_version: 1, generated_at: T, files: {} as Record<string, unknown> };
  for (const [path, f] of Object.entries(files(rows))) {
    const body = f.lines.map((l) => `${l}\n`).join("");
    bodies.set(path, body);
    manifest.files[path] = { type: f.type, rows: f.lines.length, sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
  }
  bodies.set("manifest.json", JSON.stringify(manifest));
  return bodies;
}

function serve(repos: Record<string, Map<string, string>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/hotavocado\/koala-kollect-data\/([0-9a-f]{40})\/(.+)$/);
      const body = m ? repos[m[1]]?.get(m[2]) : undefined;
      return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// One sync run to its end (run, then the retire chain it schedules).
async function sync(t: ReturnType<typeof convexTest>, commit: string) {
  vi.useFakeTimers();
  try {
    await t.action(internal.dataSync.run, { commit, force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
  const rows = await t.run(async (ctx) => await ctx.db.query("data_syncs").collect());
  return rows.at(-1)!;
}

let synced: Promise<ReturnType<typeof convexTest>> | null = null;
// Both commits synced once and shared: the cases only read.
function syncedData() {
  synced ??= (async () => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt(v2Rows()), [COMMIT_B]: await repoAt([...v2Rows(), ...EXTRA]) });
    expect(await sync(t, COMMIT_A)).toMatchObject({ status: "ok" });
    expect(await sync(t, COMMIT_B)).toMatchObject({ status: "ok", upserted: EXTRA.length });
    vi.unstubAllGlobals();
    return t;
  })();
  return synced;
}

// The v2 examples alone, nothing added: commit A only.
async function v2Only() {
  const t = convexTest(schema, modules);
  serve({ [COMMIT_A]: await repoAt(v2Rows()) });
  expect(await sync(t, COMMIT_A)).toMatchObject({ status: "ok" });
  return t;
}

async function printOf(cardKey: string, printKey: string) {
  const t = await syncedData();
  const print = await t.query(api.cards.print, { cardKey, printKey });
  expect(print, printKey).not.toBeNull();
  return print!.printing;
}

describe("a print's origin on synced v2 data", () => {
  test("(1) v2's own rows, nothing added: under the jp bucket and a minted product, the origin is the minted product", async () => {
    const t = await v2Only();
    // Its card has no row in v2, so no query renders it: read the printing
    // the way both queries do.
    const p = await t.run(async (ctx) => {
      const doc = await ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", REAL_PRINT)).unique();
      return await loadPrinting(ctx, doc!);
    });
    expect(p.origin).toEqual({
      kind: "product",
      productKey: REAL_MINTED,
      code: null,
      name: "プレミアムブースター ONE PIECE CARD THE BEST ストレージボックスセット",
      nameEn: null,
      releaseDate: null,
      productUrl: null,
    });
    // Both undated, and jp:550801 sorts before jp:src_, so only the bucket
    // skip puts the minted product first. The bucket stays listed.
    expect(p.listings.map((l) => [l.productKey, l.isBucket])).toEqual([
      [JP_BUCKET, true],
      [REAL_MINTED, false],
    ]);
    expect(p.claims).toEqual([]);
  });

  test("(1) and on cards.print once its card exists", async () => {
    const p = await printOf(REAL_CARD, REAL_PRINT);
    expect(p.origin).toMatchObject({ kind: "product", productKey: REAL_MINTED });
  });

  test("(1b) a bucket, a minted real product and a claim: the minted product, and the claims are not the origin", async () => {
    const p = await printOf(ZORO, BUCKET_AND_MINTED);
    expect(p.origin).toEqual({
      kind: "product",
      productKey: MINTED,
      code: null,
      name: "オフィシャルプレイマット ネフェルタリ・ビビ",
      nameEn: null,
      releaseDate: null,
      productUrl: null,
    });
    // The bucket sorts first (both undated, en: before jp:), so only the
    // bucket skip puts the minted product ahead of it. It stays listed.
    expect(p.listings.map((l) => [l.productKey, l.isBucket])).toEqual([
      [BUCKET, true],
      [MINTED, false],
    ]);
    expect(p.claims.map((c) => c.distribution?.name)).toEqual(["チャンピオンシップ"]);
  });

  test("(2) a bucket and a claim: the distribution", async () => {
    const p = await printOf(ZORO, BUCKET_AND_CLAIM);
    expect(p.origin).toEqual({ kind: "distribution", names: ["冠军赛 参与奖"] });
    expect(p.listings.map((l) => l.productKey)).toEqual([BUCKET]);
  });

  test("(3) a set card under its booster: the booster, with its date and product page", async () => {
    const p = await printOf(ZORO, SET_CARD);
    expect(p.origin).toEqual({
      kind: "product",
      productKey: BOOSTER,
      code: "OP-17",
      name: "The World's Strongest Warriors",
      nameEn: null,
      releaseDate: "2026-11-07",
      productUrl: "https://en.onepiece-cardgame.com/products/boosters/op17.php",
    });
  });

  test("(4) a bucket and no claims: no origin", async () => {
    const p = await printOf(ZORO, BUCKET_ONLY);
    expect(p.origin).toBeNull();
    expect(p.listings.map((l) => [l.productKey, l.isBucket])).toEqual([[BUCKET, true]]);
  });

  test("(5) a removed real listing still counts, ahead of a current bucket", async () => {
    const p = await printOf(ZORO, REMOVED_REAL);
    expect(p.listings.map((l) => [l.productKey, l.removedAt])).toEqual([
      [BUCKET, null],
      [OP17_JP, "2026-10-01T00:00:00Z"],
    ]);
    expect(p.origin).toMatchObject({ kind: "product", productKey: OP17_JP, code: "OP-17", releaseDate: "2026-08-22" });
  });

  test("(6) a listing whose product row never synced is not a product: the claim's distribution", async () => {
    const p = await printOf(ZORO, MISSING_PRODUCT);
    expect(p.listings).toMatchObject([{ productKey: "en:569101", name: null, isBucket: false }]);
    expect(p.origin).toEqual({ kind: "distribution", names: ["Store Tournament Vol.4"] });
  });

  test("a stamped Release Event print keeps its event pack", async () => {
    const p = await printOf(ATMOS, STAMPED);
    expect(p.listings).toEqual([]);
    expect(p.origin).toEqual({ kind: "distribution", names: ["The World's Strongest Warriors Release Event Cards"] });
  });

  test("the card page carries the same origin on each printing, and the bucket rows are kept", async () => {
    const t = await syncedData();
    const card = await t.query(api.cards.detail, { key: ZORO });
    const byKey = Object.fromEntries((card?.regions ?? []).flatMap((r) => r.printings).map((p) => [p.key, p.origin]));
    expect(
      Object.fromEntries(
        Object.entries(byKey).map(([k, o]) => [k, o === null ? null : o.kind === "product" ? o.productKey : o.names]),
      ),
    ).toEqual({
      [MISSING_PRODUCT]: ["Store Tournament Vol.4"],
      [BUCKET_AND_MINTED]: MINTED,
      [BUCKET_AND_CLAIM]: ["冠军赛 参与奖"],
      [SET_CARD]: BOOSTER,
      [BUCKET_ONLY]: null,
      [REMOVED_REAL]: OP17_JP,
    });
    // The read skips buckets; it never removes them. Every bucket link the
    // second commit sent is still a current printing_products row.
    const bucketLinks = await t.run(
      async (ctx) => await ctx.db.query("printing_products").withIndex("by_product", (q) => q.eq("product_key", BUCKET)).collect(),
    );
    expect(bucketLinks.map((l) => [l.printing_key, l.removed_at ?? null]).sort()).toEqual(
      [BUCKET_AND_CLAIM, BUCKET_AND_MINTED, BUCKET_ONLY, REMOVED_REAL].sort().map((k) => [k, null]),
    );
  });
});
