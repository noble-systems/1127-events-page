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

export const dynamoStore: Store = {
  kind: "dynamodb",

  async listEvents() {
    const out = await client().send(new ScanCommand({ TableName: EVENTS_TABLE() }));
    return (out.Items ?? []) as EventRecord[];
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
      const out = await client().send(
        new QueryCommand({
          TableName: SUBMISSIONS_TABLE(),
          IndexName: "byType",
          KeyConditionExpression: "#t = :t",
          ExpressionAttributeNames: { "#t": "type" },
          ExpressionAttributeValues: { ":t": type },
          // Newest first
          ScanIndexForward: false,
        }),
      );
      return (out.Items ?? []) as SubmissionRecord[];
    }

    const out = await client().send(
      new ScanCommand({ TableName: SUBMISSIONS_TABLE() }),
    );
    return ((out.Items ?? []) as SubmissionRecord[]).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  async deleteSubmission(pk) {
    await client().send(
      new DeleteCommand({ TableName: SUBMISSIONS_TABLE(), Key: { pk } }),
    );
  },
};
