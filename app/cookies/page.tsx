import type { Metadata } from "next";
import { CookieTable } from "@/components/CookieTable";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { contact } from "@/content/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Every cookie 1127 Events sets, what it does, and how to change your choice.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
};

const sections: readonly LegalSection[] = [
  {
    heading: "The short version",
    body: [
      "Two cookies exist by default, both first-party. One remembers the choice you made about cookies. The other only exists if you are a member of the 1127 team signed in to the dashboard.",
      "One optional third party: with your consent under Marketing, the Meta (Facebook/Instagram) Pixel loads and sets its own cookies so we can tell whether our ads led to a visit or a ticket. Say no, or say nothing, and it never loads; nothing else here follows you to other websites. We count page views in aggregate on our own servers, and that counting sets no cookies at all.",
    ],
  },
  {
    heading: "What a cookie is here",
    body: [
      "A cookie is a small piece of text your browser stores for a site and sends back on later visits. First-party means it was set by this site rather than by someone else embedded in it.",
      "We also record technical details of the request when you submit a form, such as your IP address and browser. That is not done with cookies, and it is described in the privacy policy.",
      "One more thing in the same spirit of saying everything: if you arrive through an ambassador's share link, their code rides in the address and in this tab's temporary storage so they get credit if you sign up or buy. It is not a cookie, it is never sent anywhere on its own, it identifies the ambassador rather than you, and it disappears when the tab closes.",
    ],
  },
  {
    heading: "Categories",
    body: [
      "Strictly necessary cookies keep the site working and cannot be switched off. Cookies of this kind are generally treated as exempt from consent requirements because the service cannot be provided without them, which is why the banner does not pretend to offer a choice it is not really offering.",
      "Marketing covers the Meta Pixel, which measures our paid social advertising and can be used for retargeting; it loads only after you turn the category on, and turning it off again tells it to stop. Analytics is listed for the future; today our measurement is cookieless and the category loads nothing.",
    ],
  },
  {
    heading: "Changing your mind",
    body: [
      "Use the cookie preferences link in the footer of any page. Your choice is stored for six months, after which the banner asks again. Clearing your browser's cookies also resets it.",
      "If we add a new category, the stored version number stops matching and you will be asked again rather than having an old answer applied to something new.",
    ],
  },
  {
    heading: "Blocking cookies yourself",
    body: [
      "Every major browser lets you block or delete cookies in its settings. Blocking the strictly necessary cookie will stop the admin dashboard from keeping you signed in. Nothing else on the site will break.",
      `If anything here is unclear, ask us at ${contact.email ?? "the address in the site footer"}.`,
    ],
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie policy"
      updated="29 July 2026"
      current="/cookies"
      intro="This page lists every cookie this website sets. It is short because the list is short."
      sections={sections}
    >
      <div className="mt-12">
        <h2 className="text-2xl leading-tight">Every cookie we set</h2>
        <div className="mt-5">
          <CookieTable />
        </div>
      </div>
    </LegalPage>
  );
}
