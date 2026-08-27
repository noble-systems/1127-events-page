import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Ambassador } from "./ambassadors.ts";

/**
 * Ambassador rows, "amb#<code>" in the utility table alongside the metrics
 * and ticket rows, for the same reason those live there: the table exists,
 * and the business tables have scans that would treat foreign rows as data.
 * No TTL; who brought whom is bookkeeping with a payout attached.
 */

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

const LOCAL_FILE = path.join(process.cwd(), ".data", "ambassadors.json");

async function localRead(): Promise<Record<string, Ambassador>> {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function localWrite(data: Record<string, Ambassador>): Promise<void> {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

const pk = (code: string) => `amb#${code}`;

/**
 * The obscure id of an ambassador's personal stats page: 12 characters, no
 * lookalikes, ~59 bits. Lives here rather than in the pure layer because the
 * pure layer is bundled into client components, where node:crypto is not.
 */
export function newStatsId(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = randomBytes(12);
  let id = "";
  for (let i = 0; i < 12; i += 1) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

/** The roster row a stats id belongs to; the /me page's only door. */
export async function getAmbassadorByStatsId(
  statsId: string,
): Promise<Ambassador | null> {
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/.test(statsId)) return null;
  const all = await listAmbassadors();
  return all.find((row) => row.statsId === statsId) ?? null;
}

/** False when the code is already taken; codes are identities, not rows. */
export async function createAmbassador(ambassador: Ambassador): Promise<boolean> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (data[ambassador.code]) return false;
    data[ambassador.code] = ambassador;
    await localWrite(data);
    return true;
  }

  try {
    await db().send(
      new PutItemCommand({
        TableName: table,
        Item: {
          pk: { S: pk(ambassador.code) },
          code: { S: ambassador.code },
          name: { S: ambassador.name },
          ...(ambassador.email ? { email: { S: ambassador.email } } : {}),
          active: { BOOL: ambassador.active },
          ...(ambassador.rewardsGiven
            ? { rewardsGiven: { N: String(ambassador.rewardsGiven) } }
            : {}),
          ...(ambassador.rewardedEvents?.length
            ? { rewardedEvents: { SS: ambassador.rewardedEvents } }
            : {}),
          ...(ambassador.statsId ? { statsId: { S: ambassador.statsId } } : {}),
          ...(ambassador.welcomeEmailAt
            ? { welcomeEmailAt: { S: ambassador.welcomeEmailAt } }
            : {}),
          ...(ambassador.welcomeTicketAt
            ? { welcomeTicketAt: { S: ambassador.welcomeTicketAt } }
            : {}),
          ...(ambassador.welcomeTicketCode
            ? { welcomeTicketCode: { S: ambassador.welcomeTicketCode } }
            : {}),
          ...(ambassador.welcomeTicketManual === true
            ? { welcomeTicketManual: { BOOL: true } }
            : {}),
          createdAt: { S: ambassador.createdAt },
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

export async function getAmbassador(code: string): Promise<Ambassador | null> {
  const table = TABLE();

  if (!table) {
    return (await localRead())[code] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: pk(code) } } }),
  );
  if (!out.Item) return null;
  return {
    code: out.Item.code?.S ?? "",
    name: out.Item.name?.S ?? "",
    email: out.Item.email?.S ?? undefined,
    active: out.Item.active?.BOOL ?? false,
    rewardsGiven: out.Item.rewardsGiven?.N
      ? Number(out.Item.rewardsGiven.N)
      : undefined,
    rewardedEvents: out.Item.rewardedEvents?.SS ?? undefined,
    statsId: out.Item.statsId?.S ?? undefined,
    welcomeEmailAt: out.Item.welcomeEmailAt?.S ?? undefined,
    welcomeTicketAt: out.Item.welcomeTicketAt?.S ?? undefined,
    welcomeTicketCode: out.Item.welcomeTicketCode?.S ?? undefined,
    welcomeTicketManual: out.Item.welcomeTicketManual?.BOOL === true || undefined,
    createdAt: out.Item.createdAt?.S ?? "",
  };
}

/** The active check every attribution path runs before storing a code. */
export async function activeAmbassadorCode(
  code: string | null | undefined,
): Promise<string | null> {
  if (!code) return null;
  const found = await getAmbassador(code);
  return found?.active ? found.code : null;
}

export async function setAmbassadorActive(
  code: string,
  active: boolean,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (!data[code]) return;
    data[code].active = active;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: pk(code) } },
      UpdateExpression: "SET active = :a",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":a": { BOOL: active } },
    }),
  );
}

