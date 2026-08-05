import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  metricPk,
  parseMetricPk,
  type MetricKind,
  type VisitLogEntry,
} from "./analytics.ts";

/**
 * Storage for the page-view counters.
 *
 * Counters live in the rate-limit table under an "m#" prefix rather than a
 * table of their own: the table already exists, its rows are cheap, and the
 * events and submissions tables both have scans that would treat foreign rows
 * as data. Writes are atomic UpdateItem ADDs, because the read-modify-write
 * the rate limiter uses would drop counts under concurrent traffic, and an
 * analytics number that quietly undercounts is worse than none.
 *
 * Counters expire after ~13 months via the table's TTL, so the table cleans
 * itself and a year-over-year comparison stays possible until then.
 */

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

const LOCAL_FILE = path.join(process.cwd(), ".data", "metrics.json");

async function localRead(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function localWrite(data: Record<string, number>): Promise<void> {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

export type MetricRow = {
  kind: MetricKind;
  day: string;
  key: string;
  count: number;
};

const TTL_SECONDS = 400 * 24 * 60 * 60;

/**
 * Ticks a set of counters by one. Best effort by design: a lost page view is
 * a rounding error, and analytics must never make a page slower or a request
 * fail.
 */
export async function recordView(
  entries: Array<{ kind: MetricKind; key: string }>,
  day: string,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    for (const { kind, key } of entries) {
      const pk = metricPk(kind, day, key);
      data[pk] = (data[pk] ?? 0) + 1;
    }
    await localWrite(data);
    return;
  }

  const expiresAt = String(Math.ceil(Date.now() / 1000) + TTL_SECONDS);
  await Promise.all(
    entries.map(({ kind, key }) =>
      db()
        .send(
          new UpdateItemCommand({
            TableName: table,
            Key: { pk: { S: metricPk(kind, day, key) } },
            // ADD is atomic and upserts, so concurrent views cannot lose
            // counts the way read-modify-write does.
            UpdateExpression: "ADD n :one SET expiresAt = if_not_exists(expiresAt, :ttl)",
            ExpressionAttributeValues: {
              ":one": { N: "1" },
              ":ttl": { N: expiresAt },
            },
          }),
        )
        .catch((error) => {
          console.error("[1127] metric write failed", kind, error);
        }),
    ),
  );
}

/** Every counter in a day range, for the dashboard. */
export async function readMetrics(days: readonly string[]): Promise<MetricRow[]> {
  const wanted = new Set(days);
  const rows: MetricRow[] = [];
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    for (const [pk, count] of Object.entries(data)) {
      const parsed = parseMetricPk(pk);
      if (parsed && wanted.has(parsed.day)) rows.push({ ...parsed, count });
    }
    return rows;
  }

  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :m)",
        ExpressionAttributeValues: { ":m": { S: "m#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      const parsed = parseMetricPk(item.pk?.S ?? "");
      const count = Number(item.n?.N ?? 0);
      if (parsed && wanted.has(parsed.day) && count > 0) {
        rows.push({ ...parsed, count });
      }
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows;
}

/* -------------------------------------------------------------------------- */
/* The visit log                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Individual visits, kept 30 days then reclaimed by the table's TTL.
 *
 * Each row is what a web server's access log has always contained, minus the
 * part that made access logs sensitive: there is no IP, no identifier, no
 * visitor hash on these rows. A row says "someone on an iPhone in the US came
 * from instagram to /rsvp at 2:14pm" and can never say who, or whether two
 * rows are the same person.
 */
const VLOG_TTL_SECONDS = 30 * 24 * 60 * 60;
const VLOG_FILE = path.join(process.cwd(), ".data", "visits.json");

export async function appendVisit(entry: VisitLogEntry): Promise<void> {
  const table = TABLE();

  if (!table) {
    let rows: VisitLogEntry[] = [];
    try {
      rows = JSON.parse(await readFile(VLOG_FILE, "utf8"));
    } catch {
      /* first visit */
    }
    rows.push(entry);
    await mkdir(path.dirname(VLOG_FILE), { recursive: true });
    await writeFile(VLOG_FILE, JSON.stringify(rows.slice(-500), null, 2), "utf8");
    return;
  }

  await db()
    .send(
      new PutItemCommand({
        TableName: table,
        Item: {
          pk: { S: `vlog#${entry.ts}#${randomUUID().slice(0, 8)}` },
          ts: { S: entry.ts },
          p: { S: entry.path },
          ...(entry.ref ? { r: { S: entry.ref } } : {}),
          ...(entry.utm ? { u: { S: entry.utm } } : {}),
          ...(entry.geo ? { g: { S: entry.geo } } : {}),
          d: { S: entry.device },
          b: { S: entry.browser },
          expiresAt: {
            N: String(Math.ceil(Date.now() / 1000) + VLOG_TTL_SECONDS),
          },
        },
      }),
    )
    .catch((error) => console.error("[1127] visit log write failed", error));
}

/** The newest `limit` visits, newest first. */
export async function readVisitLog(limit: number): Promise<VisitLogEntry[]> {
  const table = TABLE();

  if (!table) {
    try {
      const rows: VisitLogEntry[] = JSON.parse(await readFile(VLOG_FILE, "utf8"));
      return rows.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  const rows: VisitLogEntry[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :v)",
        ExpressionAttributeValues: { ":v": { S: "vlog#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      rows.push({
        ts: item.ts?.S ?? "",
        path: item.p?.S ?? "",
        ref: item.r?.S ?? null,
        utm: item.u?.S ?? null,
        geo: item.g?.S ?? null,
        device: item.d?.S ?? "Other",
        browser: item.b?.S ?? "Other",
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
}
