# Legal review notes

**This is not legal advice and it is not a legal review.** It was written by the
engineer who built the site, not a lawyer. What it does is two things a lawyer
cannot do as cheaply:

1. Check whether the three published documents **accurately describe what the
   code actually does**. That is a factual audit, and it is where policies
   usually go wrong.
2. List the **decisions only you or your counsel can make**, so the eventual
   review is a short conversation rather than a discovery exercise.

Give this document to whoever reviews the pages. It is ordered so the blocking
items come first.

Last updated 29 July 2026, against the code as of that date.

---

## 1. Blocking before launch

> **Status:** 1.1 and 1.3 are closed. 1.2 is open and is now the most
> significant legal question on the project: text consent is carried by
> entering a phone number rather than by a tick box.

### 1.1 Contact address: RESOLVED

`contact.email` is set to **hello@1127.events**. The footer renders it as a real
link, and the privacy, cookie and terms pages each name it directly rather than
sending people hunting for it. The blocking alert is gone.

**Remaining operational note, not a blocker.** Privacy requests now arrive in a
general inbox. Two things worth deciding:

- Someone has to own that inbox for access and deletion requests. If a request
  sits unanswered, the response deadlines in most privacy regimes still run.
- If volume grows, a dedicated `privacy@` alias forwarding to the same place
  keeps those requests from being lost among booking enquiries. Cheap to add
  later; the policies read from one config value.

### 1.2 Decide whether you are texting people

All four forms collect an optional phone number.

In the United States, sending **marketing** texts generally requires prior
express _written_ consent, and the rules are enforced through private lawsuits
with statutory damages per message. Operational texts to people who gave you a
number for that purpose sit differently from promotional blasts.

**The consent model changed on 29 July 2026, at the client's direction, and this
is the item most needing a lawyer's eye.**

The separate tick box is gone. **Entering a phone number is now the opt-in.**
The instruction was that anyone who gives a number should be reachable about new
and upcoming dates.

What that means in practice, and what was built around it:

- The phone field stays optional on all four forms.
- A disclosure sits directly beneath every phone field, on screen before submit,
  inside the same form. It is not fine print: 13px, same visual weight as the
  consent rows. Verified rendering on all four forms in a real browser.
- The consent is **derived on the server** from the number itself, never taken
  from the submitted payload. A crafted request cannot claim an opt-in that was
  never given, nor strip one that was. Both directions are tested.
- The wording is one constant, `smsProgram.disclosure` in `content/site.ts`, so
  the site and the carrier registration cannot drift apart.

The disclosure reads:

> Adding your number opts you in to text messages from 1127 Events about new and
> upcoming dates. Message frequency varies. Message and data rates may apply.
> Reply STOP to cancel or HELP for help. Texts are not a condition of entry, so
> leave this blank if you would rather not get them.

**The risk this model carries, stated plainly.** A tick box is the strong form of
consent evidence: it is an affirmative act aimed at one question. This is the
weaker form. It relies on the disclosure being clear, conspicuous and adjacent to
the submit action, with submitting as the act of agreement. That pattern is
recognised and widely used, and the engineering here is built to support it, but
it is a step down from a box and it should be a decision made with eyes open
rather than absorbed by accident.

Two specific exposures worth pricing:

- **"New and upcoming dates" is promotional content**, not operational. US rules
  on marketing texts are enforced through private suits with statutory damages
  per message, so the gap between a defensible flow and an indefensible one is
  measured in real money.
- **A2P 10DLC vetting reviews the opt-in flow.** Carriers ask for a screenshot.
  A flow with no tick box gets more scrutiny than one with. If the campaign is
  rejected, the disclosure is the first thing to revisit, and reinstating a box
  is a small change: `SmsDisclosure` in `components/forms/Fields.tsx` and the
  derivation in `smsConsentFrom` are the only two places that would move.

**Still for counsel and for you:**

- Confirm the wording matches what you will actually send. It covers event
  dates. It does not cover sponsor promotions, and stretching it later is the
  thing that causes trouble.
