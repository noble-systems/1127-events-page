import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The logo as a PNG for email, where inline SVG is stripped by every major
 * client. The source mark is black on transparent; email headers are the
 * deep navy band, so the fills are swapped to bone before rasterising.
 *
 * Cached hard: the bytes only change when the SVG in /public does, and the
 * email templates bump the ?v= query when that happens.
 */
export async function GET() {
  const svg = await readFile(
    path.join(process.cwd(), "public", "1127-basic.svg"),
    "utf8",
  );
  const bone = svg
    .replace(/stroke:\s*#000/g, "stroke: #f7f2e9")
    .replace(/<path /g, '<path fill="#f7f2e9" ');

  const sharp = (await import("sharp")).default;
  const png = await sharp(Buffer.from(bone), { density: 300 })
    .resize({ height: 128 })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