/**
 * Updates the fields an admin can change; #aliases because DynamoDB reserves
 * plenty of ordinary words, the lesson the door passes taught.
 */
export async function patchAmbassador(
  code: string,
  patch: Partial<
    Pick<
      Ambassador,
      | "active"
      | "email"
      | "name"
      | "statsId"
      | "welcomeEmailAt"
      | "welcomeTicketAt"
      | "welcomeTicketCode"
      | "welcomeTicketManual"
    >
  >,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (!data[code]) return;
    Object.assign(data[code], patch);
    await localWrite(data);
    return;
  }

  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  if (patch.active !== undefined) {
    sets.push("#a = :a");
    names["#a"] = "active";
    values[":a"] = { BOOL: patch.active };
  }
  if (patch.email !== undefined) {
    sets.push("#e = :e");
    names["#e"] = "email";
    values[":e"] = { S: patch.email };
  }
  if (patch.name !== undefined) {
    sets.push("#n = :n");
    names["#n"] = "name";
    values[":n"] = { S: patch.name };
  }
  if (patch.statsId !== undefined) {
    sets.push("#si = :si");
    names["#si"] = "statsId";
    values[":si"] = { S: patch.statsId };
  }
  if (patch.welcomeEmailAt !== undefined) {
    sets.push("#we = :we");
    names["#we"] = "welcomeEmailAt";
    values[":we"] = { S: patch.welcomeEmailAt };
  }
  if (patch.welcomeTicketAt !== undefined) {
    sets.push("#wt = :wt");
    names["#wt"] = "welcomeTicketAt";
    values[":wt"] = { S: patch.welcomeTicketAt };
  }
  if (patch.welcomeTicketCode !== undefined) {
    sets.push("#wc = :wc");
    names["#wc"] = "welcomeTicketCode";
    values[":wc"] = { S: patch.welcomeTicketCode };
  }
  if (patch.welcomeTicketManual !== undefined) {
    sets.push("#wm = :wm");
    names["#wm"] = "welcomeTicketManual";
    values[":wm"] = { BOOL: patch.welcomeTicketManual };
  }
  if (sets.length === 0) return;

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: pk(code) } },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values as never,
    }),
  );
}

/**
 * Claims the one free ticket for one event, atomically: succeeds exactly once
 * per (ambassador, event), so two sales settling at once cannot both issue
 * it, and a later sale for the same event finds it already claimed.
 */
export async function claimEventReward(
  code: string,
  eventId: string,
): Promise<boolean> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const row = data[code];
    if (!row) return false;
    const events = row.rewardedEvents ?? [];
    if (events.includes(eventId)) return false;
    row.rewardedEvents = [...events, eventId];
    await localWrite(data);
    return true;
  }

  try {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: pk(code) } },
        UpdateExpression: "ADD #r :e",
        ConditionExpression:
          "attribute_exists(pk) AND (attribute_not_exists(#r) OR NOT contains(#r, :id))",
        ExpressionAttributeNames: { "#r": "rewardedEvents" },
        ExpressionAttributeValues: {
          ":e": { SS: [eventId] },
          ":id": { S: eventId },
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

/* ------------------------------------------------------------------------- */
/* Link taps                                                                  */
/* ------------------------------------------------------------------------- */

const clickPk = (code: string) => `ambc#${code}`;
const REWARD_CFG_PK = "cfg#ambassador-reward";
/** Local-driver stand-in row; filtered out of every listing. */
const LOCAL_CFG_KEY = "__reward_every__";

/** How many sales earn a free ticket, as set on the dashboard. */
/**
 * How many sales earn the free ticket. Zero means the reward is switched
 * OFF; the fallback only covers a site that has never set the value at all.
 */
export async function getRewardEvery(fallback: number): Promise<number> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const raw = (data as Record<string, unknown>)[LOCAL_CFG_KEY];
    return typeof raw === "number" && raw >= 0 ? raw : fallback;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: REWARD_CFG_PK } } }),
  );
  if (out.Item?.n?.N === undefined) return fallback;
  const n = Number(out.Item.n.N);
  return n >= 0 ? n : fallback;
}

