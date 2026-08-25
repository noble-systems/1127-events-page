import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/email";
import { extractTicketCode } from "@/lib/tickets";

/**
 * GET /api/ticket-qr/<code>  a PNG QR for one ticket, embedded in the ticket
 * email (Gmail strips data: URIs, so the image must live at a URL).
 *
 * Deliberately does NOT check the store: the QR is just a picture of the
 * code the email already contains, so rendering it reveals nothing, and a
 * store lookup would turn this public endpoint into a code-validity oracle.
 * Validity is judged in one place only: the door, at check-in.
 *
 * The QR encodes the door URL rather than the bare code, so a native camera
 * app (no scanner page open) still lands staff somewhere useful: the admin
 * door page with the code prefilled, behind the admin login.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = extractTicketCode(raw ?? "");
  if (!code) return NextResponse.json({ ok: false }, { status: 400 });

  const png = await QRCode.toBuffer(
    `${siteUrl()}/door?code=${encodeURIComponent(code)}`,
    { width: 480, margin: 1, errorCorrectionLevel: "M" },
  );

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // The code never changes, so neither does its picture.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
