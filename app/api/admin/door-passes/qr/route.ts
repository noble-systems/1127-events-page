import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { getDoorPass } from "@/lib/door-store";
import { siteUrl } from "@/lib/email";

/**
 * GET /api/admin/door-passes/qr?id=<pass>  a PNG QR that signs a phone in.
 *
 * Encodes the GET login URL with the pass's PIN, so this sits behind the
 * admin session, unlike the ticket QRs: the picture IS the key. Not cached,
 * for the same reason.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const pass = id ? await getDoorPass(id) : null;
  if (!pass || !pass.active) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const png = await QRCode.toBuffer(
    `${siteUrl()}/api/door/login?pin=${encodeURIComponent(pass.pin)}`,
    { width: 480, margin: 1, errorCorrectionLevel: "M" },
  );

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
