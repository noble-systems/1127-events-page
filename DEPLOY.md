# Deploying 1127 Events to AWS

Architecture: **Amplify Hosting** (CloudFront + Lambda for the Next.js server)
→ **DynamoDB** for events and the email list → **Cognito** for staff sign-in.

Expect roughly **$0–15/month** at launch traffic. DynamoDB is pay-per-request,
Cognito is free under 50,000 monthly active users, and Amplify bills for build
minutes and bandwidth.

---

## 1. Create the data and identity stack

One CloudFormation command, no CDK toolchain, no bootstrap.

```bash
aws cloudformation deploy \
  --template-file infra/1127-infra.yaml \
  --stack-name events-1127 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-1 \
  --parameter-overrides AdminEmail=you@yourdomain.com
```

`AdminEmail` is optional. If you set it, AWS emails that address a temporary
password and the app walks you through choosing a real one on first sign-in.
Leave it out and create users by hand in step 4.

Read the outputs, you need all of them in step 3:

```bash
aws cloudformation describe-stacks \
  --stack-name events-1127 \
  --region us-west-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

> The two DynamoDB tables are created with `DeletionPolicy: Retain`, so
> deleting the stack will **not** delete your email list.

---

## 2. Connect the repo to Amplify Hosting

1. Push this repository to GitHub, GitLab, Bitbucket or CodeCommit.
2. AWS console → **Amplify** → **Create new app** → **Deploy from Git**.
3. Pick the repo and branch (`main`).
4. Amplify detects Next.js and reads `amplify.yml` from the repo root. Confirm
   the platform is **Next.js. SSR (WEB_COMPUTE)**, not static.
5. Deploy.

The first build will succeed even before step 3, the site falls back to the
launch content in `content/site.ts`, and `/admin` shows a clear "not
configured" notice rather than an error.

---

## 3. Add environment variables

Amplify → your app → **App settings → Environment variables**. Add all five,
using the CloudFormation outputs from step 1:

| Name                   | Output to use          |
| ---------------------- | ---------------------- |
| `EVENTS_TABLE`         | `EventsTableName`      |
| `SUBMISSIONS_TABLE`    | `SubmissionsTableName` |
| `COGNITO_USER_POOL_ID` | `CognitoUserPoolId`    |
| `COGNITO_CLIENT_ID`    | `CognitoClientId`      |
| `APP_AWS_REGION`       | `Region`               |

Email needs a few more, see [RSVP email](#rsvp-email) below.

> Amplify rejects names beginning with `AWS_`, which is why the region variable
> is `APP_AWS_REGION`. The app falls back to Lambda's own `AWS_REGION` if it is
> absent.

### Give the app permission to reach DynamoDB

Amplify → **App settings → IAM roles → Compute role**. Create or select a
service role, then attach the managed policy from the stack output
`AppDataPolicyArn`:

```bash
aws iam attach-role-policy \
  --role-name <your-amplify-compute-role> \
  --policy-arn <AppDataPolicyArn from step 1>
```

**Redeploy** after changing environment variables or the role. Amplify only
picks them up on a new build.

---

## 4. Create staff accounts

Either use the console (Cognito → your user pool → **Users** → _Create user_),
or the CLI:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <CognitoUserPoolId> \
  --username teammate@yourdomain.com \
  --user-attributes Name=email,Value=teammate@yourdomain.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region us-west-1
```

AWS emails a temporary password. On first sign-in at `/admin/login` the app
detects Cognito's forced password change and prompts for a new one inline, no
console round trip.

MFA is set to `OPTIONAL` on the pool; turn it on per user in the Cognito
console if you want it.

---

## 5. First sign-in

Sign in at `https://<your-domain>/admin`.

The launch content (Sun Club and the in-development card) is imported into
DynamoDB automatically the first time the store is read, so the dashboard and
the public site always show the same events. A marker row records that the
import already happened, which means deleting every event stays deleted rather
than reappearing on the next request.

If you delete something by mistake, **Restore launch content** on the overview
page re-adds any missing launch event without touching the ones you still have.

---

