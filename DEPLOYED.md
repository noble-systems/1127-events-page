# Deployment record

Account **769194516210**. Deployed 29 July 2026.

**Everything is in us-west-1.** Amplify Hosting, DynamoDB, Cognito, SES, S3 and
the IAM policy.

None of the values here are secret. Access keys and `APP_SECRET` are never
recorded in the repo.

## The backend moved from us-west-2 on 29 July 2026

It briefly ran split, with Amplify in us-west-1 and the data in us-west-2, then
was consolidated. Nothing is left running in us-west-2 that the app depends on.

Three things had to change in the template before a second region would deploy at
all. All three are permanent traps, not one-offs:

- **S3 bucket names are globally unique across every account and region.** The
  stack collided with its own bucket. The name now carries `${AWS::Region}`.
- **IAM is a global namespace too.** The managed policy collided identically, so
  it is now `1127-events-app-data-${AWS::Region}`.
- **Cognito refuses a user pool whose SES identity is unverified**, and verifying
  that identity needs DKIM records that only exist once the identity has been
  created. Circular on a fresh region. Hence the `UseSesForCognito` parameter and
  a deliberate two-pass deploy.

Two further things worth knowing if this is ever repeated:

- `DeletionPolicy: Retain` means a failed stack leaves tables and buckets
  behind, and those orphans then block the retry with an existence check. Delete
  them before redeploying.
- The Amplify **compute role** keeps whatever policy was attached to it. Moving
  region does not move the policy, so the app deployed green and then returned
  502 on every write until the new policy was attached and the old one detached.

### Do not "fix" a region with find-and-replace

A blind replace has been attempted twice on this project and did real damage both
times:

- It ate the closing quote on the region fallback in `lib/sms.ts` and
  `lib/store/dynamo.ts`, producing unterminated string literals that broke the
  build.
- **A Cognito pool ID contains its region as part of the identifier.**
  `us-west-1_mL39ZWlIe` is the literal name of the pool. Rewriting the region
  inside it does not move anything; it produces an ID that authenticates nothing.

Moving regions is an infrastructure migration, not an edit.

## Stack outputs (us-west-1, stack `events-1127`)

| Output                    | Value                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| EventsTableName           | `1127-events-events`                                              |
| SubmissionsTableName      | `1127-events-submissions`                                         |
| CognitoUserPoolId         | `us-west-1_mL39ZWlIe`                                             |
| CognitoClientId           | `6m6cp251j76grdcaja3b0hasc2`                                      |
| EmailConfigurationSetName | `1127-events-email`                                               |
| AppDataPolicyArn          | `arn:aws:iam::769194516210:policy/1127-events-app-data-us-west-1` |

## Amplify app (us-west-1)

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| App name       | `1127-events-page`                          |
| App ID         | `d25r2jramweewa`                            |
| Default domain | `d25r2jramweewa.amplifyapp.com`             |
| Platform       | `WEB_COMPUTE` (SSR, correct for this app)   |
| Repository     | `github.com/noble-systems/1127-events-page` |
| Branch         | `main`, auto-build enabled                  |

## Amplify environment variables

```
EVENTS_TABLE=1127-events-events
SUBMISSIONS_TABLE=1127-events-submissions
RATELIMIT_TABLE=1127-events-ratelimit
IMAGES_BUCKET=1127-events-images-769194516210-us-west-1
IMAGES_BASE_URL=https://1127-events-images-769194516210-us-west-1.s3.us-west-1.amazonaws.com
NEXT_PUBLIC_IMAGES_BASE_URL=https://1127-events-images-769194516210-us-west-1.s3.us-west-1.amazonaws.com
COGNITO_USER_POOL_ID=us-west-1_mL39ZWlIe
COGNITO_CLIENT_ID=6m6cp251j76grdcaja3b0hasc2
APP_AWS_REGION=us-west-1
SES_CONFIGURATION_SET=1127-events-email
SES_FROM_ADDRESS=hello@1127.events
SITE_URL=https://1127.events
APP_SECRET=<32+ random characters, generated, never committed>
```