export async function setRewardEvery(every: number): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    (data as Record<string, unknown>)[LOCAL_CFG_KEY] = every;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: REWARD_CFG_PK } },
      UpdateExpression: "SET #n = :n",
      ExpressionAttributeNames: { "#n": "n" },
      ExpressionAttributeValues: { ":n": { N: String(every) } },
    }),
  );
}

const LOCAL_TIER_KEY = "__reward_tier__";

/**
 * Which ticket TYPE the free ticket is, matched by tier name against the
 * sold event. Empty means "same type as the ticket that triggered it".
 */
export async function getRewardTierName(): Promise<string> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const raw = (data as Record<string, unknown>)[LOCAL_TIER_KEY];
    return typeof raw === "string" ? raw : "";
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: REWARD_CFG_PK } } }),
  );
  return out.Item?.tier?.S ?? "";
}

export async function setRewardTierName(tierName: string): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    (data as Record<string, unknown>)[LOCAL_TIER_KEY] = tierName;
    await localWrite(data);
    return;
  }

  await db().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: REWARD_CFG_PK } },
      UpdateExpression: "SET #t = :t",
      ExpressionAttributeNames: { "#t": "tier" },
      ExpressionAttributeValues: { ":t": { S: tierName } },
    }),
  );
}

const WELCOME_CFG_PK = "cfg#ambassador-welcome";
const LOCAL_WELCOME_KEY = "__welcome__";

export type WelcomeTemplate = { subject: string; body: string };

/**
 * The editable welcome email. Empty strings mean "use the standard wording";
 * the defaults live with the renderer in lib/email.ts.
 */
export async function getWelcomeTemplate(): Promise<WelcomeTemplate> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const raw = (data as Record<string, unknown>)[LOCAL_WELCOME_KEY] as
      | Partial<WelcomeTemplate>
      | undefined;
    return {
      subject: typeof raw?.subject === "string" ? raw.subject : "",
      body: typeof raw?.body === "string" ? raw.body : "",
    };
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: WELCOME_CFG_PK } } }),
  );
  return {
    subject: out.Item?.subject?.S ?? "",
    body: out.Item?.body?.S ?? "",
  };
}

export async function setWelcomeTemplate(
  template: WelcomeTemplate,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    (data as Record<string, unknown>)[LOCAL_WELCOME_KEY] = template;
    await localWrite(data);
    return;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: {
        pk: { S: WELCOME_CFG_PK },
        subject: { S: template.subject },
        body: { S: template.body },
      },
    }),
  );
}

const ONBOARD_CFG_PK = "cfg#ambassador-onboard";
const LOCAL_ONBOARD_KEY = "__onboard__";

export type OnboardTicket = { eventId: string; tierId: string };

/** Which event and type the one-click welcome ticket mints. Empty = unset. */
export async function getOnboardTicket(): Promise<OnboardTicket> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const raw = (data as Record<string, unknown>)[LOCAL_ONBOARD_KEY] as
      | Partial<OnboardTicket>
      | undefined;
    return {
      eventId: typeof raw?.eventId === "string" ? raw.eventId : "",
      tierId: typeof raw?.tierId === "string" ? raw.tierId : "",
    };
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: ONBOARD_CFG_PK } } }),
  );
  return {
    eventId: out.Item?.eventId?.S ?? "",
    tierId: out.Item?.tierId?.S ?? "",
  };
}

export async function setOnboardTicket(setting: OnboardTicket): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    (data as Record<string, unknown>)[LOCAL_ONBOARD_KEY] = setting;
    await localWrite(data);
    return;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: {
        pk: { S: ONBOARD_CFG_PK },
        eventId: { S: setting.eventId },
        tierId: { S: setting.tierId },
      },
    }),
  );
}

