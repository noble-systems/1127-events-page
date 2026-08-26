import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TicketOrder } from "./tickets.ts";

/**
 * Tracking links: one obscure short URL per place a link gets posted (an
 * Instagram story, the bio, a group chat), so sales can be traced back to
 * the post that drove them. "trk#<id>" rows in the utility table, beside
 * the ambassador rows they are modelled on.
 *
 * The id is deliberately meaningless: the label ("IG story, Aug 30") is for
 * the dashboard only and never appears in the URL, so nobody can read the
 * marketing plan out of a link.
 */

export type TrackLink = {
  id: string;
  /** Where the link was posted, in the admin's words. Dashboard only. */
  label: string;
  /** Times the link was opened. */
  taps: number;
  createdAt: string;
};

export type TrackLinkStats = TrackLink & {
  orders: number;
  tickets: number;
  grossCents: number;
};

/**
 * 10 characters from a 31-letter alphabet (no 0/O/1/I lookalikes), ~49 bits:
 * unguessable in practice, short enough for a story sticker.
 */
export function newTrackId(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = randomBytes(10);
  let id = "";
  for (let i = 0; i < 10; i += 1) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

export function isValidTrackId(id: string): boolean {
  return /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/.test(id);
}

/** The per-link sales sheet, computed from the order paper trail. */
export function trackLinkStats(
  links: readonly TrackLink[],
  orders: readonly TicketOrder[],
): TrackLinkStats[] {
  return links.map((link) => {
    const paid = orders.filter(
      (order) =>
        order.status === "paid" &&
        order.src === link.id &&
        order.comp !== true,
    );
    return {
      ...link,
      orders: paid.length,
      tickets: paid.reduce((sum, order) => sum + order.quantity, 0),
      grossCents: paid.reduce((sum, order) => sum + order.amountCents, 0),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

const LOCAL_FILE = path.join(process.cwd(), ".data", "track-links.json");

async function localRead(): Promise<Record<string, TrackLink>> {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function localWrite(data: Record<string, TrackLink>): Promise<void> {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

const pk = (id: string) => `trk#${id}`;

export async function createTrackLink(label: string): Promise<TrackLink> {
  const link: TrackLink = {
    id: newTrackId(),
    label,
    taps: 0,
    createdAt: new Date().toISOString(),
  };
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    data[link.id] = link;
    await localWrite(data);
    return link;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: {
        pk: { S: pk(link.id) },
        id: { S: link.id },
        label: { S: link.label },
        taps: { N: "0" },
        createdAt: { S: link.createdAt },
      },
      // A random-id collision is astronomically unlikely; refusing to
      // overwrite turns "astronomically" into "never loses data".
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return link;
}

export async function getTrackLink(id: string): Promise<TrackLink | null> {
  if (!isValidTrackId(id)) return null;
  const table = TABLE();

  if (!table) {
    return (await localRead())[id] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: pk(id) } } }),
  );
  if (!out.Item) return null;
  return {
    id: out.Item.id?.S ?? id,
    label: out.Item.label?.S ?? "",
    taps: out.Item.taps?.N ? Number(out.Item.taps.N) : 0,
    createdAt: out.Item.createdAt?.S ?? "",
  };
}

export async function listTrackLinks(): Promise<TrackLink[]> {
  const table = TABLE();

  if (!table) {
    return Object.values(await localRead()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  const rows: TrackLink[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :t)",
        ExpressionAttributeValues: { ":t": { S: "trk#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      rows.push({
        id: item.id?.S ?? "",
        label: item.label?.S ?? "",
        taps: item.taps?.N ? Number(item.taps.N) : 0,
        createdAt: item.createdAt?.S ?? "",
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Best effort; a lost tick must never slow the redirect down. */
export async function bumpTrackTap(id: string): Promise<void> {
  try {
    const table = TABLE();

    if (!table) {
      const data = await localRead();
      if (!data[id]) return;
      data[id].taps = (data[id].taps ?? 0) + 1;
      await localWrite(data);
      return;
    }

    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: pk(id) } },
        UpdateExpression: "ADD #t :one",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#t": "taps" },
        ExpressionAttributeValues: { ":one": { N: "1" } },
      }),
    );
  } catch (error) {
    console.error("[1127] track-link tap failed", id, error);
  }
}

export async function renameTrackLink(
  id: string,
  label: string,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (!data[id]) return;
    data[id].label = label;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: pk(id) } },
      UpdateExpression: "SET #l = :l",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#l": "label" },
      ExpressionAttributeValues: { ":l": { S: label } },
    }),
  );
}

/**
 * Removes the link and its tap count. Orders keep their src id, so deleting
 * a link erases the row on the board, never the sales history under it.
 */
export async function deleteTrackLink(id: string): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    delete data[id];
    await localWrite(data);
    return;
  }

  await db().send(
    new DeleteItemCommand({ TableName: table, Key: { pk: { S: pk(id) } } }),
  );
}
