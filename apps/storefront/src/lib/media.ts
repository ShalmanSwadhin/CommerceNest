/**
 * Requests an appropriately-sized, auto-format/quality Cloudinary
 * derivative from an already-uploaded image URL, by inserting a
 * transformation segment right after `/image/upload/` — Cloudinary's
 * standard on-the-fly transformation mechanism. No new upload, no backend
 * change, no storage-accounting impact (byte accounting is done at upload
 * time against the original — see media.service.ts). Safe no-op for any
 * URL that isn't a Cloudinary delivery URL: returns it unchanged, so a
 * placeholder or third-party image is never broken.
 */
export function cloudinaryThumb(
  url: string | undefined | null,
  width: number,
): string | undefined {
  if (!url) return undefined;
  const marker = '/image/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}w_${width},c_limit,q_auto,f_auto/${url.slice(insertAt)}`;
}