export async function deleteAmbassador(code: string): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    delete data[code];
    await localWrite(data);
    return;
  }

  const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
  await db().send(
    new DeleteItemCommand({ TableName: table, Key: { pk: { S: pk(code) } } }),
  );
}

/** Carries the tap counter through a code rename. */
export async function moveAmbassadorClicks(
  oldCode: string,
  newCode: string,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    const from = data[oldCode] as (Ambassador & { clicks?: number }) | undefined;
    const to = data[newCode] as (Ambassador & { clicks?: number }) | undefined;
    if (from?.clicks && to) to.clicks = (to.clicks ?? 0) + from.clicks;
    await localWrite(data);
    return;
  }

  const item = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: clickPk(oldCode) } } }),
  );
  const n = Number(item.Item?.n?.N ?? 0);
  if (n > 0) {
    await db().send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: clickPk(newCode) } },
        UpdateExpression: "ADD n :n",
        ExpressionAttributeValues: { ":n": { N: String(n) } },
      }),
    );
    const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
    await db().send(
      new DeleteItemCommand({
        TableName: table,
        Key: { pk: { S: clickPk(oldCode) } },
      }),
    );
  }
}

/** One more tap on a share link. Fire and forget at the call site. */
export async function bumpAmbassadorClicks(code: string): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    // Local driver keeps clicks inline on the pass for simplicity.
    const row = data[code] as (Ambassador & { clicks?: number }) | undefined;
    if (!row) return;
    row.clicks = (row.clicks ?? 0) + 1;
    await localWrite(data);
    return;
  }

  await db()
    .send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: clickPk(code) } },
        UpdateExpression: "ADD n :one",
        ExpressionAttributeValues: { ":one": { N: "1" } },
      }),
    )
    .catch((error) => console.error("[1127] click bump failed", error));
}

export async function readAmbassadorClicks(
  codes: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    for (const code of codes) {
      const row = data[code] as (Ambassador & { clicks?: number }) | undefined;
      out.set(code, row?.clicks ?? 0);
    }
    return out;
  }

  await Promise.all(
    codes.map(async (code) => {
      const item = await db().send(
        new GetItemCommand({ TableName: table, Key: { pk: { S: clickPk(code) } } }),
      );
      out.set(code, Number(item.Item?.n?.N ?? 0));
    }),
  );
  return out;
}

export async function listAmbassadors(): Promise<Ambassador[]> {
  const table = TABLE();

  if (!table) {
    // The local file also holds the cfg stand-in rows (reward settings, the
    // welcome template); only real ambassador rows have a code.
    return Object.values(await localRead())
      .filter(
        (row): row is Ambassador =>
          typeof row === "object" && row !== null && typeof row.code === "string",
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  const rows: Ambassador[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :a)",
        ExpressionAttributeValues: { ":a": { S: "amb#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) {
      rows.push({
        code: item.code?.S ?? "",
        name: item.name?.S ?? "",
        email: (item.email as { S?: string } | undefined)?.S ?? undefined,
        active: item.active?.BOOL ?? false,
        rewardsGiven: (item.rewardsGiven as { N?: string } | undefined)?.N
          ? Number((item.rewardsGiven as { N: string }).N)
          : undefined,
        rewardedEvents:
          (item.rewardedEvents as { SS?: string[] } | undefined)?.SS ??
          undefined,
        statsId: (item.statsId as { S?: string } | undefined)?.S ?? undefined,
        welcomeEmailAt:
          (item.welcomeEmailAt as { S?: string } | undefined)?.S ?? undefined,
        welcomeTicketAt:
          (item.welcomeTicketAt as { S?: string } | undefined)?.S ?? undefined,
        welcomeTicketCode:
          (item.welcomeTicketCode as { S?: string } | undefined)?.S ?? undefined,
        welcomeTicketManual:
          (item.welcomeTicketManual as { BOOL?: boolean } | undefined)?.BOOL ===
            true || undefined,
        createdAt: item.createdAt?.S ?? "",
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => a.code.localeCompare(b.code));
}
