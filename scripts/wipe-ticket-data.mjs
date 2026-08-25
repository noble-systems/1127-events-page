import {
  DynamoDBClient,
  ScanCommand,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";

/**
 * Wipes every row of TICKET data from the utility table: orders (ord#),
 * issued tickets (tkt#), Square order aliases (sqo#) and inventory counters
 * (inv#). Built for the one moment it exists for: clearing sandbox test
 * sales before real money goes live.
 *
 * Deliberately untouched: ambassador codes (amb#), door passes (dpass#),
 * analytics (m#, vlog#) and rate-limit windows. Buyer rows created in the
 * CRM by test purchases are also left alone; remove those by hand in
 * admin -> People, where you can see who they are first.
 *
 * DRY RUN by default: prints what it would delete. Nothing dies without
 * --force.
 *
 *   node scripts/wipe-ticket-data.mjs           # count and list only
 *   node scripts/wipe-ticket-data.mjs --force   # actually delete
 */

const TABLE = process.env.RATELIMIT_TABLE ?? "1127-events-ratelimit";
const REGION = process.env.APP_AWS_REGION ?? "us-west-1";
const PREFIXES = ["ord#", "tkt#", "sqo#", "inv#"];
const force = process.argv.includes("--force");

const db = new DynamoDBClient({ region: REGION });

const keys = [];
let cursor;
do {
  const page = await db.send(
    new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: "pk",
      ExclusiveStartKey: cursor,
    }),
  );
  for (const item of page.Items ?? []) {
    const pk = item.pk?.S ?? "";
    if (PREFIXES.some((prefix) => pk.startsWith(prefix))) keys.push(pk);
  }
  cursor = page.LastEvaluatedKey;
} while (cursor);

const counts = Object.fromEntries(
  PREFIXES.map((prefix) => [
    prefix,
    keys.filter((pk) => pk.startsWith(prefix)).length,
  ]),
);
console.log(`Table ${TABLE} (${REGION})`);
console.log(
  `  orders: ${counts["ord#"]}  tickets: ${counts["tkt#"]}  aliases: ${counts["sqo#"]}  counters: ${counts["inv#"]}`,
);
for (const pk of keys) console.log(`  ${pk}`);

if (keys.length === 0) {
  console.log("Nothing to wipe.");
  process.exit(0);
}

if (!force) {
  console.log(`\nDry run. ${keys.length} rows would be deleted.`);
  console.log("Run again with --force to delete them.");
  process.exit(0);
}

// BatchWriteItem takes 25 at a time; unprocessed items are retried once.
for (let i = 0; i < keys.length; i += 25) {
  const batch = keys.slice(i, i + 25);
  const request = {
    RequestItems: {
      [TABLE]: batch.map((pk) => ({ DeleteRequest: { Key: { pk: { S: pk } } } })),
    },
  };
  let out = await db.send(new BatchWriteItemCommand(request));
  const leftover = out.UnprocessedItems?.[TABLE];
  if (leftover?.length) {
    out = await db.send(
      new BatchWriteItemCommand({ RequestItems: { [TABLE]: leftover } }),
    );
    if (out.UnprocessedItems?.[TABLE]?.length) {
      console.error("Some rows did not delete; run the script again.");
    }
  }
}

console.log(`Deleted ${keys.length} rows. Ticket slate is clean.`);
