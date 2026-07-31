import type { Metadata } from "next";
import Link from "next/link";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { CONTENT_GROUPS } from "@/lib/content-schema";
import { defaultContent, readPath } from "@/lib/site-content";
import { getContentOverrides } from "@/lib/store";

export const metadata: Metadata = { title: "Page content" };

// Always read the current overrides rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const overrides = await getContentOverrides();

  // The committed values, flattened to the same dot-path shape as the
  // overrides, so the editor can show each one as a placeholder. Passing the
  // whole content object instead would ship far more than the editor needs.
  const content = defaultContent();
  const defaults: Record<string, unknown> = {};
  for (const group of CONTENT_GROUPS) {
    for (const field of group.fields) {
      defaults[field.key] = readPath(content, field.key);
    }
  }

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl">Page content</h1>
        <p className="text-ink/70 mt-3 text-[0.9375rem] leading-relaxed">
          Edit the homepage without a deploy. Every field falls back to the wording
          committed in the repo, so clearing a box restores the standard copy rather
          than leaving a blank section. Photographs upload straight to S3 and
          replace wherever that image appears.
        </p>

        <p className="mt-5">
          <Link
            href="/admin/preview"
            className="bg-ink text-bone inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] transition-opacity duration-200 hover:opacity-90"
          >
            Edit on the page
          </Link>
        </p>
        <p className="text-ink/65 mt-2.5 text-[0.8125rem] leading-relaxed">
          Opens the homepage with these fields beside it, updating as you type.
          The form below does the same thing without the preview.
        </p>
      </header>

      <div className="mt-10">
        <ContentEditor initialOverrides={overrides} defaults={defaults} />
      </div>
    </div>
  );
}
