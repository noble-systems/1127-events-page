import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight } from "next/font/google";
import { CookieConsent } from "@/components/CookieConsent";
import { brand } from "@/content/site";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const sans = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const title = "1127 Events | Curated event concepts in Scottsdale, Arizona";
const description =
  "1127 Events is an Arizona event-production company. We create and produce curated event concepts in Old Town Scottsdale, and bring the audience, marketing, media and technical production behind every date.";

export const metadata: Metadata = {
  metadataBase: new URL(brand.domain),
  title: {
    default: title,
    template: "%s, 1127 Events",
  },
  description,
  applicationName: brand.name,
  keywords: [
    "1127 Events",
    "Old Town Scottsdale events",
    "Scottsdale house music",
    "Arizona event production",
    "Scottsdale pool party",
    "Phoenix DJs",
    "venue partnerships Scottsdale",
  ],
  authors: [{ name: brand.name }],
  creator: brand.name,
  publisher: brand.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: brand.domain,
    siteName: brand.name,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "events",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e9" },
    { media: "(prefers-color-scheme: dark)", color: "#07142f" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="bg-ink text-bone sr-only rounded-full px-5 py-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
        >
          Skip to content
        </a>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
