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

const ordPk = (ref: string) => `ord#${ref}`;
/** Alias from Square's order id to our ref, for webhook lookups. */
const sqoPk = (squareOrderId: string) => `sqo#${squareOrderId}`;

function orderToItem(order: TicketOrder) {
  return {
    pk: { S: ordPk(order.ref) },
    ref: { S: order.ref },
    status: { S: order.status },
    eventId: { S: order.eventId },
    tierId: { S: order.tierId },
    eventName: { S: order.eventName },
    tierName: { S: order.tierName },
    quantity: { N: String(order.quantity) },
    amountCents: { N: String(order.amountCents) },
    ...(order.squareOrderId ? { squareOrderId: { S: order.squareOrderId } } : {}),
    ...(order.linkId ? { linkId: { S: order.linkId } } : {}),
    ...(order.via ? { via: { S: order.via } } : {}),
    ...(order.src ? { src: { S: order.src } } : {}),
    ...(order.email ? { email: { S: order.email } } : {}),
    ...(order.phone ? { phone: { S: order.phone } } : {}),
    ...(order.optIn ? { optIn: { BOOL: true } } : {}),
    ...(order.termsVersion ? { termsVersion: { S: order.termsVersion } } : {}),
    ...(order.ageConfirmed ? { ageConfirmed: { BOOL: true } } : {}),
    ...(order.promoPct ? { promoPct: { N: String(order.promoPct) } } : {}),
    ...(order.promoId ? { promoId: { S: order.promoId } } : {}),
    ...(order.remindedAt ? { remindedAt: { S: order.remindedAt } } : {}),
    ...(order.reminderRemovedAt
      ? { reminderRemovedAt: { S: order.reminderRemovedAt } }
      : {}),
    ...(order.comp ? { comp: { BOOL: true } } : {}),
    ...(order.codes?.length ? { codes: { SS: order.codes } } : {}),
    createdAt: { S: order.createdAt },
    updatedAt: { S: order.updatedAt },
  };
}

function itemToOrder(
  item: Record<string, { S?: string; N?: string; SS?: string[]; BOOL?: boolean }>,
): TicketOrder {
  return {
    ref: item.ref?.S ?? "",
    status: (item.status?.S ?? "pending") as TicketOrder["status"],
    eventId: item.eventId?.S ?? "",
    tierId: item.tierId?.S ?? "",
    eventName: item.eventName?.S ?? "",
    tierName: item.tierName?.S ?? "",
    quantity: Number(item.quantity?.N ?? 0),
    amountCents: Number(item.amountCents?.N ?? 0),
    squareOrderId: item.squareOrderId?.S ?? undefined,
    linkId: item.linkId?.S ?? undefined,
    via: item.via?.S ?? undefined,
    src: item.src?.S ?? undefined,
    email: item.email?.S ?? null,
    phone: item.phone?.S ?? null,
    optIn: item.optIn?.BOOL === true,
    ageConfirmed: item.ageConfirmed?.BOOL === true || undefined,
    promoPct: item.promoPct?.N ? Number(item.promoPct.N) : undefined,
    promoId: item.promoId?.S ?? undefined,
    remindedAt: item.remindedAt?.S ?? undefined,
    reminderRemovedAt: item.reminderRemovedAt?.S ?? undefined,
    termsVersion: item.termsVersion?.S ?? undefined,
    comp: item.comp?.BOOL === true || undefined,
    codes: item.codes?.SS ?? undefined,
    createdAt: item.createdAt?.S ?? "",
    updatedAt: item.updatedAt?.S ?? "",
  };
}

export async function createOrder(order: TicketOrder): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    data.orders[order.ref] = order;
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
  // The alias is written second: if this write is lost, the webhook falls
  // back to asking Square for the order's reference_id.
  if (order.squareOrderId) {
    await db()
      .send(
        new PutItemCommand({
          TableName: table,
          Item: {
            pk: { S: sqoPk(order.squareOrderId) },
            ref: { S: order.ref },
          },
        }),
      )
      .catch((error) => console.error("[1127] order alias write failed", error));
  }
}

