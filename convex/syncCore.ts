// Pure helpers for the data sync: no Convex imports, so they test without a
// backend. The rules come from koala-kollect-data's CONTRACT.md ("Sync (app
// side)"): read manifest.json, check every file's sha256 and row count, refuse
// on any mismatch before writing anything, then upsert by key.

// Contract record type -> Convex table. data_syncs is app-only and not here.
export const TYPE_TO_TABLE = {
  card: "cards",
  card_observation: "card_observations",
  printing: "printings",
  printing_locator: "printing_locators",
  product: "products",
  printing_product: "printing_products",
  distribution: "distributions",
  printing_distribution: "printing_distributions",
  printing_link: "printing_links",
} as const;

export type RecordType = keyof typeof TYPE_TO_TABLE;
export type SyncedTable = (typeof TYPE_TO_TABLE)[RecordType];
export const SYNCED_TABLES = Object.values(TYPE_TO_TABLE) as SyncedTable[];

export type ManifestEntry = { type: RecordType; rows: number; sha256: string };
export type Manifest = {
  schema_version: 1;
  generated_at: string;
  files: Record<string, ManifestEntry>;
};

export type SyncRecord = { key: string } & Record<string, unknown>;

// Every path the contract's layout can produce. Anything else (runs/, a path
// with ..) is refused rather than fetched.
const DATA_PATH = /^data\/(?:[a-z_]+\/)?[a-z_-]+\.jsonl$/;

export class Refusal extends Error {}

export function parseManifest(text: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Refusal("manifest.json is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) throw new Refusal("manifest.json is not an object");
  const m = raw as Record<string, unknown>;
  if (m.schema_version !== 1) {
    throw new Refusal(`manifest.json schema_version is ${JSON.stringify(m.schema_version)}, this app reads 1`);
  }
  if (typeof m.generated_at !== "string") throw new Refusal("manifest.json has no generated_at");
  if (typeof m.files !== "object" || m.files === null) throw new Refusal("manifest.json has no files");

  const files: Record<string, ManifestEntry> = {};
  for (const [path, entry] of Object.entries(m.files as Record<string, unknown>)) {
    if (!DATA_PATH.test(path)) throw new Refusal(`manifest.json lists ${path}, which is not a data file path`);
    const e = entry as Record<string, unknown>;
    if (typeof e?.type !== "string" || !(e.type in TYPE_TO_TABLE)) {
      throw new Refusal(`manifest.json: ${path} has unknown type ${JSON.stringify(e?.type)}`);
    }
    if (typeof e.rows !== "number" || !Number.isInteger(e.rows) || e.rows < 0) {
      throw new Refusal(`manifest.json: ${path} has invalid rows`);
    }
    if (typeof e.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(e.sha256)) {
      throw new Refusal(`manifest.json: ${path} has invalid sha256`);
    }
    files[path] = { type: e.type as RecordType, rows: e.rows, sha256: e.sha256 };
  }
  return { schema_version: 1, generated_at: m.generated_at, files };
}

// Reads main's commit out of git's smart-HTTP ref advertisement
// (GET {repo}.git/info/refs?service=git-upload-pack). Each ref is a pkt-line,
// "{4 hex length}{40 hex sha} refs/heads/main". Used instead of GitHub's REST
// API, whose unauthenticated limit is per IP and is exhausted on Convex's
// shared egress addresses.
export function mainFromRefs(advert: string): string | null {
  const m = advert.match(/([0-9a-f]{40}) refs\/heads\/main(?:\n|\0|$)/);
  return m ? m[1] : null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Checks one data file against its manifest entry and parses it. Throws a
// Refusal naming the file on any mismatch; the caller has written nothing yet.
export async function verifyFile(
  path: string,
  bytes: ArrayBuffer,
  entry: ManifestEntry,
): Promise<SyncRecord[]> {
  const sha = await sha256Hex(bytes);
  if (sha !== entry.sha256) {
    throw new Refusal(`sha256 mismatch on ${path}: manifest ${entry.sha256}, file ${sha}`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length > 0 && !text.endsWith("\n")) throw new Refusal(`${path} has no trailing newline`);
  const lines = text.length === 0 ? [] : text.slice(0, -1).split("\n");
  if (lines.length !== entry.rows) {
    throw new Refusal(`row count mismatch on ${path}: manifest ${entry.rows}, file ${lines.length}`);
  }
  return lines.map((line, i) => {
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new Refusal(`${path} line ${i + 1} is not valid JSON`);
    }
    if (typeof rec !== "object" || rec === null || Array.isArray(rec)) {
      throw new Refusal(`${path} line ${i + 1} is not an object`);
    }
    if (typeof (rec as { key?: unknown }).key !== "string") {
      throw new Refusal(`${path} line ${i + 1} has no key`);
    }
    return rec as SyncRecord;
  });
}

// Field-for-field equality between a stored document and an incoming record,
// ignoring Convex's system fields. Used to skip writes that change nothing, so
// a re-sync of an unchanged repo costs reads only.
export function sameRecord(stored: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  const strip = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== "_id" && k !== "_creationTime"));
  return canonical(strip(stored)) === canonical(incoming);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
