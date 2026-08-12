/**
 * Shrinks an image in the browser before it is uploaded.
 *
 * The site was measured serving its hero from a ~1MB phone-camera original,
 * and one 12.6MB photograph made it into the bucket before this existed. The
 * optimizer downstream re-encodes whatever it is given ON DEMAND, so every
 * megabyte in the source is paid again in encode time on each cold variant.
 * Shrinking at the door caps that cost at its origin, using the canvas the
 * browser already has; no dependency, no server work.
 *
 * Photographs re-encode as JPEG at 0.85 within 2560px, which is the largest
 * width the site ever serves. Logos stay PNG (transparency survives) and only
 * downscale. Anything small, already-modern (webp/avif), unparseable, or that
 * would come out LARGER passes through untouched: shrinking is an
 * optimisation, never a gate an upload can fail.
 */

const PHOTO_EDGE = 2560;
const LOGO_EDGE = 1600;
const SKIP_BELOW = 300 * 1024;
const JPEG_QUALITY = 0.85;

export async function shrinkImage(
  file: File,
  kind: "hero" | "logo" = "hero",
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!/^image\/(jpeg|png)$/.test(file.type)) return file;
  if (file.size < SKIP_BELOW) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = kind === "logo" ? LOGO_EDGE : PHOTO_EDGE;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, type === "image/jpeg" ? JPEG_QUALITY : undefined),
    );

    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type });
  } catch {
    return file;
  }
}
