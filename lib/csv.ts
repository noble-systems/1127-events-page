import { describeSource } from "./request-meta.ts";
import type { SubmissionRecord } from "./types.ts";

/**
 * CSV generation for the people export.
 *
 * Kept separate from the route handler so the escaping rules, the part that
 * actually breaks spreadsheets, can be unit tested.
 */

export const CSV_HEADER = [
  "Type",
  "Name",
  "Email",
  "Phone",
  "Role",
  "Social",
  "Community",
  "Company",
  "Inquiry type",
  "Message",
  "Status",
  "Notes",
  "Email opt-in",
  "SMS opt-in",
  "Terms version",
  "IP",
  "Device",
  "Browser",
  "Country",
  "Source",
  "Landing page",
  "First seen",
  "Last updated",
] as const;

/**
 * RFC 4180: wrap in quotes when the value contains a delimiter, quote or line
 * break, and double any embedded quotes.
 *
 * Values starting with =, +, - or @ are prefixed with a single quote so that
 * Excel and Sheets treat them as text rather than executing them as formulas
 * (CSV injection).
 */
export function csvCell(value: string | undefined | null): string {
  let text = value ?? "";

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function submissionsToCsv(rows: readonly SubmissionRecord[]): string {
  const lines = rows.map((row) =>
    [
      row.type,
      row.name,
      row.email,
      row.phone,
      row.role,
      row.social,
      row.community,
      row.company,
      row.inquiryType,
      row.message,
      row.status ?? "new",
      row.notes,
      row.marketingOptIn ? "yes" : "no",
      row.smsOptIn ? "yes" : "no",
      row.termsVersion,
      row.meta?.ip,
      row.meta?.device,
      row.meta?.browser,
      row.meta?.country,
      describeSource(row.meta),
      row.meta?.page,
      row.createdAt,
      row.updatedAt,
    ]
      .map(csvCell)
      .join(","),
  );

  // Leading BOM so Excel opens UTF-8 names correctly.
  return `﻿${[CSV_HEADER.join(","), ...lines].join("\r\n")}\r\n`;
}
