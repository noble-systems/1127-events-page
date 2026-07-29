import { CONSENT_COOKIE } from "@/lib/consent";

/**
 * The actual cookie inventory. If a cookie is added to the app, it is added
 * here too, otherwise the policy is a lie.
 */
const COOKIES = [
  {
    name: CONSENT_COOKIE,
    category: "Strictly necessary",
    purpose: "Remembers your cookie choice so the banner stops asking.",
    duration: "6 months",
    party: "First party",
  },
  {
    name: "1127_admin",
    category: "Strictly necessary",
    purpose:
      "Keeps a signed-in 1127 team member authenticated in the admin dashboard. Only set after signing in.",
    duration: "8 hours",
    party: "First party",
  },
] as const;

export function CookieTable() {
  return (
    <div className="border-ink/12 bg-bone overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">
          Cookies set by the 1127 Events website
        </caption>
        <thead>
          <tr className="border-ink/12 border-b">
            {["Name", "Category", "Purpose", "Expires", "Set by"].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="label-xs text-ink/65 px-5 py-4"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COOKIES.map((cookie) => (
            <tr
              key={cookie.name}
              className="border-ink/8 border-b align-top last:border-b-0"
            >
              <td className="px-5 py-4 font-mono text-[0.8125rem] whitespace-nowrap">
                {cookie.name}
              </td>
              <td className="text-ink/70 px-5 py-4 text-[0.875rem]">
                {cookie.category}
              </td>
              <td className="text-ink/70 px-5 py-4 text-[0.875rem] leading-relaxed">
                {cookie.purpose}
              </td>
              <td className="text-ink/70 px-5 py-4 text-[0.875rem] whitespace-nowrap">
                {cookie.duration}
              </td>
              <td className="text-ink/70 px-5 py-4 text-[0.875rem] whitespace-nowrap">
                {cookie.party}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