export async function getOrder(ref: string): Promise<TicketOrder | null> {
  const table = TABLE();

  if (!table) {
    return (await localRead()).orders[ref] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: ordPk(ref) } } }),
  );
  return out.Item ? itemToOrder(out.Item as never) : null;
}

/** Our ref for a Square order id, from the alias row. */
export async function getRefBySquareOrder(
  squareOrderId: string,
): Promise<string | null> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    return (
      Object.values(data.orders).find((o) => o.squareOrderId === squareOrderId)
        ?.ref ?? null
    );
  }

  const out = await db().send(
    new GetItemCommand({
      TableName: table,
      Key: { pk: { S: sqoPk(squareOrderId) } },
    }),
  );
  return out.Item?.ref?.S ?? null;
}

/**
 * Moves an order from one status to another in one conditional write: the
 * from-status check IS the idempotency gate for webhook redelivery. Returns
 * false when the order is not in `from` (an earlier delivery won). The
 * default from is "pending"; the webhook's late-payment recovery is the one
 * caller that settles from "expired".
 */
export async function settleOrder(
  ref: string,
  status: "paid" | "expired" | "attention",
  patch: { email?: string | null; codes?: string[] } = {},
  from: TicketOrder["status"] = "pending",
): Promise<boolean> {
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localRead();
    const order = data.orders[ref];
    if (!order || order.status !== from) return false;
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
        Key: { pk: { S: ordPk(ref) } },
        UpdateExpression: `SET #s = :next, updatedAt = :now${
          patch.email ? ", email = :email" : ""
        }${patch.codes?.length ? ", codes = :codes" : ""}`,
        ConditionExpression: "#s = :from",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":next": { S: status },
          ":from": { S: from },
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

/** Every order across every event, for the ambassador payout sheet. */
export async function listAllOrders(): Promise<TicketOrder[]> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    return Object.values(data.orders).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
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
    for (const item of page.Items ?? []) rows.push(itemToOrder(item as never));
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Moves attribution from one ambassador code to another, for code renames. */
export async function reassignOrdersVia(
  oldCode: string,
  newCode: string,
): Promise<number> {
  const table = TABLE();
  let moved = 0;

  if (!table) {
    const data = await localRead();
    for (const order of Object.values(data.orders)) {
      if (order.via === oldCode) {
        order.via = newCode;
        moved += 1;
      }
    }
    await localWrite(data);
    return moved;
  }

  const rows = await listAllOrders();
  for (const order of rows) {
    if (order.via !== oldCode) continue;
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: `ord#${order.ref}` } },
        // #alias, the door-pass lesson: never bet on a word being unreserved.
        UpdateExpression: "SET #v = :v",
        ExpressionAttributeNames: { "#v": "via" },
        ExpressionAttributeValues: { ":v": { S: newCode } },
      }),
    );
    moved += 1;
  }
  return moved;
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
 * Every issued ticket for a set of event ids, one scan, for the admin board:
 * per-code check-in status without a lookup per code.
 */
export async function listTicketsForEvents(
  eventIds: readonly string[],
): Promise<TicketRecord[]> {
  const wanted = new Set(eventIds);
  const table = TABLE();

  if (!table) {
    return Object.values((await localRead()).tickets).filter((ticket) =>
      wanted.has(ticket.eventId),
    );
  }

  const rows: TicketRecord[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :t)",
        ExpressionAttributeValues: { ":t": { S: "tkt#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      const raw = item as Record<string, { S?: string }>;
      if (!wanted.has(raw.eventId?.S ?? "")) continue;
      rows.push({
        code: raw.code?.S ?? "",
        orderId: raw.orderId?.S ?? "",
        eventId: raw.eventId?.S ?? "",
        tierId: raw.tierId?.S ?? "",
        email: raw.email?.S ?? null,
        status: (raw.status?.S ?? "valid") as TicketRecord["status"],
        usedAt: raw.usedAt?.S ?? undefined,
        createdAt: raw.createdAt?.S ?? "",
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows;
}

export async function getTicket(code: string): Promise<TicketRecord | null> {
  const table = TABLE();

  if (!table) {
    return (await localRead()).tickets[code] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: `tkt#${code}` } } }),
  );
  if (!out.Item) return null;
  const item = out.Item as Record<string, { S?: string }>;
  return {
    code: item.code?.S ?? "",
    orderId: item.orderId?.S ?? "",
    eventId: item.eventId?.S ?? "",
    tierId: item.tierId?.S ?? "",
    email: item.email?.S ?? null,
    status: (item.status?.S ?? "valid") as TicketRecord["status"],
    usedAt: item.usedAt?.S ?? undefined,
    createdAt: item.createdAt?.S ?? "",
  };
}

