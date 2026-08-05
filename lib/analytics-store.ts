import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { metricPk, parseMetricPk, type MetricKind } from "./analytics.ts";

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
