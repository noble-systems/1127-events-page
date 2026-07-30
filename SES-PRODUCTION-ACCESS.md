# SES production access: reply to case 178537942200980

Paste the section below into the AWS Support case. Every claim in it is true of
the deployed system as of 29 July 2026 and can be checked against the code or
the AWS console. Do not add claims that are not in here; if AWS asks something
this does not cover, check the code rather than guessing.

If any of the volume figures stop being accurate, correct them before sending.

---

## Reply to paste

Thank you for the follow-up. Details below.

**Verified identity**

We have a verified domain identity, `1127.events`, in us-west-2. DKIM is enabled
and shows a status of SUCCESS with signing active. We also use a custom MAIL
FROM domain, `mail.1127.events`, which is verified with its own MX and SPF
records so that SPF aligns with the From address. We send only from
`hello@1127.events` on that verified domain.

**What we send, and what triggers it**

We are an event-production company in Scottsdale, Arizona. Every message we send
is transactional and is triggered by an action the recipient took on our own
website, `https://1127.events`. There are three kinds:

1. A confirmation to somebody who submits our RSVP form asking to hear about
   upcoming event dates.
2. An acknowledgement to somebody who submits an application to work with us, or
   a partnership enquiry, confirming we received it.
3. Internal notifications to our own staff at our own domain.

We do not send newsletters, campaigns, or bulk marketing. We have never
purchased, rented, scraped or imported a recipient list, and we have no
mechanism to load one: the only way an address enters our system is a person
typing it into a form on our site.

**Volume**

Very low. Our current 24-hour figure is around 30, and nearly all of that is our
own pre-launch testing. Realistically we expect on the order of a few hundred
messages per month once the site is public, driven by however many people sign
up. We are not asking for a high sending rate, only the ability to confirm
signups to recipients outside our own domain.

**How recipient lists are maintained**

Each record stores, at the moment of signup: the timestamp, the IP address, the
user agent, the page the form was submitted from, and the version identifier of
the terms and privacy policy the person agreed to. Every form has a required,
never pre-ticked agreement checkbox. That gives us per-recipient evidence of
consent rather than a list we have to vouch for in the abstract.

The forms are protected by a hidden honeypot field, server-side validation, and
a sliding-window rate limit stored in DynamoDB, so a script cannot inject large
numbers of addresses.

**How we handle unsubscribes**

Every message that goes to a member of the public carries a one-click
unsubscribe link, signed with an HMAC so it cannot be forged into a request to
remove somebody else. We also set the `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers, per RFC 8058, so
Gmail and Outlook show their own native unsubscribe control.

Following that link does not merely flag the record: it deletes every record we
hold for that address, across all form types, immediately and without requiring
a confirmation step or a login.

Staff can also mark somebody as unsubscribed in our dashboard, for example when
a person asks in person. That status suppresses all further mail to them at the
application layer, before any call to SES.

**How we handle bounces and complaints**

Our SES configuration set `1127-events-email` has suppression enabled for both
BOUNCE and COMPLAINT, and account-level suppression is enabled for the same two
reasons. Reputation metrics are enabled on the configuration set. Addresses that
hard bounce or generate a complaint are therefore suppressed automatically and
we do not attempt to send to them again.

We monitor the SES Send, Bounce and Complaint CloudWatch metrics. Our current
enforcement status is HEALTHY.

**Sample message**

This is the exact plain-text part of the confirmation somebody receives after
using our RSVP form. The HTML part carries identical wording.

    Subject: You're on the Sun Club list

    Thanks Alex, you're on the Sun Club list.

    We'll email you as soon as the next date is set, before it goes public.
    Nothing else, and never more than we'd want to receive ourselves.

    Date: Dates Announcing Soon
    Location: Old Town Scottsdale, Arizona
    Venue: Announcing soon
    Music: House

    https://1127.events

    1127 Events, 6850 E McDowell Rd #4400, Scottsdale, AZ 85257
    Unsubscribe: https://1127.events/unsubscribe?token=<signed token>

The physical postal address appears in the footer of every message, and the
unsubscribe link is present in both the HTML and plain-text parts as well as in
the headers.

We would be glad to provide any further detail that would help.

---

## Facts behind each claim, for whoever maintains this

| Claim in the reply                     | Where to verify                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Domain verified, DKIM SUCCESS          | `aws sesv2 get-email-identity --email-identity 1127.events`                  |
| Custom MAIL FROM verified              | Same command, `MailFromAttributes.MailFromDomainStatus`                      |
| Suppression on BOUNCE and COMPLAINT    | `aws sesv2 get-configuration-set --configuration-set-name 1127-events-email` |
| Account suppression, HEALTHY           | `aws sesv2 get-account`                                                      |
| Consent timestamp, IP, UA, policy ver. | `lib/store/index.ts` `recordSubmission`, `lib/request-meta.ts`               |
| Required, never pre-ticked checkbox    | `components/forms/Fields.tsx` `CheckboxField`, `TermsCheckbox`               |
| Honeypot and validation                | `components/forms/Fields.tsx` `Honeypot`, `lib/validation.ts`                |
| Sliding-window rate limit              | `lib/rate-limit.ts`                                                          |
| Signed one-click unsubscribe           | `lib/tokens.ts`, `app/api/unsubscribe/route.ts`                              |
| Unsubscribe deletes all records        | `app/api/unsubscribe/route.ts`                                               |
| List-Unsubscribe headers               | `lib/email.ts` `send()`                                                      |
| Staff suppression status               | `lib/email.ts` `mayEmail()`                                                  |
| Postal address in every footer         | `lib/email.ts` `postalLine()`                                                |

## If it is denied again

Do not resubmit the same text. Read the new response and answer the specific
point raised. The most common remaining objections are:

- **Wanting a live signup page to inspect.** The RSVP form is public at
  `https://1127.events/rsvp`; point them at it directly.
- **Wanting a higher-volume justification.** We are not asking for volume, only
  for the sandbox restriction to be lifted. Say so plainly.
- **Wanting proof of double opt-in.** We do not currently send a confirm-your-
  address email before adding somebody to the list. If AWS insists on it, that
  is a real change to build rather than something to claim.
