import {
  DynamoDBClient,
  GetItemCommand,
  DeleteItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TicketOrder, TicketRecord } from "./tickets.ts";

/**
 * Ticket inventory, orders and issued tickets.
 *
 * Everything lives in the rate-limit table under its own prefixes ("inv#",
 * "ord#", "tkt#"), the same reasoning as the metrics: the table already
 * exists, and the events and submissions tables have scans that treat foreign
 * rows as data. None of these rows carries expiresAt; orders and tickets are
 * business records and must outlive any TTL.
 *
 * The one rule that matters is in reserveTickets: overselling is prevented by
 * a single conditional counter, not by reading and checking. Two people
 * buying the last ticket at the same moment must produce exactly one sale.
 */

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

/* ------------------------------------------------------------------------- */
/* Local fallback, so dev and tests run without AWS                          */
/* ------------------------------------------------------------------------- */

const LOCAL_FILE = path.join(process.cwd(), ".data", "ticketing.json");

type LocalData = {
  inventory: Record<string, { taken: number; sold: number }>;
  orders: Record<string, TicketOrder>;
  tickets: Record<string, TicketRecord>;
};

async function localRead(): Promise<LocalData> {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8"));
  } catch {
    return { inventory: {}, orders: {}, tickets: {} };
  }
}

async function localWrite(data: LocalData): Promise<void> {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

/* ------------------------------------------------------------------------- */
/* Inventory                                                                 */
/* ------------------------------------------------------------------------- */

const invPk = (eventId: string, tierId: string) => `inv#${eventId}#${tierId}`;

/**
 * Takes `quantity` tickets out of a tier's pool, or refuses.
 *
 * `taken` counts holds and sales together; capacity lives on the event record
 * and is passed in fresh. The condition runs against the value BEFORE the
 * update, so `taken <= capacity - quantity` guarantees the counter never
 * lands above capacity, atomically, no matter how many requests race. This
 * single expression is the entire oversell defence; nothing else checks.
 */
export async function reserveTickets(
  eventId: string,
  tierId: string,
  quantity: number,
  capacity: number,
): Promise<boolean> {
  const table = TABLE();
  const max = capacity - quantity;
  if (max < 0) return false;

  if (!table) {
    const data = await localRead();
    const pk = invPk(eventId, tierId);
    const row = data.inventory[pk] ?? { taken: 0, sold: 0 };
    if (row.taken > max) return false;
    row.taken += quantity;
    data.inventory[pk] = row;
    await localWrite(data);
    return true;
  }

  try {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: invPk(eventId, tierId) } },
        UpdateExpression: "ADD taken :q",
        ConditionExpression: "attribute_not_exists(taken) OR taken <= :max",
        ExpressionAttributeValues: {
          ":q": { N: String(quantity) },
          ":max": { N: String(max) },
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}

/**
 * Returns a hold to the pool after a checkout expires. Guarded so a replayed
 * webhook cannot drive the counter negative and mint free capacity.
 */
export async function releaseTickets(
  eventId: string,
  tierId: string,
  quantity: number,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const pk = invPk(eventId, tierId);
    const row = data.inventory[pk];
    if (!row || row.taken < quantity) return;
    row.taken -= quantity;
    await localWrite(data);
    return;
  }

  await db()
    .send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: invPk(eventId, tierId) } },
        UpdateExpression: "ADD taken :neg",
        ConditionExpression: "taken >= :q",
        ExpressionAttributeValues: {
          ":neg": { N: String(-quantity) },
          ":q": { N: String(quantity) },
        },
      }),
    )
    .catch((error) => console.error("[1127] ticket release failed", error));
}

/** Converts a hold into a sale for the books. `taken` already covers it. */
export async function markSold(
  eventId: string,
  tierId: string,
  quantity: number,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const pk = invPk(eventId, tierId);
    const row = data.inventory[pk] ?? { taken: 0, sold: 0 };
    row.sold += quantity;
    data.inventory[pk] = row;
    await localWrite(data);
    return;
  }

  await db()
    .send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: invPk(eventId, tierId) } },
        UpdateExpression: "ADD sold :q",
        ExpressionAttributeValues: { ":q": { N: String(quantity) } },
      }),
    )
    .catch((error) => console.error("[1127] mark-sold failed", error));
}

export type TierInventory = { taken: number; sold: number };

export async function readInventory(
  eventId: string,
  tierIds: readonly string[],
): Promise<Map<string, TierInventory>> {
  const table = TABLE();
  const out = new Map<string, TierInventory>();

  if (!table) {
    const data = await localRead();
    for (const tierId of tierIds) {
      const row = data.inventory[invPk(eventId, tierId)];
      out.set(tierId, { taken: row?.taken ?? 0, sold: row?.sold ?? 0 });
    }
    return out;
  }

  await Promise.all(
    tierIds.map(async (tierId) => {
      const item = await db().send(
        new GetItemCommand({
          TableName: table,
          Key: { pk: { S: invPk(eventId, tierId) } },
        }),
      );
      out.set(tierId, {
        taken: Number(item.Item?.taken?.N ?? 0),
        sold: Number(item.Item?.sold?.N ?? 0),
      });
    }),
  );
  return out;
}

/**
 * Follows an event id rename: counters move to the new key so the oversell
 * guard keeps counting from where it was, and the old rows are removed.
 * Called by renameEvent, which owns the ordering guarantees.
 */