- Ask counsel specifically whether they are comfortable with number-entry as
  consent for promotional texts in Arizona, or whether they want the box back.
- A2P registration asks for the opt-in URL and sample messages. Those are
  `/rsvp` and the confirmation text in `lib/sms.ts`. Keep them in step.
- Nothing calls the date-announcement helper yet, so no promotional text can go
  out by accident. Wiring it up is a deliberate act.

### 1.3 CAN-SPAM basics: RESOLVED

Federal law governing commercial email requires, among other things, a valid
physical postal address in the message and a working opt-out honoured promptly.

- Unsubscribe: **built and working**, one click, removes every record for that
  address, plus `List-Unsubscribe` headers so Gmail and Outlook show their own
  one-click button.
- Physical postal address: **set** to
  1127 Events, 6850 E McDowell Rd #4400, Scottsdale, AZ 85257.
  It renders in the footer of every email, and identifies the operator in the
  privacy policy and the terms.

**Spelling confirmed** by the client on 29 July 2026 as **McDowell Rd**.

Also confirm whether **1127 Events** is the registered entity name. If the legal
entity is an LLC under a different name, that name belongs alongside this
address in the terms.

---

## 2. Questions that change what the documents need to say

These are genuinely open. The answers materially change the drafting, so please
answer them before anyone spends time redlining.

| Question                                                 | Why it matters                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do you market to, or expect signups from, the UK or EEA? | Determines whether UK/EU data-protection law applies at all. If you are purely Arizona-facing, the current "If you are in the UK or the EEA" section can be simplified or removed. If you do, you may need a lawful transfer mechanism for US storage, and possibly a representative. |
| Do you expect to hit California's thresholds?            | State privacy statutes generally bite at revenue or volume thresholds a new events company will not meet. If you do not meet them, several sections can be shortened. If you might, the notice-at-collection and rights machinery needs to be firmer.                                 |
| What is the minimum age to attend an event?              | The terms currently say 16 to submit a form and defer to the venue for attendance. If the events serve alcohol, counsel may want a higher age at the point of collection, or a clearer statement.                                                                                     |
| Do you want arbitration and a class-action waiver?       | A common choice for consumer-facing US terms and a deliberate one. The terms currently say Arizona courts, with no arbitration clause.                                                                                                                                                |
| Is "1127 Events" the legal entity name?                  | The documents name it as the operator. If the registered entity is an LLC with a different name, that name belongs in the terms.                                                                                                                                                      |
| Do you want a monetary liability cap?                    | The liability clause excludes indirect loss but sets no cap.                                                                                                                                                                                                                          |

---

## 3. Factual accuracy audit

Every claim in the three documents was checked against the code. Findings:

### Corrected in this pass

| Was                                                                                                      | Problem                                                                                                                       | Now                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| No mention of AWS                                                                                        | The privacy policy listed no processors at all, while DynamoDB, Cognito, SES, Amplify and CloudFront all handle personal data | Named, with what each one does                                        |
| No storage location                                                                                      | US storage undisclosed, which is the fact that matters for any international transfer question                                | States United States                                                  |
| No legal basis                                                                                           | Consent, pre-contract steps and legitimate interests were all in use but none were stated                                     | Stated per purpose                                                    |
| No enumerated rights                                                                                     | Rights were implied but not listed                                                                                            | Listed, with no-retaliation wording                                   |
| "Until you ask to be removed"                                                                            | Too vague to function as a retention statement                                                                                | Split by record type, with review criteria                            |
| No security statement                                                                                    | HTTPS, access control, MFA, HTTP-only cookies, rate limiting all existed but were undisclosed                                 | Described                                                             |
| No children's statement                                                                                  | Nothing addressed under-13s                                                                                                   | Added, with deletion route                                            |
| Terms had no eligibility, force majeure, indemnity, severability, entire-agreement or assignment clauses | Standard omissions                                                                                                            | Added                                                                 |
| Cookie policy asserted "Under UK and EU rules they do not require consent"                               | A flat legal conclusion stated in our own voice                                                                               | Softened to describe the general treatment rather than assert the law |
| No "we do not sell" statement                                                                            | Increasingly expected even where not strictly required                                                                        | Added, covering sale, sharing and cross-context advertising           |

