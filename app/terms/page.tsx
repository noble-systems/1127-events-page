import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { contact } from "@/content/site";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms governing use of the 1127 Events website.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

const sections: readonly LegalSection[] = [
  {
    heading: "Who you are dealing with",
    body: [
      `This website is operated by 1127 Events, an event-production company at ${contact.postalAddress?.replace(/^1127 Events, /, "") ?? "Scottsdale, Arizona"}. Where these terms say we, us or 1127, that is who is meant.`,
      "By using the site or submitting one of its forms, you agree to what is on this page. If you do not, please do not use it.",
    ],
  },
  {
    heading: "Who may use this site",
    body: [
      "You must be at least 16 to submit a form on this site, and you must give us your own details rather than someone else's.",
      "Individual events carry their own minimum age, set by the venue hosting them. Meeting the age requirement to join a mailing list is not the same as meeting the age requirement to attend.",
    ],
  },
  {
    heading: "Using the site",
    body: [
      "You may browse the site and submit its forms for their intended purpose. You may not attempt to break into it, disrupt it, scrape it at scale, submit someone else's details, or use it to send unlawful, abusive or misleading content.",
      "Automated submissions are blocked where we can detect them, and repeated submissions from the same source are rate limited.",
    ],
  },
  {
    heading: "Event information is subject to change",
    body: [
      "Dates, lineups, venues, capacities and event details on this site may change or be cancelled. Where a date has not been confirmed, the site says so rather than estimating one.",
      "Nothing on this site is a ticket, an admission guarantee, or a binding offer of any kind.",
    ],
  },
  {
    heading: "RSVPs",
    body: [
      "The RSVP list registers your interest and gets you the announcement first. It is for individuals: one person, one signup. It does not reserve a place, guarantee entry, or create any obligation on either side.",
      "Admission on the day is at the discretion of 1127 and of the venue hosting the event, and is subject to capacity, age requirements, and the venue's own conditions of entry.",
    ],
  },
  {
    heading: "Applications and inquiries",
    body: [
      "Talent and ambassador applications are reviewed and accepted at our discretion. Submitting one is not an offer of work, and we make no promise to reply to every application or to reply within any particular time.",
      "Any actual booking, engagement or ambassador arrangement is governed by a separate written agreement. Nothing said on this site or in an acknowledgement email creates one.",
      "Partnership inquiries are an invitation to talk. A working relationship with a venue, brand or vendor exists only once a separate contract is signed.",
    ],
  },
  {
    heading: "What you send us",
    body: [
      "You keep ownership of anything you submit. By sending it you give us permission to store it, read it, and use it to assess and respond to your submission.",
      "Please only send material you have the right to send, and do not put confidential information in a form field.",
    ],
  },
  {
    heading: "Photography and filming at events",
    body: [
      "1127 events are photographed and filmed for promotional use by 1127 and by our venue partners. Attending an event may mean appearing in that coverage.",
      "If you would prefer not to appear, tell a member of the team on site and we will do our best to accommodate it.",
    ],
  },
  {
    heading: "Our content",
    body: [
      "The 1127 Events and Sun Club names, together with the text, design, photography and code on this site, belong to 1127 Events or are used with permission. You may share links freely. Please do not reproduce the material commercially without asking first.",
    ],
  },
  {
    heading: "Third-party links",
    body: [
      "Where this site links out, we are not responsible for the content or the practices of the site you land on.",
    ],
  },
  {
    heading: "Availability and liability",
    body: [
      "The site is provided as-is and as-available. We do not promise it will always be reachable or error free, and we may change or withdraw any part of it.",
      "To the fullest extent the law allows, 1127 Events is not liable for indirect or consequential loss arising from your use of this website. Nothing in these terms limits liability for anything that cannot lawfully be limited, including death or personal injury caused by negligence, or fraud.",
    ],
  },
  {
    heading: "Events we cannot control",
    body: [
      "An event may be delayed, cut short, moved or cancelled for reasons outside our reasonable control, including weather, a venue becoming unavailable, an artist withdrawing, power or equipment failure, illness, or action by a public authority. Where that happens we will say so as early as we can.",
      "Because the RSVP list is free and reserves nothing, cancellation does not create a refund or a claim.",
    ],
  },
  {
    heading: "Your responsibility to us",
    body: [
      "If you use this site in breach of these terms and that causes us a loss or a claim from someone else, you agree to cover the reasonable cost of it. This does not apply to anything caused by our own breach or negligence.",
    ],
  },
  {
    heading: "Governing law",
    body: [
      "These terms are governed by the laws of the State of Arizona, United States, and any dispute is subject to the courts of that state.",
    ],
  },
  {
    heading: "The rest of the agreement",
    body: [
      "If a court finds any part of these terms unenforceable, the rest continues to apply. If we do not enforce something straight away, we have not given up the right to enforce it later.",
      "These terms, together with the privacy policy and the cookie policy, are the whole agreement between you and us about this website. We may transfer our rights and obligations under them if the business is reorganised or sold; your rights are not affected.",
    ],
  },
  {
    heading: "Changes and contact",
    body: [
      "We may update these terms. The current version always lives on this page, with its last-updated date at the top. Continuing to use the site after a change means you accept the updated version.",
      `Questions about these terms can go to ${contact.email ?? "the contact details in the site footer"}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and conditions"
      updated="29 July 2026"
      current="/terms"
      intro="These terms cover the use of the 1127 Events website and the forms on it. Attending an event is separately governed by the rules of the venue hosting it."
      sections={sections}
    />
  );
}
