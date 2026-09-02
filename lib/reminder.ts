import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { appSecret } from "./tokens.ts";
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
/* The signed discount                                                        */
/* -------------------------------------------------------------------------- */

/**
 * ?promo=<pct>.<signature>. The signature commits to the percentage, so a
 * link cannot be edited from 10 to 90; the settings row decides whether the
 * whole program is on and which percentage is currently honoured, so old
 * links die the moment the toggle flips off or the number changes.
 */
export function promoToken(pct: number): string {
  const signature = createHmac("sha256", appSecret())
    .update(`reminder-promo:${pct}`)
    .digest("base64url")
    .slice(0, 24);
  return `${pct}.${signature}`;
}

export function readPromoToken(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{1,2})\.([A-Za-z0-9_-]{24})$/);
  if (!match) return null;
  const pct = Number(match[1]);
  if (pct < 1 || pct > 90) return null;
  const expected = promoToken(pct);
  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return pct;
}

/** Whole cents, always rounding in the buyer's favour. */
export function discountedUnitCents(priceCents: number, pct: number): number {
  return Math.max(0, Math.floor((priceCents * (100 - pct)) / 100));
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