### Verified accurate

- The cookie table lists **exactly** the two cookies the app sets. I checked
  `document.cookie` in a real browser session: nothing else appears.
- "No third-party scripts" is true. There are no external `<script>` tags, no
  analytics, no pixels, and fonts are self-hosted so there are no runtime
  requests to Google.
- The automatic-collection list matches `lib/request-meta.ts` field for field.
- "Every email carries a one-click unsubscribe" is true and tested, including
  the `List-Unsubscribe` headers.
- "Unsubscribe deletes every record for that address" is true: the handler
  deletes across all submission types, not just the RSVP row.
- The four-forms statement matches the four form types in `lib/validation.ts`.

### Added since the first pass

- **Consent is now captured and evidenced.** Every form requires an unticked
  agreement box; the accepted document version is stored per submission
  alongside the timestamp, IP and user agent. Email and SMS opt-ins are separate
  optional boxes, recorded individually and included in the CSV export.
- **RSVP statuses were nonsense and are fixed.** The dashboard previously
  offered Reviewing, Contacted, Accepted and Declined on mailing-list records.
  RSVPs now use Subscribed, Unsubscribed and Bounced; the review pipeline
  applies only to applications and inquiries. The API rejects a status that does
  not belong to the record's type.

### Known gap not yet fixed

- **Internal notes.** Staff can write free-text notes on a person's record.
  Those notes are personal data about that person and would be disclosable in a
  subject access request. The privacy policy does not currently mention them.
  I have not added it because the right answer depends on how you intend to use
  the field. Flag for counsel.

---

## 4. Things the site does well already

Worth knowing so nobody spends money re-deriving them:

- **Data minimisation.** The RSVP collects name, email and optional phone. There
  is no group-size field, no date of birth, no address.
- **No dark patterns in the consent banner.** "Essential only" and "Accept all"
  are equally prominent, non-essential categories default to off, and nothing is
  loaded before a choice.
- **Consent versioning.** Adding a cookie category invalidates stored consents
  so people are asked again rather than having an old answer reused. Tested.
- **Deletion is real deletion**, not a soft flag.
- **Retention of consent evidence.** Submissions store timestamp, IP, user agent
  and campaign, which is the evidence you would want if a signup were ever
  disputed.

---

## 5. Where each statement lives in the code

For whoever has to keep these in step:

| Document                            | File                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| Privacy policy                      | `app/privacy/page.tsx`                                     |
| Cookie policy                       | `app/cookies/page.tsx`                                     |
| Cookie inventory table              | `components/CookieTable.tsx`                               |
| Terms and conditions                | `app/terms/page.tsx`                                       |
| Shared page shell and review notice | `components/LegalPage.tsx`                                 |
| What is actually collected          | `lib/types.ts`, `lib/request-meta.ts`, `lib/validation.ts` |
| What is actually emailed            | `lib/email.ts`                                             |
| Cookies actually set                | `lib/consent.ts`, `lib/auth.ts`                            |

**Rule for the team:** if a commit changes what is collected, stored or sent, it
changes the relevant page in the same commit. The pages are only trustworthy for
as long as that holds.

## Ticket sales (added Aug 2026; processor is Square)

8. **Refund policy.** Tickets are sold with no stated refund policy. One
   needs to exist and be linked from the tickets page and the terms before
   real sales open. What is it: no refunds, refunds until doors, weather?
9. **Arizona TPT on admissions.** Ticket revenue for events in Scottsdale
   may be subject to state and city transaction privilege tax. Square's tax settings
   can apply this if counsel says it applies; today prices are flat and
   tax-silent.
10. **Terms coverage.** The existing terms page predates paid sales. It
    should say what a ticket buys, that codes admit one person each, and
    what happens if an event is cancelled or rescheduled.
