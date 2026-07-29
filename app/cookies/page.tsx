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
      "Two cookies, both first-party. One remembers the choice you made about cookies. The other only exists if you are a member of the 1127 team signed in to the dashboard.",
      "There are no advertising cookies, no analytics cookies, and no third-party scripts on this site today. Nothing here follows you to other websites.",
    ],
  },
  {
    heading: "What a cookie is here",
    body: [
      "A cookie is a small piece of text your browser stores for a site and sends back on later visits. First-party means it was set by this site rather than by someone else embedded in it.",
      "We also record technical details of the request when you submit a form, such as your IP address and browser. That is not done with cookies, and it is described in the privacy policy.",
    ],
  },
  {
    heading: "Categories",
    body: [
      "Strictly necessary cookies keep the site working and cannot be switched off. Cookies of this kind are generally treated as exempt from consent requirements because the service cannot be provided without them, which is why the banner does not pretend to offer a choice it is not really offering.",
      "Analytics and marketing are listed because they are the categories we would use if we added measurement or retargeting for paid social campaigns. Both are switched off, and nothing is loaded unless you turn them on.",
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
