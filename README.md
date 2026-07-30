# 1127 Events

Marketing site, RSVP capture and admin dashboard for **1127 Events**, an Arizona
event-production company, featuring its first event series, **Sun Club**, a
poolside house-music series in Old Town Scottsdale.

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · DynamoDB · Cognito ·
deployed on AWS Amplify Hosting.

| Route                | What it is                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| `/`                  | The marketing site                                                                  |
| `/rsvp`              | Dedicated RSVP landing page, the one canonical link for ads and QR codes            |
| `/opportunities`     | Talent applications. DJs, audio techs, promoters, crew, plus the ambassador program |
| `/partner`           | Venue, brand and sponsor pitch with the inquiry form                                |
| `/admin`             | Dashboard: event CRUD and the email list                                            |
| `/privacy`, `/terms` | Placeholder legal pages                                                             |

---

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

**No AWS account needed to develop.** With no environment variables set, events
and submissions are stored in `.data/` on disk and `/admin` uses a local
sign-in (`admin@1127.local` / `1127-dev`). Both fallbacks are hard-disabled when
`NODE_ENV=production`.

### Scripts

| Command                           | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                     | Dev server with hot reload                                       |
| `npm run build` / `npm start`     | Production build and serve                                       |
| `npm run typecheck`               | `tsc --noEmit`                                                   |
| `npm run lint`                    | ESLint (Next core-web-vitals + TypeScript)                       |
| `npm run format` / `format:check` | Prettier, with Tailwind class sorting                            |
| `npm run test`                    | Unit tests. Node's built-in runner, no test framework to install |
| **`npm run check`**               | **All of the above. Run this before pushing.**                   |

Node 22.18+ is required (`.nvmrc` pins 24.11.0), tests are written in
TypeScript and run through Node's native type stripping, so there's no compile
step and no Jest/Vitest dependency.

### Deploying

See [DEPLOY.md](DEPLOY.md). One CloudFormation command creates the DynamoDB
tables, Cognito user pool and SES identity; Amplify builds from Git.

**The pipeline:**

```
push / PR ──> GitHub Actions (.github/workflows/ci.yml)
                typecheck · lint · format · test · build · cfn-lint
          └──> Amplify Hosting (main branch)
                npm ci → next build → CloudFront + Lambda
```

Amplify's own build is the deploy step; GitHub Actions is the gate that catches
a broken build before it ships. Connect a branch in Amplify and enable
**Preview builds** to get a URL per pull request.

Infrastructure changes are deliberate and manual:
`.github/workflows/infra.yml` → **Run workflow** deploys the CloudFormation
stack via OIDC (no long-lived AWS keys), printing the change set first.

---

## Architecture

```
Browser ──> Amplify Hosting (CloudFront + Lambda, Next.js SSR)
              │
              ├─ /            marketing page, ISR 60s
              ├─ /rsvp        RSVP capture
              ├─ /admin       Cognito-guarded dashboard
              │
              ├─ POST /api/inquiry          public forms  ─┐
              └─ /api/admin/*               guarded        │
                                                           ▼
                                    DynamoDB: events + submissions
```

- **Homepage content** lives in DynamoDB as an overlay on `content/site.ts` and
  is edited at `/admin/content`. Only changed fields are stored, so an empty or
  unreachable store renders exactly the copy committed to the repo. The schema in
  `lib/content-schema.ts` drives the store, the editor UI and the merge.
- **The hero and the series intro follow whichever event is marked Featured**,
  so their name, tagline, date, location and photograph have one source of
  truth. Those fields are deliberately absent from the content editor.
- **Photographs** upload from the dashboard straight to S3 with a presigned PUT,
  so image bytes never pass through the Lambda request body. References are
  stored as keys (`s3:site/hero-image.jpg`), not URLs, so changing bucket or
  region later is config rather than a data migration.
- **Rate limiting** is a sliding window log in DynamoDB, shared across Lambda
  instances. See `lib/rate-limit.ts` for why the previous in-process version was
  not really a limit.
- **Events** live in DynamoDB and are edited from `/admin`. The public page
  revalidates every 60 seconds, and immediately on any save/publish/delete.