**Setting a variable in the Amplify console is not enough.** Amplify exposes
environment variables to the build but does not inject them into the Next.js SSR
runtime, so a new one must also be added to the `env | grep -E` allow-list in
`amplify.yml`. Skipping that produces a site that deploys green, serves every
page, and fails every write.

`NEXT_PUBLIC_IMAGES_BASE_URL` duplicates `IMAGES_BASE_URL` because the dashboard
resolves image previews in the browser. It is not a secret: the bucket serves
those objects publicly by design.

## DNS at Namecheap: current, verified state

Do not re-enter these. They are in place and SES has verified against them.

| Type  | Host                                          | Value                                                 |
| ----- | --------------------------------------------- | ----------------------------------------------------- |
| CNAME | `nwj3qwkugafptnymcbixxuwcaizocc3n._domainkey` | `nwj3qwkugafptnymcbixxuwcaizocc3n.dkim.amazonses.com` |
| CNAME | `naiduwvezn5ixl4nxa6vw5sovh4ss6eu._domainkey` | `naiduwvezn5ixl4nxa6vw5sovh4ss6eu.dkim.amazonses.com` |
| CNAME | `saqktw2n2sqv4pohmh6dnzlyo2yvhz2w._domainkey` | `saqktw2n2sqv4pohmh6dnzlyo2yvhz2w.dkim.amazonses.com` |
| MX    | `mail`                                        | `feedback-smtp.us-west-1.amazonses.com` (priority 10) |
| TXT   | `mail`                                        | `v=spf1 include:amazonses.com ~all`                   |

The MAIL FROM MX points at **us-west-1**, matching where the SES identity lives.
If the region ever changes again this record changes with it, along with all
three DKIM tokens, which are also region-specific.

### Root records: Google Workspace and the apex

Email moved to Google Workspace, which replaced the old Namecheap
email-forwarding records. Current state:

| Type      | Host  | Value                                  | Priority |
| --------- | ----- | -------------------------------------- | -------- |
| MX        | `@`   | `smtp.google.com`                      | 1        |
| TXT       | `@`   | `v=spf1 include:_spf.google.com ~all`  |          |
| TXT       | `@`   | `google-site-verification=HiX0PTw8...` |          |
| **ALIAS** | `@`   | `d2hoe5qz3t1mgx.cloudfront.net`        |          |
| CNAME     | `www` | `d2hoe5qz3t1mgx.cloudfront.net`        |          |

**An earlier version of this file said five `eforward*.registrar-servers.com` MX
records were load-bearing. They are not, any more. Do not restore them: they
would compete with `smtp.google.com` and break Workspace delivery.** Google's
single-MX setup is complete on its own.

Two things that are easy to get wrong here:

- **The apex must be an ALIAS, never a CNAME.** DNS forbids a CNAME on a root
  domain, and adding one anyway makes it take precedence over every other record
  at `@`, including the MX. The website would look perfect while all email
  silently stopped.
- **Two SPF records coexist because they are on different hostnames.** `@` covers
  Google, `mail` covers SES. The "one SPF record per domain" rule is per
  hostname. Neither may be merged into the other, and this separation is why the
  Workspace migration did not disturb SES.

The `mail` subdomain records exist so SES puts its envelope sender there instead
of the root, which is precisely what keeps the two mail systems independent.

## Verified working

- DynamoDB read and write, against the real tables
- Event seeding: `sun-club`, `in-development`, `__seed__` marker present
- Consent derivation in production config: a phone number produced
  `smsOptIn: true`, `termsVersion: 2026-07-29`, IP captured
- SES send: 4 messages delivered, no errors
- Full round trip: 1.16s

## SES: production access granted

Out of the sandbox in **us-west-1** as of 30 July 2026. Quota 50,000 messages a
day, 14 a second, enforcement status HEALTHY. Confirmed by delivering to
`success@simulator.amazonses.com`, which is outside the verified domain and
would have been refused in the sandbox.

Confirmation emails now reach real recipients.

The earlier us-west-2 request was correctly refused: that region's identity was
deleted with the stack, and AWS requires a verified identity before granting.
That case can be closed.

