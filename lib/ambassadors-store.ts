import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
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
          active: { BOOL: ambassador.active },
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
    active: out.Item.active?.BOOL ?? false,
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

export async function listAmbassadors(): Promise<Ambassador[]> {
  const table = TABLE();

  if (!table) {
    return Object.values(await localRead()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
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
        active: item.active?.BOOL ?? false,
        createdAt: item.createdAt?.S ?? "",
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return rows.sort((a, b) => a.code.localeCompare(b.code));
}