- **Submissions** (RSVP, ambassador, partner) are written by `/api/inquiry`.
  RSVPs are keyed `rsvp#<email>` so the mailing list self-deduplicates.
- **Auth** is a Cognito user pool, and it is passwordless: staff enter an email
  address, Cognito emails a six-digit code, and the code is exchanged for an
  access token stored in an HTTP-only cookie and verified against the pool's
  JWKS on every admin request. There is no admin password anywhere.
  `middleware.ts` only does a fast cookie-presence redirect, it is not the
  security boundary.
- An **empty** store is seeded with the launch content on first use, so the
  dashboard and the public site always agree. The seed array is only used as a
  live fallback when the store is genuinely **unreachable**.

---

## Where to edit things

**Brand copy lives in [`content/site.ts`](content/site.ts)**, headlines, the
capabilities list, the ambassador program, the photo shot list, footer links and
contact details.

**Events are no longer edited here.** They live in DynamoDB and are managed at
`/admin/events`. The `seedEvents` array in `content/site.ts` is the launch
content: it is imported into an empty store automatically on first use, so the
dashboard and the public site can never disagree about which events exist. It
also serves as the fallback if the store is unreachable.

### Announcing a date

Events default to the `DATE_TBA` constant, which renders as **"Dates Announcing
Soon"**. Replace it with the real thing:

```ts
// content/site.ts
{
  id: "sun-club",
  date: "Saturday, May 16",     // was: DATE_TBA
  venue: "The Name Of The Venue", // was: null → rendered "Announcing soon"
}
```

### Adding a new event

Go to **`/admin/events` → New event**. `EventCard` renders whatever you create ,
no code changes. Useful fields:

- **Featured**, the large two-column card treatment. Use it for one event at a time.
- **Published**, off keeps it a draft, invisible to the public site.
- **Order**, ascending; lower numbers appear first.
- **Placeholder palette**, the gradient artwork shown until a real photo is added.
- **Button goes to**, `rsvp` sends people to `/rsvp`, `partner` to the inquiry form.

The event's URL key is generated from its name, and collisions get a numeric
suffix automatically.

### Adding real photography

Every image slot renders a designed placeholder until you give it a file. The
placeholder's caption is the shot note, so the page doubles as a shot list for
the photo team.

1. Drop files into `public/media/`
2. Point the slot at them:

```ts
{ id: "crowd", image: "/media/crowd-01.jpg", imageAlt: "…" }
```

That swaps the placeholder for an optimized `next/image` (AVIF/WebP, responsive
`sizes`, lazy except the hero). No layout changes needed.

Slots to fill: `hero.image`, `sunClub.image`, `ambassadors.image`,
`about.image`, and the eight entries in `mediaSlots`. Event photos are set from
the dashboard instead, paste the same `/media/...` path into an event's
**Photo path** field.

### Contact details

`contact` in `content/site.ts` is `null` by default, so the footer renders a
clearly-marked placeholder chip rather than a dead link. Fill in a value and it
becomes a real link automatically.

```ts
export const contact = {
  email: "hello@example.com",
  instagramHandle: "@handle",
  instagramUrl: "https://instagram.com/handle",
  phone: null,
};
```

Also update `brand.domain`, it drives canonical URLs, Open Graph tags, the
sitemap and `robots.txt`.

---

## Forms

Three forms. Sun Club RSVP, ambassador application, partner inquiry, all post to
`POST /api/inquiry`. Validation rules live in [`lib/validation.ts`](lib/validation.ts)
and run **both** in the browser (inline, on submit then live) and again on the
server, so a crafted payload can't bypass the client.

The route also has a honeypot field and a best-effort per-IP throttle.

Everything that comes in is written to the `submissions` table and shows up at
`/admin/list`, split into RSVP / Ambassadors / Partner inquiries, with search
and a **UTF-8 CSV export** (BOM included so Excel handles accented names).

### People, the CRM

Every submission. RSVP, talent, ambassador, partner, lands in one place at
`/admin/list`, filterable by type and by pipeline status, searchable across
names, emails, messages **and your own notes**.

