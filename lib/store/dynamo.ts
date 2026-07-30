import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { EventRecord, SubmissionRecord, SubmissionType } from "@/lib/types";
import type { Store } from "./types";

/**
 * Reads every page, not just the first.
 *
 * DynamoDB caps a Scan or Query response at 1MB and hands back a
 * LastEvaluatedKey to continue from. Neither reader followed it, so once the
 * table outgrew a megabyte the app silently saw a prefix of it: counts short,
 * exports missing people, and, worst of all, lookups by address missing rows
 * that were genuinely there. A returning guest past the boundary would have
 * looked like a new signup, and an unsubscribe for one would have marked
 * nothing at all.
 *
 * Nothing failed and nothing logged, which is exactly what makes it dangerous.
 * A few thousand records is where it starts.
 */
async function readAll<T>(
  send: (cursor: Record<string, unknown> | undefined) => Promise<{
    Items?: Record<string, unknown>[];
    LastEvaluatedKey?: Record<string, unknown>;
  }>,
): Promise<T[]> {
  const items: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;

  do {
    const page = await send(cursor);
    items.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return items as T[];
}

/**
 * DynamoDB driver.
 *
 * Table shapes (see infra/1127-infra.yaml):
 *   Events       PK id (S)
 *   Submissions  PK pk (S)  ·  GSI "byType": PK type (S), SK createdAt (S)
 *
 * Both tables are tiny, so events are read with a Scan; submissions use the
 * GSI so the dashboard can page newest-first without scanning.
 */

// Amplify reserves names beginning with AWS_, so APP_AWS_REGION is the one you
// can actually set in the console; AWS_REGION is injected by Lambda at runtime.
const region = process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let docClient: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

const EVENTS_TABLE = () => process.env.EVENTS_TABLE as string;
const SUBMISSIONS_TABLE = () => process.env.SUBMISSIONS_TABLE as string;

/**
 * Reserved row id for the content overrides. Filtered out of every event
 * listing alongside the seed marker, so it can never surface as an event.
 */
const CONTENT_ROW_ID = "__content__";

export const dynamoStore: Store = {
  kind: "dynamodb",

  async getContent() {
    const result = await client().send(
      new GetCommand({ TableName: EVENTS_TABLE(), Key: { id: CONTENT_ROW_ID } }),
    );
    const raw = result.Item?.overrides;
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      // Corrupt JSON must not take the homepage down: the caller falls back to
      // the committed defaults.
      console.error("[1127] content overrides are not valid JSON, ignoring");
      return null;
    }
  },

  async putContent(overrides) {
    // Stored as a JSON string rather than a nested map so keys containing dots
    // stay keys, and so the row shape never collides with an EventRecord.
    await client().send(
      new PutCommand({
        TableName: EVENTS_TABLE(),
        Item: {
          id: CONTENT_ROW_ID,
          overrides: JSON.stringify(overrides),
          updatedAt: new Date().toISOString(),
        },
      }),
    );
  },

  async listEvents() {
    return readAll<EventRecord>((cursor) =>
      client().send(
        new ScanCommand({
          TableName: EVENTS_TABLE(),
          ExclusiveStartKey: cursor,
        }),
      ),
    );
  },

  async getEvent(id) {
    const out = await client().send(
      new GetCommand({ TableName: EVENTS_TABLE(), Key: { id } }),
    );
    return (out.Item as EventRecord | undefined) ?? null;
  },

  async putEvent(event) {
    await client().send(new PutCommand({ TableName: EVENTS_TABLE(), Item: event }));
    return event;
  },

  async deleteEvent(id) {
    await client().send(
      new DeleteCommand({ TableName: EVENTS_TABLE(), Key: { id } }),
    );
  },

  async putSubmission(submission) {
    await client().send(
      new PutCommand({ TableName: SUBMISSIONS_TABLE(), Item: submission }),
    );
    return submission;
  },

  async getSubmission(pk) {
    const out = await client().send(
      new GetCommand({ TableName: SUBMISSIONS_TABLE(), Key: { pk } }),
    );
    return (out.Item as SubmissionRecord | undefined) ?? null;
  },

  async listSubmissions(type?: SubmissionType) {
    if (type) {
      return readAll<SubmissionRecord>((cursor) =>
        client().send(
          new QueryCommand({
            TableName: SUBMISSIONS_TABLE(),
            IndexName: "byType",
            KeyConditionExpression: "#t = :t",
            ExpressionAttributeNames: { "#t": "type" },
            ExpressionAttributeValues: { ":t": type },
            // Newest first
            ScanIndexForward: false,
            ExclusiveStartKey: cursor,
          }),
        ),
      );
    }

    const rows = await readAll<SubmissionRecord>((cursor) =>
      client().send(
        new ScanCommand({
          TableName: SUBMISSIONS_TABLE(),
          ExclusiveStartKey: cursor,
        }),
      ),
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async deleteSubmission(pk) {
    await client().send(
      new DeleteCommand({ TableName: SUBMISSIONS_TABLE(), Key: { pk } }),
    );
  },
};