## RSVP email

Two messages go out on a first-time RSVP, a confirmation to the guest and an
alert to your team, and two more on an ambassador application: an
acknowledgement to the applicant and an alert to the team.

All of them are optional and all fail safely. **A broken email setup can never
lose a submission**, because the record is written to DynamoDB before anything
is sent, and each send is wrapped individually so one failure can't stop
another.

The dashboard's overview page shows a live **RSVP email on / off** badge with
the exact reason when it's off, plus a **Preview the RSVP email** link that
renders each template with sample data without sending anything.

### Who gets the internal alerts

Defaults live in `notifications` in [`content/site.ts`](content/site.ts) ,
currently `daniel@`, `taylor@` and `ethan@1127.events` for both RSVPs and
ambassador applications, and nobody for partner inquiries. Override per
environment with `RSVP_NOTIFY_ADDRESS`, `AMBASSADOR_NOTIFY_ADDRESS` or
`PARTNER_NOTIFY_ADDRESS` (comma separated), useful for pointing a staging
branch at a test inbox.

### 1. Verify a sending domain

Redeploy the stack with a domain:

```bash
aws cloudformation deploy \
  --template-file infra/1127-infra.yaml \
  --stack-name events-1127 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-1 \
  --parameter-overrides SendingDomain=1127.events
```

Read the DNS records back out and add them at your registrar:

```bash
aws cloudformation describe-stacks --stack-name events-1127 \
  --region us-west-1 --query 'Stacks[0].Outputs' --output table
```

- `DkimRecord1/2/3` → three **CNAME** records (proves you own the domain, signs
  outgoing mail)
- `MailFromMxRecord` → one **MX** record on `mail.` at priority 10
- `MailFromTxtRecord` → one **TXT** record on `mail.` (SPF)

Verification usually completes within an hour of the DNS propagating. Check with:

```bash
aws sesv2 get-email-identity --email-identity 1127.events --region us-west-1 \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
```

### 2. Leave the SES sandbox

New AWS accounts can only send to addresses you've verified by hand. To email
real guests you must request production access, once per account, usually
approved within 24 hours:

```bash
aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://1127.events \
  --use-case-description "Confirmation emails to people who opt in to the Sun Club event list, plus internal new-signup notifications. Every message carries a working one-click unsubscribe." \
  --region us-west-1
```

While in the sandbox you can still test by verifying your own address:

```bash
aws sesv2 create-email-identity --email-identity you@yourdomain.com --region us-west-1
```

### 3. Add the environment variables

| Name                        | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `SES_FROM_ADDRESS`          | `Sun Club <hello@1127.events>`, must be on the verified domain |
| `SES_CONFIGURATION_SET`     | The `EmailConfigurationSetName` output                         |
| `APP_SECRET`                | A random 32+ character string, `openssl rand -base64 32`       |
| `SITE_URL`                  | `https://1127.events` (used for links inside emails)           |
| `SES_REPLY_TO`              | Optional. Defaults to the from address.                        |
| `RSVP_NOTIFY_ADDRESS`       | Optional override of the recipients above.                     |
| `AMBASSADOR_NOTIFY_ADDRESS` | Optional override of the recipients above.                     |
| `PARTNER_NOTIFY_ADDRESS`    | Optional. Nobody is alerted about partner inquiries until set. |

`APP_SECRET` signs unsubscribe links. **Confirmations to guests and applicants
stay switched off until it's set**, because links signed with the built-in
development key would be forgeable by anyone. Internal notifications don't carry
unsubscribe links, so they send without it.

Redeploy after adding variables.

### Unsubscribe and compliance

Every guest and applicant email carries a signed unsubscribe link and the `List-Unsubscribe` /
`List-Unsubscribe-Post` headers, so Gmail and Outlook show their own one-click
unsubscribe button. Both routes hit `/api/unsubscribe`, which removes **all**
records for that address. RSVP, ambassador and partner alike.

The configuration set suppresses addresses that hard-bounce or report spam, so
repeat sends to a dead address won't damage your sending reputation.