Open any record to see the full submission (nothing truncated), move it through
the pipeline, and keep internal notes:

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Statuses** | New → Reviewing → Contacted → Accepted / Declined / Archived |
| **Open**     | The default filter: everything not yet Declined or Archived  |
| **Notes**    | Free text per record. Internal only, never sent to anyone.   |

Statuses and notes are stored on the record and included in the CSV export, so
an export is a full snapshot rather than just contact details. Only these two
fields are editable, what someone actually submitted is a record of fact and
is never rewritten from the dashboard.

**An RSVP is one person.** There is no "how many are you bringing" field: a
group counted on one form is a set of email addresses you never collected. The
success state asks people to pass the link on instead, so each guest arrives as
their own record with their own email.

RSVPs are keyed by lowercased email, so the same person signing up twice updates
one row instead of creating two, `createdAt` keeps their original signup date
while `updatedAt` moves, and their status and notes survive. **Remove** deletes
the record entirely, which is what you need for deletion requests.

To send campaigns, export the CSV and upload it to whatever platform you use.

### RSVP email

A first-time RSVP triggers two SES messages, a confirmation to the guest and a
"new RSVP" alert to your team. Both are optional, independently configured, and
**best-effort**: they run after the DynamoDB write inside their own try/catch,
so a bad SES setup can never lose a signup or fail the request. Repeat RSVPs
from the same address don't re-send.

