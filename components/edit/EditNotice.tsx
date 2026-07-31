"use client";

import Link from "next/link";
import { useEdit } from "./EditContext";

/**
 * Says why a block cannot be edited here.
 *
 * Renders nothing outside the live editor. Inside it, a region with no editable
 * text is ambiguous: you cannot tell "nothing here is editable" from "you have
 * not found the right thing to click yet". This says which, and where the
 * content actually comes from.
 *
 * The copy lives in this file rather than arriving as children. A client
 * component's props are serialised into the payload the public page ships even
 * when it renders null, so passing the prose in put two sentences of admin
 * guidance on the live homepage. A short key does not.
 */
const NOTICES = {
  hero: {
    text: "The name, tagline, date and photograph above come from whichever event is Featured, so they change there. Everything else here you can click.",
    href: "/admin/events",
    link: "Edit events",
  },
  heroFromEvent: {
    text: "Everything in this hero comes from the featured event, this paragraph included. Change it on the event.",
    href: "/admin/events",
    link: "Edit events",
  },
  seriesPhoto: {
    text: "This photograph comes from the featured event, so it is changed there rather than here.",
    href: "/admin/events",
    link: "Edit events",
  },
} as const;

export function EditNotice({ kind }: { kind: keyof typeof NOTICES }) {
  const edit = useEdit();
  if (!edit) return null;

  const notice = NOTICES[kind];

  return (
    <div
      data-edit-control=""
      className="border-sun/40 bg-ink/80 text-bone/90 mt-6 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border px-4 py-2 text-[0.8125rem] backdrop-blur-sm"
    >
      <span>{notice.text}</span>
      <Link href={notice.href} className="text-sun underline underline-offset-4">
        {notice.link}
      </Link>
    </div>
  );
}
