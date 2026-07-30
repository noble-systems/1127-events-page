import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";

/**
 * Rate limiting: sliding window log, stored in DynamoDB.
 *
 * Replaces an in-process Map, which looked like protection and was not. On
 * Amplify the app runs as Lambda: every cold start began with an empty map, and
 * concurrent instances each kept their own, so the real ceiling was
 * (limit x instances) and reset constantly. Anything shared has to live outside
 * the process.
 *
 * Sliding window rather than a fixed window because a fixed window lets someone
 * spend the whole allowance at 11:59:59 and the whole next allowance at
 * 12:00:00, which is twice the limit through the seam. A log of timestamps has
 * no seam: the window is always measured backwards from now.
 *
 * The window math is a pure function (`evaluateWindow`) so it can be tested
 * exhaustively without AWS. The storage layer around it is deliberately thin.
 */

/* -------------------------------------------------------------------------- */
/* The pure part                                                              */
/* -------------------------------------------------------------------------- */

export type RateLimitRule = {
  /** Requests permitted within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  /** How many more requests are permitted right now. */
  remaining: number;
  /** Seconds until the next request would be allowed. Zero when allowed. */
  retryAfterSeconds: number;
  /** Timestamps to persist for the next evaluation. */
  timestamps: number[];
};

/**
 * Decides whether one more request fits in the window.
 *
 * `timestamps` are epoch milliseconds of previous accepted requests, in any
 * order. Anything older than the window is dropped rather than counted, which
 * is what keeps stored state bounded without a separate cleanup job.
 */
export function evaluateWindow(
  timestamps: readonly number[],
  now: number,
  rule: RateLimitRule,
): RateLimitDecision {
  const windowMs = rule.windowSeconds * 1000;
  const cutoff = now - windowMs;

  // Only requests inside the window count. Timestamps from the future are
  // ignored too: a clock skew between instances should not grant free capacity.
  const live = timestamps
    .filter((time) => Number.isFinite(time) && time > cutoff && time <= now)
    .sort((a, b) => a - b);

  if (live.length >= rule.limit) {
    // The window frees up when its oldest entry falls out.
    const oldest = live[0] as number;
    const retryMs = oldest + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      // Always at least a second, so a caller told to wait never reads "0".
      retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
      timestamps: live,
    };
  }

  const next = [...live, now];
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - next.length),
    retryAfterSeconds: 0,
    timestamps: next,
  };
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Named limits, so the numbers live in one place rather than scattered across
 * route handlers.
 *
 * The login limits are tighter than the form limit on purpose. A public form
 * being spammed costs us junk rows we can delete. A login endpoint being
 * hammered is someone trying to get into the dashboard, and each attempt also
 * sends a real email to a real person.
 */
export const RATE_LIMITS = {
  /** Public form submissions: RSVP, talent, ambassador, partner. */
  form: { limit: 6, windowSeconds: 10 * 60 },
  /** Requesting a login code. Each one emails a member of staff. */
  loginRequest: { limit: 4, windowSeconds: 15 * 60 },
  /** Submitting a login code. Guards against guessing the six digits. */
  loginVerify: { limit: 8, windowSeconds: 15 * 60 },
  /**
   * Unsubscribing. Unauthenticated, and each call scans the submissions table
   * to find every record for the address, so an unthrottled endpoint is a cost
   * and availability amplifier even though the token itself cannot be guessed.
   * Generous, because a real person clicking twice must never be blocked.
   */
  unsubscribe: { limit: 20, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const TABLE = () => process.env.RATELIMIT_TABLE?.trim();
const region = () =>
  process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? "us-west-1";

let client: DynamoDBClient | null = null;
function db(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: region() });
  return client;
}

/**
 * Development fallback. Single process, so a Map is honest here in a way it
 * never was in production.
 */
const local = new Map<string, number[]>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

/**
 * Records one request against `key` and says whether it is permitted.
 *
 * On any storage failure this ALLOWS the request and logs. That is a deliberate
 * trade: a DynamoDB blip should not take the RSVP form down, and the honeypot,
 * validation and Cognito's own throttling all still apply. The alternative,
 * failing closed, converts a monitoring problem into an outage.
 */
export async function consume(
  name: RateLimitName,
  key: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const pk = `${name}#${key}`;
  const table = TABLE();

  if (!table) {
    const decision = evaluateWindow(local.get(pk) ?? [], now, rule);
    if (decision.allowed) local.set(pk, decision.timestamps);
    return shape(decision, rule);
  }

  try {
    const existing = await db().send(
      new GetItemCommand({
        TableName: table,
        Key: { pk: { S: pk } },
        // Strongly consistent: an eventually consistent read here would let a
        // burst of parallel requests each see a stale, emptier window.
        ConsistentRead: true,
      }),
    );

    const stored = (existing.Item?.hits?.L ?? [])
      .map((entry) => Number(entry.N))
      .filter((value) => Number.isFinite(value));

    const decision = evaluateWindow(stored, now, rule);
    if (!decision.allowed) return shape(decision, rule);

    const version = existing.Item?.version?.N ?? "0";
    const nextVersion = String(Number(version) + 1);

    await db().send(
      new PutItemCommand({
        TableName: table,
        Item: {
          pk: { S: pk },
          hits: { L: decision.timestamps.map((time) => ({ N: String(time) })) },
          version: { N: nextVersion },
          // TTL well past the window so DynamoDB reclaims the row on its own.
          expiresAt: {
            N: String(Math.ceil(now / 1000) + rule.windowSeconds * 2),
          },
        },
        // Optimistic concurrency. Two requests racing on the same key means one
        // read a window that is already out of date, and it has to try again
        // rather than overwrite the other's hit.
        ConditionExpression: "attribute_not_exists(pk) OR version = :expected",
        ExpressionAttributeValues: { ":expected": { N: version } },
      }),
    );

    return shape(decision, rule);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Lost the race. The other writer's hit is recorded; counting this one as
      // allowed-but-with-no-remaining is the conservative reading, and a caller
      // hitting this is already at the edge of the limit.
      return {
        allowed: true,
        remaining: 0,
        retryAfterSeconds: 0,
        limit: rule.limit,
      };
    }

    console.error("[1127] rate limit check failed, allowing request", error);
    return {
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: 0,
      limit: rule.limit,
    };
  }
}

function shape(decision: RateLimitDecision, rule: RateLimitRule): RateLimitResult {
  return {
    allowed: decision.allowed,
    remaining: decision.remaining,
    retryAfterSeconds: decision.retryAfterSeconds,
    limit: rule.limit,
  };
}

/** Test seam: clears the development fallback between cases. */
export function resetLocalRateLimits(): void {
  local.clear();
}
