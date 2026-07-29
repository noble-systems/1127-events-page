import Link from "next/link";
import { SeedButton } from "@/components/admin/SeedButton";
import { emailStatus } from "@/lib/email";
import { smsStatus } from "@/lib/sms";
import { listAllEvents, listSubmissions, storeKind } from "@/lib/store";

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group border-ink/12 bg-bone hover:border-ink/30 block rounded-2xl border p-6 transition-colors duration-300"
    >
      {/* Two-line box so a wrapping label doesn't push its number out of
          alignment with the other cards. */}
      <p className="label-xs text-ink/65 flex min-h-[2.4em] items-start">{label}</p>
      <p className="font-display mt-3 text-4xl leading-none">{value}</p>
      <p className="text-ink/65 mt-3 text-[0.8125rem] leading-relaxed">{hint}</p>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const [events, submissions] = await Promise.all([
    listAllEvents(),
    listSubmissions(),
  ]);

  const rsvps = submissions.filter((row) => row.type === "rsvp");
  const ambassadors = submissions.filter((row) => row.type === "ambassador");
  const partners = submissions.filter((row) => row.type === "partner");
  const live = events.filter((event) => event.published);

  const recent = rsvps.slice(0, 6);
  const kind = storeKind();
  const email = emailStatus();
  const sms = smsStatus();

  return (
    <>
      <h1 className="text-4xl leading-tight">Overview</h1>
      <p className="text-ink/65 mt-2.5 text-[0.9375rem]">
        Everything 1127 is running right now.
      </p>

      {kind === "local" ? (
        <p className="border-terracotta/45 bg-terracotta/[0.06] text-ink/80 mt-6 rounded-xl border border-dashed px-4 py-3.5 text-[0.875rem] leading-relaxed">
          <strong className="font-medium">Local data.</strong> No DynamoDB tables
          are configured, so everything here is being read from and written to{" "}
          <code>.data/</code> on this machine. Set <code>EVENTS_TABLE</code> and{" "}
          <code>SUBMISSIONS_TABLE</code> to use the real tables.
        </p>
      ) : null}

      <div
        className={`mt-6 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3.5 text-[0.875rem] leading-relaxed ${
          email.guest
            ? "border-ink/15 bg-bone/70 text-ink/75"
            : "border-terracotta/45 bg-terracotta/[0.06] text-ink/80 border-dashed"
        }`}
      >
        <span
          className={`label-xs mt-0.5 shrink-0 rounded-full px-2.5 py-1 ${
            email.guest
              ? "bg-cobalt/12 text-cobalt"
              : "bg-terracotta/15 text-terracotta-deep"
          }`}
        >
          {email.guest ? "RSVP email on" : "RSVP email off"}
        </span>
        <span className="min-w-0 flex-1">
          {email.detail}
          {email.guest ? null : (
            <>
              {" "}
              Setup steps are in <strong className="font-medium">
                DEPLOY.md
              </strong>{" "}
              under &ldquo;RSVP email&rdquo;.
            </>
          )}
        </span>
      </div>

      <div
        className={`mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3.5 text-[0.875rem] leading-relaxed ${
          sms.enabled
            ? "border-ink/15 bg-bone/70 text-ink/75"
            : "border-ink/15 bg-bone/50 text-ink/65"
        }`}
      >
        <span
          className={`label-xs mt-0.5 shrink-0 rounded-full px-2.5 py-1 ${
            sms.enabled ? "bg-cobalt/12 text-cobalt" : "bg-ink/[0.06] text-ink/65"
          }`}
        >
          {sms.enabled ? "Texts on" : "Texts off"}
        </span>
        <span className="min-w-0 flex-1">{sms.detail}</span>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="RSVP list"
          value={rsvps.length}
          hint="Unique email addresses on the Sun Club list"
          href="/admin/list"
        />
        <Stat
          label="Ambassador applications"
          value={ambassadors.length}
          hint="Submitted through the ambassador form"
          href="/admin/list"
        />
        <Stat
          label="Partner inquiries"
          value={partners.length}
          hint="Venues, brands, artists, vendors and press"
          href="/admin/list"
        />
        <Stat
          label="Events"
          value={`${live.length} / ${events.length}`}
          hint="Published on the site, of all events"
          href="/admin/events"
        />
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl">Latest RSVPs</h2>
            <Link
              href="/admin/list"
              className="text-cobalt text-[0.875rem] underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="border-ink/25 bg-bone/60 text-ink/65 mt-5 rounded-2xl border border-dashed px-6 py-10 text-center text-[0.9375rem]">
              No signups yet. Share{" "}
              <Link
                href="/rsvp"
                className="text-cobalt underline-offset-4 hover:underline"
              >
                /rsvp
              </Link>{" "}
              to start collecting.
            </p>
          ) : (
            <ul className="divide-ink/10 border-ink/12 bg-bone mt-5 divide-y overflow-hidden rounded-2xl border">
              {recent.map((row) => (
                <li
                  key={row.pk}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4"
                >
                  <span className="text-[0.9375rem] font-medium">
                    {row.name || row.email}
                  </span>
                  <span className="text-ink/65 text-[0.875rem]">{row.email}</span>
                  <span className="text-ink/65 text-[0.8125rem] whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl">Quick actions</h2>
          <div className="mt-5 space-y-3">
            <Link
              href="/admin/events/new"
              className="border-ink/12 bg-bone hover:border-ink/30 block rounded-2xl border px-5 py-4 transition-colors duration-300"
            >
              <span className="block text-[0.9375rem] font-medium">
                Create an event
              </span>
              <span className="text-ink/65 mt-1 block text-[0.8125rem]">
                Add a new 1127 concept
              </span>
            </Link>
            {/* A file download, not a route, next/link would intercept it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/admin/subscribers?type=rsvp&format=csv"
              className="border-ink/12 bg-bone hover:border-ink/30 block rounded-2xl border px-5 py-4 transition-colors duration-300"
            >
              <span className="block text-[0.9375rem] font-medium">
                Export the RSVP list
              </span>
              <span className="text-ink/65 mt-1 block text-[0.8125rem]">
                CSV for your email platform
              </span>
            </a>
            <a
              href="/api/admin/email-preview?type=guest"
              target="_blank"
              rel="noreferrer"
              className="border-ink/12 bg-bone hover:border-ink/30 block rounded-2xl border px-5 py-4 transition-colors duration-300"
            >
              <span className="block text-[0.9375rem] font-medium">
                Preview the RSVP email
              </span>
              <span className="text-ink/65 mt-1 block text-[0.8125rem]">
                What guests receive, nothing is sent
              </span>
            </a>

            {events.length === 0 ? (
              <div className="border-ink/25 bg-bone/60 rounded-2xl border border-dashed px-5 py-4">
                <p className="text-[0.9375rem] font-medium">
                  Start from the launch content
                </p>
                <p className="text-ink/65 mt-1 text-[0.8125rem] leading-relaxed">
                  Loads Sun Club and the in-development card so you can edit rather
                  than start blank.
                </p>
                <div className="mt-4">
                  <SeedButton />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