Repeat RSVPs from the same address do **not** re-send anything: the confirmation
only fires on first signup.

---

## Text messages

**Read this before promising anyone a launch date.** Unlike email, US A2P text
messaging cannot be switched on in an afternoon. Carriers require every business
sending to US numbers to register the brand and the campaign first, and that is
a review process measured in days, sometimes weeks. Nothing in the code changes
that. Budget for it early.

### What has to happen, in order

1. **Provision an origination number.** AWS console → End User Messaging →
   Phone numbers. A 10DLC long code or a toll-free number both work. Toll-free
   verification is usually the faster of the two to clear.
2. **Register for A2P.** For 10DLC this means registering your brand and a
   campaign with The Campaign Registry through AWS. You will be asked for the
   business details, sample messages, and the URL of the page where people opt
   in. That page is `/rsvp`, and the opt-in wording is already on it.
3. **Create an opt-out list and attach it to the number.** This is what makes
   AWS honour a STOP reply automatically, before a message reaches this app.
4. **Create a configuration set** if you want delivery events.

### Then set these

| Name                       | Value                                            |
| -------------------------- | ------------------------------------------------ |
| `SMS_ORIGINATION_IDENTITY` | Phone number ARN, pool ID, or sender ID          |
| `SMS_OPT_OUT_LIST`         | Name of the opt-out list attached to that number |
| `SMS_CONFIGURATION_SET`    | Optional, for delivery events                    |

**Both of the first two are required before anything sends.** The opt-out list
is not a per-message API parameter, so the variable is not passed to AWS: it is
a deliberate interlock. Setting it is how you confirm the list exists, and the
app refuses to text until you have. The failure that prevents is starting to
message people before STOP works, which is the one mistake in this area with
real consequences.

The dashboard overview shows a live **Texts on / off** badge with the reason.

### What gets sent

One message, when somebody ticks the text box and gives a number:

> 1127: you're set for Sun Club texts. We'll message when a date lands.
> Msg&data rates may apply. Reply STOP to cancel, HELP for help.

It is one segment, names the brand, and repeats STOP and HELP, which is what
carriers expect of the first message in a programme. `renderDateSms` is ready
for date announcements when you want them; nothing calls it yet, so no
promotional message can go out by accident.

Numbers are normalised to E.164 before sending, and a number that cannot be read
unambiguously is skipped rather than guessed at. Texting a stranger because a
digit was misread is worse than sending nothing.

---

## 6. Custom domain

Amplify → **Hosting → Custom domains → Add domain**. Amplify provisions the
ACM certificate and the CloudFront distribution.

Then update `brand.domain` in `content/site.ts`, it drives canonical URLs,
Open Graph tags, `sitemap.xml` and `robots.txt`.

---

## Operating notes

**Where the data lives.** Two tables, both pay-per-request with point-in-time
recovery on:

- `<project>-events`, one item per event, keyed by slug
- `<project>-submissions`. RSVPs, ambassador applications and partner
  inquiries. RSVPs are keyed `rsvp#<email>` so the list self-deduplicates;
  the `byType` index serves the dashboard newest-first.

**Exporting the list.** `/admin/list` → **Export CSV**, or hit
`/api/admin/subscribers?type=rsvp&format=csv` with an admin session. UTF-8 with
a BOM, so Excel opens accented names correctly.

**Publishing.** The public page revalidates every 60 seconds and is revalidated
immediately whenever an event is saved, published or deleted.

**Backups.** Point-in-time recovery is enabled on both tables (35-day restore
window). For an off-site copy, schedule an export to S3:

```bash
aws dynamodb export-table-to-point-in-time \
  --table-arn <SubmissionsTable ARN> \
  --s3-bucket <your-backup-bucket> \
  --region us-west-1
```

**Local development.** With no environment variables set, `npm run dev` stores
data in `.data/` and enables a local sign-in (`admin@1127.local` / `1127-dev`,
overridable). That path is hard-disabled when `NODE_ENV=production`, so a
deployed build can never fall back to it, if the Cognito variables are missing
in production, `/admin` refuses to sign anyone in.
