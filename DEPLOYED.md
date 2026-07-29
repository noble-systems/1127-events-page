# Deployment record

Account **769194516210**. Deployed 29 July 2026.

**This project spans two regions on purpose. Read the next section before
copying any value out of this file.**

None of the values here are secret. Access keys and `APP_SECRET` are never
recorded in the repo.

## Two regions, and why

| What                                       | Region        |
| ------------------------------------------ | ------------- |
| Amplify Hosting app `1127-events-page`     | **us-west-1** |
| DynamoDB, Cognito, SES, IAM policy         | **us-west-2** |

The backend went to us-west-2 first; the Amplify app was later created in
us-west-1. We kept it that way deliberately rather than rebuilding, because
moving the backend would mean issuing a new SES identity and therefore three new
DKIM records plus a new MAIL FROM record at Namecheap. That DNS work already
caused one outage of `hello@1127.events`, and the only thing it buys is tidiness.

The cost of the split is about 20ms of cross-region latency on DynamoDB reads,
which the 60-second ISR cache absorbs for nearly all traffic.

**`APP_AWS_REGION=us-west-2` is what makes this work.** The app reads it for
every AWS client. If it is unset the code falls back to us-west-2 as well, so
the split fails safe, but set it explicitly so the intent is visible.

### Do not "fix" the region with find-and-replace

A blind `us-west-2` → `us-west-1` replace has been attempted once and did real
damage. Two things to understand:

- **A Cognito pool ID contains its region as part of the identifier.**
  `us-west-2_Jee1pVz4Z` is the literal name of the pool. Rewriting it to
  `us-west-1_...` does not move anything; it produces an ID that authenticates
  nothing.
- The replace also ate the closing quote on the region fallback in `lib/sms.ts`
  and `lib/store/dynamo.ts`, producing unterminated string literals that broke
  the build.

If the regions ever really need to converge, it is an infrastructure migration,
not an edit.

## Stack outputs (us-west-2, stack `events-1127`)

| Output                    | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| EventsTableName           | `1127-events-events`                                    |
| SubmissionsTableName      | `1127-events-submissions`                                |
| CognitoUserPoolId         | `us-west-2_Jee1pVz4Z`                                   |
| CognitoClientId           | `3iekhqghjkeujbpt6e28ui5uhh`                            |
| EmailConfigurationSetName | `1127-events-email`                                     |
| AppDataPolicyArn          | `arn:aws:iam::769194516210:policy/1127-events-app-data`  |

## Amplify app (us-west-1)

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| App name        | `1127-events-page`                               |
| App ID          | `d25r2jramweewa`                                 |
| Default domain  | `d25r2jramweewa.amplifyapp.com`                  |
| Platform        | `WEB_COMPUTE` (SSR, correct for this app)         |
| Repository      | `github.com/noble-systems/1127-events-page`      |
| Branch          | `main`, auto-build enabled                       |

## Amplify environment variables

```
EVENTS_TABLE=1127-events-events
SUBMISSIONS_TABLE=1127-events-submissions
COGNITO_USER_POOL_ID=us-west-2_Jee1pVz4Z
COGNITO_CLIENT_ID=3iekhqghjkeujbpt6e28ui5uhh
APP_AWS_REGION=us-west-2
SES_CONFIGURATION_SET=1127-events-email
SES_FROM_ADDRESS=hello@1127.events
SITE_URL=https://1127.events
APP_SECRET=<32+ random characters, generated, never committed>
```

## DNS at Namecheap: current, verified state

Do not re-enter these. They are in place and SES has verified against them.

| Type  | Host                                         | Value                                                 |
| ----- | -------------------------------------------- | ----------------------------------------------------- |
| CNAME | `lwb3jhpcn3ul6awf6yq466klxgr67jac._domainkey` | `lwb3jhpcn3ul6awf6yq466klxgr67jac.dkim.amazonses.com`  |
| CNAME | `dpaf7cvwb7v4yxjnp3ef3rdq4bpjdrmg._domainkey` | `dpaf7cvwb7v4yxjnp3ef3rdq4bpjdrmg.dkim.amazonses.com`  |
| CNAME | `ynuim7udmmipvao5t25iwel25gnqcuph._domainkey` | `ynuim7udmmipvao5t25iwel25gnqcuph.dkim.amazonses.com`  |
| MX    | `mail`                                       | `feedback-smtp.us-west-2.amazonses.com` (priority 10)  |
| TXT   | `mail`                                       | `v=spf1 include:amazonses.com ~all`                    |

Note the MAIL FROM MX points at **us-west-2**, because that is where the SES
identity lives. This is the clearest example of why the region split cannot be
text-edited away.

### The root MX records are load-bearing

`1127.events` must keep these five, or nothing at `@1127.events` receives mail:

| Type | Host | Value                              | Priority |
| ---- | ---- | ---------------------------------- | -------- |
| MX   | `@`  | `eforward1.registrar-servers.com`  | 10       |
| MX   | `@`  | `eforward2.registrar-servers.com`  | 10       |
| MX   | `@`  | `eforward3.registrar-servers.com`  | 10       |
| MX   | `@`  | `eforward4.registrar-servers.com`  | 15       |
| MX   | `@`  | `eforward5.registrar-servers.com`  | 20       |

Switching Mail Settings to "Custom MX" to add the `mail` subdomain record
removes these automatically. That is what broke `hello@1127.events` once.

## Verified working

- DynamoDB read and write, against the real tables
- Event seeding: `sun-club`, `in-development`, `__seed__` marker present
- Consent derivation in production config: a phone number produced
  `smsOptIn: true`, `termsVersion: 2026-07-29`, IP captured
- SES send: 4 messages delivered, no errors
- Full round trip: 1.16s

## SES sandbox: less limiting than it sounds

The account is in sandbox (200/day). But because the **whole domain** is a
verified identity, sandbox permits any recipient at `@1127.events`. So internal
notifications to daniel@, taylor@ and ethan@ work **today**. Only confirmations
to outside addresses (gmail and so on) are blocked until production access.

## Still to do

1. Set the environment variables above on the Amplify app.
2. Attach `1127-events-app-data` to the Amplify SSR compute role, or the app
   deploys green and then cannot read its own tables.
3. Request SES production access. Roughly a day.
4. Create the first Cognito staff user for dashboard sign-in.
5. Point `1127.events` at Amplify, replacing the parking record at
   `162.255.119.24`. This is the moment the site becomes public.
6. A2P 10DLC registration for texting. Weeks, entirely external.

## Build note

Amplify runs `npm ci`, which refuses to reconcile a lockfile that disagrees with
`package.json`. The first build failed on exactly that: the lockfile was
generated on Windows and omitted the Linux branch of `sharp`'s optional
dependencies, so `@emnapi/core` was missing. Regenerating with
`npm install --package-lock-only` produces a lockfile covering all platforms.

If a build ever fails on `npm ci` again, that is the first thing to check, and
note that testing `npm ci` on Windows will not reproduce it.
