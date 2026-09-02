import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TicketOrder } from "./tickets.ts";
import type { SubmissionRecord } from "./types.ts";

/**
 * Abandoned-checkout reminders: who gets one, and the optional signed
 * discount that rides along.
 *
 * Eligibility is strict on purpose. One reminder per email, ever, and an
 * email with ANY paid order gets nothing: they came back on their own, and
 * "hey, finish buying" to somebody holding tickets reads as a system that
 * does not know its own customers.
 */

export type ReminderTarget = {
  email: string;
  /** Their latest abandoned order: the event and attribution to carry. */
  order: TicketOrder;
};

export function computeReminderTargets(
  orders: readonly TicketOrder[],
  submissions: readonly SubmissionRecord[],
): ReminderTarget[] {
  const paidEmails = new Set(
    orders
      .filter((order) => order.status === "paid" && order.email)
      .map((order) => (order.email as string).toLowerCase()),
  );

  // An address that unsubscribed or bounced is out, whatever it abandoned.
  const suppressed = new Set(
    submissions
      .filter(
        (row) => row.status === "unsubscribed" || row.status === "bounced",
      )
      .map((row) => row.email.toLowerCase()),
  );

  const byEmail = new Map<string, TicketOrder>();
  for (const order of orders) {
    if (order.status !== "expired" || !order.email) continue;
    const email = order.email.toLowerCase();
    if (paidEmails.has(email) || suppressed.has(email)) continue;
    // Already reminded once, on any of their orders: never again.
    const priorReminder = orders.some(
      (row) =>
        row.email?.toLowerCase() === email &&
        (row as { remindedAt?: string }).remindedAt,
    );
    if (priorReminder) continue;
    const held = byEmail.get(email);
    if (!held || order.createdAt > held.createdAt) byEmail.set(email, order);
  }

  return [...byEmail.entries()]
    .map(([email, order]) => ({ email, order }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/* -------------------------------------------------------------------------- */
/* One-time discount codes                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every reminder link carries its own unguessable code, stored as a row and
 * burned the moment its order is PAID: one code, one purchase, ever. The
 * settings row stays the kill switch; the whole program off, or a changed
 * percentage, invalidates unburned codes too.
 */
export type PromoCode = {
  id: string;
  email: string;
  pct: number;
  createdAt: string;
  usedAt?: string;
};

const PROMO_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function newPromoId(): string {
  const bytes = randomBytes(16);
  let id = "";
  for (let i = 0; i < 16; i += 1) {
    id += PROMO_ALPHABET[bytes[i] % PROMO_ALPHABET.length];
  }
  return id;
}

export function isValidPromoId(id: string): boolean {
  return /^[23456789abcdefghjkmnpqrstuvwxyz]{16}$/.test(id);
}

/** Whole cents, always rounding in the buyer's favour. */
export function discountedUnitCents(priceCents: number, pct: number): number {
  return Math.max(0, Math.floor((priceCents * (100 - pct)) / 100));
}

const promoPk = (id: string) => `promo#${id}`;
const LOCAL_CODES_FILE = path.join(process.cwd(), ".data", "reminder-codes.json");

async function localCodesRead(): Promise<Record<string, PromoCode>> {
  try {
    return JSON.parse(await readFile(LOCAL_CODES_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function localCodesWrite(data: Record<string, PromoCode>): Promise<void> {
  await mkdir(path.dirname(LOCAL_CODES_FILE), { recursive: true });
  await writeFile(LOCAL_CODES_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function createPromoCode(
  email: string,
  pct: number,
): Promise<PromoCode> {
  const code: PromoCode = {
    id: newPromoId(),
    email: email.toLowerCase(),
    pct,
    createdAt: new Date().toISOString(),
  };
  const table = TABLE();

  if (!table) {
    const data = await localCodesRead();
    data[code.id] = code;
    await localCodesWrite(data);
    return code;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: {
        pk: { S: promoPk(code.id) },
        id: { S: code.id },
        email: { S: code.email },
        pct: { N: String(code.pct) },
        createdAt: { S: code.createdAt },
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return code;
}

export async function getPromoCode(id: string): Promise<PromoCode | null> {
  if (!isValidPromoId(id)) return null;
  const table = TABLE();

  if (!table) {
    return (await localCodesRead())[id] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: promoPk(id) } } }),
  );
  if (!out.Item) return null;
  return {
    id: out.Item.id?.S ?? id,
    email: out.Item.email?.S ?? "",
    pct: Number(out.Item.pct?.N ?? 0),
    createdAt: out.Item.createdAt?.S ?? "",
    usedAt: out.Item.usedAt?.S ?? undefined,
  };
}

/**
 * Burns the code, exactly once: a conditional write that fails when it was
 * already burned, so two racing paid webhooks cannot both claim it.
 */
export async function markPromoUsed(id: string): Promise<boolean> {
  if (!isValidPromoId(id)) return false;
  const table = TABLE();
  const now = new Date().toISOString();

  if (!table) {
    const data = await localCodesRead();
    const code = data[id];
    if (!code || code.usedAt) return false;
    code.usedAt = now;
    await localCodesWrite(data);
    return true;
  }

  try {
    const { UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: promoPk(id) } },
        UpdateExpression: "SET usedAt = :now",
        ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(usedAt)",
        ExpressionAttributeValues: { ":now": { S: now } },
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
 * The percentage a promo id is worth right now, or null. Valid only while
 * unburned, the program is on, and the code's percentage is still the one
 * the dashboard says; each rejection is a different way for a link to die.
 */
export async function validatePromo(
  id: string | null | undefined,
): Promise<number | null> {
  if (typeof id !== "string" || !isValidPromoId(id)) return null;
  const [code, settings] = await Promise.all([
    getPromoCode(id),
    getReminderSettings(),
  ]);
  if (!code || code.usedAt) return null;
  if (!settings.enabled || settings.pct !== code.pct) return null;
  return code.pct;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export type ReminderSettings = { enabled: boolean; pct: number };

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

const CFG_PK = "cfg#reminder-promo";
const LOCAL_FILE = path.join(process.cwd(), ".data", "reminder.json");

export async function getReminderSettings(): Promise<ReminderSettings> {
  const table = TABLE();

  if (!table) {
    try {
      const raw = JSON.parse(await readFile(LOCAL_FILE, "utf8"));
      return {
        enabled: raw.enabled === true,
        pct: Number.isInteger(raw.pct) ? raw.pct : 10,
      };
    } catch {
      return { enabled: false, pct: 10 };
    }
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: CFG_PK } } }),
  );
  return {
    enabled: out.Item?.enabled?.BOOL === true,
    pct: out.Item?.pct?.N ? Number(out.Item.pct.N) : 10,
  };
}

export async function setReminderSettings(
  settings: ReminderSettings,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await writeFile(LOCAL_FILE, JSON.stringify(settings), "utf8");
    return;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: {
        pk: { S: CFG_PK },
        enabled: { BOOL: settings.enabled },
        pct: { N: String(settings.pct) },
      },
    }),
  );
}