## Signing in to the dashboard

There is no password. Go to `/admin`, enter your address, and an **8-digit**
code arrives by email. Cognito sets that length, not us; much of the
documentation implies six, and the code input deliberately accepts up to eight
so a change at Cognito's end cannot silently truncate and lock everybody out. Accounts exist for:

- daniel@1127.events
- ethan@1127.events

Both are CONFIRMED with verified email addresses. (taylor@1127.events was removed when that mailbox was retired.)

Codes send through SES from `hello@1127.events`. This works today despite the
SES sandbox, because every admin address is at the verified domain.

**Adding somebody.** Create the user, then set a throwaway permanent password to
move them out of `FORCE_CHANGE_PASSWORD`, which Cognito requires before
`EMAIL_OTP` will work. Nobody needs to know that password and it should not be
recorded:

```
aws cognito-idp admin-create-user --user-pool-id us-west-1_mL39ZWlIe \
  --region us-west-1 --username new@1127.events --message-action SUPPRESS \
  --user-attributes Name=email,Value=new@1127.events Name=email_verified,Value=true
aws cognito-idp admin-set-user-password --user-pool-id us-west-1_mL39ZWlIe \
  --region us-west-1 --username new@1127.events --permanent \
  --password "$(openssl rand -base64 24)Aa1!"
```

`--message-action SUPPRESS` matters: without it Cognito emails a temporary
password nobody will use, which is exactly the sort of message that trains
people to click on credential emails.

## Swapping a photograph

Event photos live in `1127-events-images-769194516210-us-west-1`, which grants
`GetObject` to the public and nothing else. No listing, no public write.

The dashboard is the intended route: open an event, choose a file, and it uploads
straight to S3 via a presigned PUT and fills in the reference. Photographs never
pass through the app, which matters because a Lambda request body is capped well
below the size of a photo off a real camera.

References are stored as **keys**, not URLs: `s3:events/sun-club/hero.jpg`. That
means moving bucket or region later is a config change rather than a data
migration, and the validator never has to decide whether some hostname is
acceptable. Objects are cached for five minutes, so a swap appears almost at once.

Two rules worth knowing:

- The key is derived from the event id and the file's content type, never from
  the uploaded filename. Filenames are attacker-controlled.
- SVG is refused. These are photographs, and SVG can carry script.

## Rate limits

A sliding window log in `1127-events-ratelimit`, with TTL so expired windows
clean themselves up.

| What                    | Limit                                      |
| ----------------------- | ------------------------------------------ |
| Public form submissions | 6 per 10 minutes per IP                    |
| Requesting a login code | 4 per 15 minutes, per IP **and** per email |
| Submitting a login code | 8 per 15 minutes, per IP **and** per email |

Login is limited harder than the public forms because each request emails a real
person, and because the number of guesses at six digits is the whole security
margin. Both keys are applied: IP alone lets one attacker spread guesses across
accounts, email alone lets a botnet concentrate on one.

If DynamoDB is unreachable the limiter **allows** the request and logs. A storage
blip should not take the RSVP form down, and the honeypot, validation and
Cognito's own throttling still apply.

## Still to do

1. Request SES production access. Roughly a day. Until then, RSVP confirmations
   only reach `@1127.events` addresses, so a member of the public who signs up
   gets nothing.
2. A2P 10DLC registration for texting. Weeks, entirely external.
3. Real photographs. The bucket and the upload flow are ready; there are no
   photos in it yet, so every image is still a designed gradient placeholder.
4. Optional: a DMARC record. SPF and DKIM are both in place and aligned, so this
   is the remaining piece that would stop someone spoofing `@1127.events`.

## Build note

Amplify runs `npm ci`, which refuses to reconcile a lockfile that disagrees with
`package.json`. The first build failed on exactly that: the lockfile was
generated on Windows and omitted the Linux branch of `sharp`'s optional
dependencies, so `@emnapi/core` was missing. Regenerating with
`npm install --package-lock-only` produces a lockfile covering all platforms.

If a build ever fails on `npm ci` again, that is the first thing to check, and
note that testing `npm ci` on Windows will not reproduce it.