export async function renameInventory(
  oldEventId: string,
  newEventId: string,
  tierIds: readonly string[],
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    for (const tierId of tierIds) {
      const from = invPk(oldEventId, tierId);
      const row = data.inventory[from];
      if (!row) continue;
      data.inventory[invPk(newEventId, tierId)] = row;
      delete data.inventory[from];
    }
    await localWrite(data);
    return;
  }

  for (const tierId of tierIds) {
    const item = await db().send(
      new GetItemCommand({
        TableName: table,
        Key: { pk: { S: invPk(oldEventId, tierId) } },
      }),
    );
    if (!item.Item) continue;
    await db().send(
      new PutItemCommand({
        TableName: table,
        Item: { ...item.Item, pk: { S: invPk(newEventId, tierId) } },
      }),
    );
    await db().send(
      new DeleteItemCommand({
        TableName: table,
        Key: { pk: { S: invPk(oldEventId, tierId) } },
      }),
    );
  }
}

/* ------------------------------------------------------------------------- */
/* Orders                                                                    */
/* ------------------------------------------------------------------------- */

const ordPk = (sessionId: string) => `ord#${sessionId}`;

function orderToItem(order: TicketOrder) {
  return {
    pk: { S: ordPk(order.sessionId) },
    sessionId: { S: order.sessionId },
    status: { S: order.status },
    eventId: { S: order.eventId },
    tierId: { S: order.tierId },
    eventName: { S: order.eventName },
    tierName: { S: order.tierName },
    quantity: { N: String(order.quantity) },
    amountCents: { N: String(order.amountCents) },
    ...(order.email ? { email: { S: order.email } } : {}),
    ...(order.codes?.length ? { codes: { SS: order.codes } } : {}),
    createdAt: { S: order.createdAt },
    updatedAt: { S: order.updatedAt },
  };
}

function itemToOrder(item: Record<string, { S?: string; N?: string; SS?: string[] }>): TicketOrder {
  return {
    sessionId: item.sessionId?.S ?? "",
    status: (item.status?.S ?? "pending") as TicketOrder["status"],
    eventId: item.eventId?.S ?? "",
    tierId: item.tierId?.S ?? "",
    eventName: item.eventName?.S ?? "",
    tierName: item.tierName?.S ?? "",
    quantity: Number(item.quantity?.N ?? 0),
    amountCents: Number(item.amountCents?.N ?? 0),
    email: item.email?.S ?? null,
    codes: item.codes?.SS ?? undefined,
    createdAt: item.createdAt?.S ?? "",
    updatedAt: item.updatedAt?.S ?? "",
  };
}

export async function createOrder(order: TicketOrder): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    data.orders[order.sessionId] = order;
    await localWrite(data);
    return;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: orderToItem(order),
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function getOrder(sessionId: string): Promise<TicketOrder | null> {
  const table = TABLE();

  if (!table) {
    return (await localRead()).orders[sessionId] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: ordPk(sessionId) } } }),
  );
  return out.Item ? itemToOrder(out.Item as never) : null;
}

/**
 * Claims a pending order and settles it in one conditional write: the status
 * check IS the idempotency gate for webhook redelivery. Returns false when
 * somebody else (an earlier delivery) already settled or expired it.
 */
export async function settleOrder(
  sessionId: string,
  status: "paid" | "expired",
  patch: { email?: string | null; codes?: string[] } = {},
): Promise<boolean> {
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localRead();
    const order = data.orders[sessionId];
    if (!order || order.status !== "pending") return false;
    order.status = status;
    if (patch.email) order.email = patch.email;
    if (patch.codes) order.codes = patch.codes;
    order.updatedAt = now;
    await localWrite(data);
    return true;
  }

  try {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: ordPk(sessionId) } },
        UpdateExpression: `SET #s = :next, updatedAt = :now${
          patch.email ? ", email = :email" : ""
        }${patch.codes?.length ? ", codes = :codes" : ""}`,
        ConditionExpression: "#s = :pending",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":next": { S: status },
          ":pending": { S: "pending" },
          ":now": { S: now },
          ...(patch.email ? { ":email": { S: patch.email } } : {}),
          ...(patch.codes?.length ? { ":codes": { SS: patch.codes } } : {}),
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}

/** Every order for a set of event ids (current id plus formerIds), newest first. */
export async function listOrders(
  eventIds: readonly string[],
): Promise<TicketOrder[]> {
  const wanted = new Set(eventIds);
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    return Object.values(data.orders)
      .filter((order) => wanted.has(order.eventId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows: TicketOrder[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :o)",
        ExpressionAttributeValues: { ":o": { S: "ord#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      const order = itemToOrder(item as never);
      if (wanted.has(order.eventId)) rows.push(order);
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ------------------------------------------------------------------------- */
/* Issued tickets                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Writes one ticket, refusing a code that already exists. The caller retries
 * with a fresh code; at ~10^13 possible codes the loop runs once.
 */
export async function createTicket(ticket: TicketRecord): Promise<boolean> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (data.tickets[ticket.code]) return false;
    data.tickets[ticket.code] = ticket;
    await localWrite(data);
    return true;
  }

  try {
    await db().send(
      new PutItemCommand({
        TableName: table,
        Item: {
          pk: { S: `tkt#${ticket.code}` },
          code: { S: ticket.code },
          orderId: { S: ticket.orderId },
          eventId: { S: ticket.eventId },
          tierId: { S: ticket.tierId },
          ...(ticket.email ? { email: { S: ticket.email } } : {}),
          status: { S: ticket.status },
          createdAt: { S: ticket.createdAt },
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}
