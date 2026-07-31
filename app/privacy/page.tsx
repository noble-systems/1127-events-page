import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { contact } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What 1127 Events collects through this website, why, who processes it, and how to get it removed.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Every statement here is checked against the code. If you change what the app
 * collects, stores, or sends, change this page in the same commit.
 */
const contactRoute = contact.email
  ? `email ${contact.email}`
  : "use the contact details in the site footer";

const sections: readonly LegalSection[] = [
  {
    heading: "Who is responsible",
    body: [
      `1127 Events, an event-production company at ${contact.postalAddress?.replace(/^1127 Events, /, "") ?? "Scottsdale, Arizona"}, decides what is collected on this site and why. In data-protection terms we are the controller.`,
      `To ask anything about this policy, or to exercise any of the rights below, ${contactRoute}.`,
    ],
  },
  {
    heading: "What you give us",
    body: [
      "This site has four forms: the RSVP list, the talent application, the ambassador application, and the partnership inquiry. We keep what you type into them.",
    ],
    list: [
      "Your name",
      "Your email address",
      "Your phone number, if you choose to provide it",
      "The role you applied for, on the talent application",
      "Your social handle or links, on the talent and ambassador applications",
      "Your community, on the ambassador application",
      "Your company or organization, on the partnership form",
      "Anything you write in the message field",
    ],
  },
  {
    heading: "What we record automatically",
    body: [
      "When you submit a form we also record technical details of that request. They let us tell a real signup from an automated one, and tell us which campaign or link brought you here. None of this is collected while you are simply reading the site.",
    ],
    list: [
      "Your IP address",
      "Your browser, operating system and device type, worked out from the information your browser sends with every request",
      "The page you submitted the form from, including any campaign tags in the link you followed",
      "The site that referred you, if any",
      "The country your request came from, as reported by our content network",
    ],
  },
  {
    heading: "What you agreed to, and when",
    body: [
      "Every form carries a tick box confirming you accept the terms and this policy. It is never pre-ticked. We store which version of these documents was live at the time, alongside the timestamp, so it is always clear what you actually agreed to.",
      "The phone field on every form is optional, and giving us a number is how you opt in to event text messages. The wording next to the field says so before you submit, and it is the same wording registered with the mobile carriers. Leave the field blank and we will not text you.",
      "Text messages are never a condition of applying or of joining the list. You can stop them at any time by replying STOP to any message, which takes effect at the carrier rather than waiting on us.",
    ],
  },
  {
    heading: "Why we are allowed to hold it",
    body: [
      "Marketing email goes only to people who asked for it by joining the RSVP list. That is consent, and you can withdraw it at any time using the unsubscribe link in any email.",
      "Applications and partnership inquiries are handled because you asked us to consider them, which is a step taken at your request before any agreement.",
      "The technical details of a submission are kept because we have a genuine interest in keeping the forms free of spam and in understanding which of our campaigns work. We think that interest is reasonable and does not override your rights, and you can object to it.",
    ],
  },
  {
    heading: "Who else touches it",
    body: [
      "We keep the number of third parties as close to zero as we can. Today there is one, and it is our infrastructure provider rather than a marketing company.",
      "Amazon Web Services hosts this site and stores the data on our behalf, in the United States. Records live in Amazon DynamoDB, staff sign-in runs on Amazon Cognito, the site is served through AWS Amplify and CloudFront, and confirmation emails are sent through Amazon Simple Email Service. AWS acts on our instructions and does not use your information for its own purposes.",
      "We do not sell, rent, share or trade your information, and we do not disclose it for anyone else's advertising. We would hand something over if the law required it, and we would tell you unless we were forbidden from doing so.",
    ],
  },
  {
    heading: "Cookies and tracking",
    body: [
      "This site sets two cookies, both first party: one remembers your cookie choice, and one keeps a signed-in team member authenticated in the dashboard. There are no advertising cookies, no analytics cookies, and no third-party scripts.",
      "We do not track you across other websites, and there is nothing here to respond to a Do Not Track or Global Privacy Control signal, because there is no cross-site tracking to switch off. The cookie policy lists each cookie individually.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "RSVP records stay on the list until you unsubscribe or ask to be removed. Applications and partnership inquiries are kept while they are useful for planning events and considering people for future dates, and are reviewed periodically so that stale records are deleted.",
      "When you unsubscribe, every record we hold for that email address is deleted, not just flagged.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Wherever you live, you can ask us to do any of the following, and we will not treat you differently for asking.",
    ],
    list: [
      "Tell you what we hold about you and give you a copy",
      "Correct anything that is wrong",
      "Delete it",
      "Stop emailing you, which the unsubscribe link in any email does immediately",
      "Stop using it for a particular purpose, or object to our use of the technical details described above",
      "Provide it in a portable, machine-readable format",
    ],
  },
  {
    heading: "If you are in the UK or the EEA",
    body: [
      "The rights above mirror what UK and EU data-protection law gives you. Because our infrastructure is in the United States, information you send us is transferred there. You also have the right to complain to your national data-protection authority if you think we have handled something badly.",
    ],
  },
  {
    heading: "Security",
    body: [
      "The site is served over HTTPS. Records are stored in access-controlled AWS services, the dashboard requires an individual staff account with a password policy and optional multi-factor authentication, and the session cookie is HTTP-only. Form submissions are rate limited and screened for automated abuse.",
      "No system is perfectly secure, and we do not claim otherwise. If a breach affected your information we would notify you and the relevant authority as the law requires.",
    ],
  },
  {
    heading: "Children",
    body: [
      "This site is not directed at children and we do not knowingly collect information from anyone under 13. If you believe a child has given us their details, contact us and we will delete the record.",
      "Individual events may carry their own minimum age set by the venue.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "If this policy changes, the updated version is posted here with a new last-updated date at the top. Material changes to how we use your information will be notified to people on the list by email.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="29 July 2026"
      current="/privacy"
      intro="This page explains what this website collects, why, who else touches it, and how to get it removed. It is written to match the code rather than to sound impressive."
      sections={sections}
    />
  );
}