Configuration lives in [`lib/email.ts`](lib/email.ts); setup is in
[DEPLOY.md → RSVP email](DEPLOY.md#rsvp-email). The admin overview shows a live
on/off badge with the reason, so a misconfiguration is visible rather than
silent.

Guest emails carry a signed unsubscribe link plus `List-Unsubscribe` headers for
Gmail/Outlook's built-in button. `/unsubscribe` and `POST /api/unsubscribe`
remove every record for that address.

Ambassador and talent applications do the same: an acknowledgement to the
applicant and an alert to the team. Partner inquiries are stored but email nobody until
you add recipients, set `notifications.partner` in
[`content/site.ts`](content/site.ts) or `PARTNER_NOTIFY_ADDRESS`.

Internal recipients default to `daniel@`, `taylor@` and `ethan@1127.events`.

---

## Design system

| Token                | Value                 | Use                                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `bone` / `bone-soft` | `#f7f2e9` / `#fbf8f2` | Primary light surfaces                      |
| `sand`               | `#ece1cf`             | Warm alternate surface                      |
| `ink`                | `#191713`             | Warm charcoal, text and dark surfaces       |
| `deep` / `sea`       | `#07142f` / `#10265c` | Mediterranean night                         |
| `cobalt`             | `#1b3fcb`             | Focus rings, links, accents                 |
| `sun` / `sun-soft`   | `#e0a63c` / `#f0d49a` | Primary accent                              |
| `terracotta`         | `#bf5b3c`             | Sparingly; `terracotta-deep` for error text |

Type pairs **Fraunces** (editorial display) with **Inter Tight** (UI/body), both
self-hosted via `next/font`, no external font requests at runtime.

Placeholder artwork is generated from layered CSS gradients, a geometric motif and
film grain (`components/ui/Media.tsx`), so there are no stock photos to license or
remove.

---

## Accessibility

- Semantic landmarks, ordered headings, skip link
- The mobile menu uses a native `<dialog>`: real focus trapping, Escape, top layer
- Visible focus rings that invert on dark surfaces
- All body and label text verified at **≥ 4.5:1** contrast
- `prefers-reduced-motion` disables every transition, reveal and animation
- Forms: persistent labels, `aria-invalid`, `aria-describedby`, `role="alert"` errors,
  focus moved to the first invalid field on submit

## No modals

Every call to action on the site is a plain link or a form submit. There are no
JavaScript-only buttons, which matters for more than taste: a click that lands
before React finishes hydrating is simply lost, so a modal trigger on a heavy
page can genuinely need two clicks. Links work from the first byte of HTML.

The one exception is the mobile menu, which uses a native `<dialog>`.

---

## Cookies and consent

The site sets **two cookies, both first party**, and no third-party scripts:

| Cookie         | Purpose                                     | Expires  |
| -------------- | ------------------------------------------- | -------- |
| `1127_consent` | Remembers the cookie choice                 | 6 months |
| `1127_admin`   | Keeps a signed-in team member authenticated | 8 hours  |

Both are strictly necessary, which under UK/EU rules do not require consent. The
banner says so rather than pretending otherwise, and is a **non-blocking bottom
bar** rather than a modal: nothing here is gated behind a choice, so trapping
focus to force one would be hostile and legally pointless.

The point of building it now is the day you add a Meta pixel for retargeting.
The categories already exist, so the script goes behind a check instead of being
bolted on afterwards:

```tsx
"use client";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, currentConsent } from "@/components/CookieConsent";
import { allows } from "@/lib/consent";

export function MarketingPixel() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(allows(currentConsent(), "marketing"));
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  if (!on) return null;
  return <Script src="https://connect.facebook.net/..." />;
}
```

Two rules when you do: add the cookie to `COOKIES` in
[`components/CookieTable.tsx`](components/CookieTable.tsx), and bump
`CONSENT_VERSION` in [`lib/consent.ts`](lib/consent.ts) if the categories
change meaning. A bumped version makes every stored choice decode to `null`, so
people are asked again rather than having an old answer applied to something new.
That behaviour is covered by tests.

---

## Text messages

Off by default and off until two things are true: a number is provisioned in AWS
End User Messaging, **and** an opt-out list is attached to it. The opt-out list
is not a per-message API parameter, so `SMS_OPT_OUT_LIST` is not passed to AWS.
It is an interlock: setting it is how you assert STOP works, and the app refuses
to send until you have.

One message goes out, when somebody ticks the text box and gives a number: a
one-segment confirmation naming the brand and repeating STOP and HELP.
`renderDateSms` is ready for announcements but nothing calls it, so a
promotional text cannot go out by accident.

Numbers are normalised to E.164 first, and an ambiguous number is skipped rather
than guessed at. **11 tests** cover the parsing, including area codes that
cannot start with 0 or 1, and the interlock refusing to send.

US A2P registration is a days-to-weeks external dependency. See
[DEPLOY.md](DEPLOY.md#text-messages).

---

## What gets logged with a submission

Every submission stores the technical detail of the request alongside it, so the
team can tell a real signup from a bot and see which campaign produced it:

| Captured                       | From                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| IP address                     | `x-forwarded-for` (first entry), falling back to `x-real-ip` and CloudFront's viewer address |
| Device, browser, OS            | Parsed from the user agent                                                                   |
| Country                        | CloudFront's `cloudfront-viewer-country` header                                              |
| Landing page and campaign tags | The page URL the form was submitted from                                                     |
| Referrer                       | The browser, falling back to the `referer` header                                            |

The parsing lives in [`lib/request-meta.ts`](lib/request-meta.ts) and has **28
unit tests**: proxy chains, IPv6 with and without brackets and ports, ten real
user agent strings across iOS, Android, Windows and macOS, crawler detection,
and hostile input. Every value is length-capped and stripped of control
characters before storage, because a header is attacker-controlled and ends up
in a CSV cell and an admin table.

Disclosed in `/privacy`. If you add a field, add it there too.

---

## Security notes

- Every `/api/admin/*` route calls `requireAdmin()` and verifies the Cognito
  token before doing anything. Middleware's cookie check is a UX shortcut only.
- The development sign-in is gated on `NODE_ENV !== "production"` **and** the
  absence of Cognito config. A deployed build cannot reach it; if the Cognito
  variables are missing in production, `/admin` refuses to sign anyone in rather
  than falling back.
- Event input is validated server-side on every write, including the image path,
  which must be a local `/public` path, external URLs are rejected.
- `/admin` is excluded in `robots.txt` and carries `noindex`.

## Notes

- The three legal pages describe exactly what the site does and are kept in step
  with the code, but they have **not been through legal review**. Each says so at
  the bottom. Have counsel check them against the jurisdictions 1127 operates in
  before launch.
- No dates, prices, venues, attendance figures, follower counts, testimonials,
  sponsor logos or contact details have been invented. Anything unknown renders as
  a labeled placeholder.
- The social share card is generated at build time from
  `app/opengraph-image.tsx`. To use a photo instead, drop `opengraph-image.jpg`
  into `app/` and delete that file.