/**
 * The door itself: flips one ticket valid -> used, exactly once, atomically.
 * The conditional write is the whole defence against a screenshot shared to
 * five friends; four of them see "already used" with the original stamp.
 */
export async function checkInTicket(
  code: string,
): Promise<{ ok: boolean; ticket: TicketRecord | null }> {
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localRead();
    const ticket = data.tickets[code];
    if (!ticket) return { ok: false, ticket: null };
    if (ticket.status !== "valid") return { ok: false, ticket };
    ticket.status = "used";
    ticket.usedAt = now;
    await localWrite(data);
    return { ok: true, ticket };
  }

  try {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: `tkt#${code}` } },
        UpdateExpression: "SET #s = :used, usedAt = :now",
        ConditionExpression: "#s = :valid",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":used": { S: "used" },
          ":valid": { S: "valid" },
          ":now": { S: now },
        },
      }),
    );
    return { ok: true, ticket: await getTicket(code) };
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return { ok: false, ticket: await getTicket(code) };
    }
    throw error;
  }
}

/**
 * Stamps the reminder time on one order, so its email can never be
 * reminded twice. #aliased like every update expression here.
 */
export async function markOrderReminded(ref: string): Promise<void> {
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localRead();
    const order = data.orders[ref];
    if (!order) return;
    (order as TicketOrder).remindedAt = now;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: `ord#${ref}` } },
      UpdateExpression: "SET #r = :now",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#r": "remindedAt" },
      ExpressionAttributeValues: { ":now": { S: now } },
    }),
  );
}

/**
 * The by-hand strike-off and its undo. A separate stamp from remindedAt on
 * purpose: a REAL send is permanent (one reminder per email, ever), while a
 * fat-fingered removal must be reversible.
 */
export async function setOrderReminderRemoved(
  ref: string,
  removed: boolean,
): Promise<void> {
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localRead();
    const order = data.orders[ref];
    if (!order) return;
    if (removed) (order as TicketOrder).reminderRemovedAt = now;
    else delete (order as TicketOrder).reminderRemovedAt;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: `ord#${ref}` } },
      UpdateExpression: removed ? "SET #r = :now" : "REMOVE #r",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#r": "reminderRemovedAt" },
      ...(removed
        ? { ExpressionAttributeValues: { ":now": { S: now } } }
        : {}),
    }),
  );
}

/**
 * Flips one ticket between valid and revoked, exactly like the door flips
 * valid to used: a conditional write from the expected state, so a replayed
 * click cannot double-anything and a used ticket cannot be voided into an
 * argument at the door. Returns false when the ticket was not in the state
 * the action expects.
 */
export async function setTicketRevoked(
  code: string,
  revoked: boolean,
): Promise<{ ok: boolean; ticket: TicketRecord | null }> {
  const table = TABLE();
  const from = revoked ? "valid" : "revoked";
  const to = revoked ? "revoked" : "valid";

  if (!table) {
    const data = await localRead();
    const ticket = data.tickets[code];
    if (!ticket) return { ok: false, ticket: null };
    if (ticket.status !== from) return { ok: false, ticket };
    ticket.status = to;
    await localWrite(data);
    return { ok: true, ticket };
  }

  try {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: `tkt#${code}` } },
        UpdateExpression: "SET #s = :to",
        ConditionExpression: "#s = :from",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":to": { S: to },
          ":from": { S: from },
        },
      }),
    );
    return { ok: true, ticket: await getTicket(code) };
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return { ok: false, ticket: await getTicket(code) };
    }
    throw error;
  }
}

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
