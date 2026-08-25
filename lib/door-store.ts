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

/**
 * Door passes, "dpass#<id>" in the utility table.
 *
 * A pass is a PIN with a label: "Marco", "west door". The PIN is stored as
 * written because the admin page has to show it again to hand out at call
 * time, and the blast radius of a leaked one is scanning tickets, behind a
 * PIN space large enough (8 chars, 31-letter alphabet) that online guessing
 * dies against the login rate limit.
 */

export type DoorPass = {
  id: string;
  label: string;
  pin: string;
  active: boolean;
  /** Cookies issued at or before this moment are dead. */
  revokedAfter?: number;
  createdAt: string;
  lastUsedAt?: string;
};

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

const LOCAL_FILE = path.join(process.cwd(), ".data", "door-passes.json");

async function localRead(): Promise<Record<string, DoorPass>> {
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function localWrite(data: Record<string, DoorPass>): Promise<void> {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

const pk = (id: string) => `dpass#${id}`;

/** Same door-friendly alphabet as ticket codes: no 0/O/1/I/L. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newDoorPin(): string {
  const bytes = randomBytes(8);
  let pin = "";
  for (let i = 0; i < 8; i++) pin += ALPHABET[bytes[i] % ALPHABET.length];
  return `${pin.slice(0, 4)}-${pin.slice(4)}`;
}

function toItem(pass: DoorPass) {
  return {
    pk: { S: pk(pass.id) },
    id: { S: pass.id },
    label: { S: pass.label },
    pin: { S: pass.pin },
    active: { BOOL: pass.active },
    ...(pass.revokedAfter ? { revokedAfter: { N: String(pass.revokedAfter) } } : {}),
    createdAt: { S: pass.createdAt },
    ...(pass.lastUsedAt ? { lastUsedAt: { S: pass.lastUsedAt } } : {}),
  };
}

function fromItem(
  item: Record<string, { S?: string; N?: string; BOOL?: boolean }>,
): DoorPass {
  return {
    id: item.id?.S ?? "",
    label: item.label?.S ?? "",
    pin: item.pin?.S ?? "",
    active: item.active?.BOOL ?? false,
    revokedAfter: item.revokedAfter?.N ? Number(item.revokedAfter.N) : undefined,
    createdAt: item.createdAt?.S ?? "",
    lastUsedAt: item.lastUsedAt?.S ?? undefined,
  };
}

export async function createDoorPass(label: string): Promise<DoorPass> {
  const pass: DoorPass = {
    id: randomBytes(6).toString("hex"),
    label,
    pin: newDoorPin(),
    active: true,
    createdAt: new Date().toISOString(),
  };
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    data[pass.id] = pass;
    await localWrite(data);
    return pass;
  }

  await db().send(
    new PutItemCommand({
      TableName: table,
      Item: toItem(pass),
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return pass;
}

export async function getDoorPass(id: string): Promise<DoorPass | null> {
  const table = TABLE();

  if (!table) {
    return (await localRead())[id] ?? null;
  }

  const out = await db().send(
    new GetItemCommand({ TableName: table, Key: { pk: { S: pk(id) } } }),
  );
  return out.Item ? fromItem(out.Item as never) : null;
}

export async function listDoorPasses(): Promise<DoorPass[]> {
  const table = TABLE();

  if (!table) {
    return Object.values(await localRead()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  const rows: DoorPass[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "begins_with(pk, :d)",
        ExpressionAttributeValues: { ":d": { S: "dpass#" } },
        ExclusiveStartKey: cursor as never,
      }),
    );
    for (const item of page.Items ?? []) rows.push(fromItem(item as never));
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** PIN comparison is exact; the caller normalises case and hyphens. */
export async function findDoorPassByPin(pin: string): Promise<DoorPass | null> {
  const passes = await listDoorPasses();
  return passes.find((pass) => pass.pin === pin && pass.active) ?? null;
}

export async function patchDoorPass(
  id: string,
  patch: Partial<Pick<DoorPass, "active" | "revokedAfter" | "lastUsedAt">>,
): Promise<void> {
  const table = TABLE();

  if (!table) {
    const data = await localRead();
    if (!data[id]) return;
    Object.assign(data[id], patch);
    await localWrite(data);
    return;
  }

  const sets: string[] = [];
  const values: Record<string, unknown> = {};
  if (patch.active !== undefined) {
    sets.push("active = :a");
    values[":a"] = { BOOL: patch.active };
  }
  if (patch.revokedAfter !== undefined) {
    sets.push("revokedAfter = :r");
    values[":r"] = { N: String(patch.revokedAfter) };
  }
  if (patch.lastUsedAt !== undefined) {
    sets.push("lastUsedAt = :l");
    values[":l"] = { S: patch.lastUsedAt };
  }
  if (sets.length === 0) return;

  await db()
    .send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: pk(id) } },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeValues: values as never,
      }),
    )
    .catch((error) => console.error("[1127] door pass patch failed", error));
}
