// Client-side image resize/re-encode before a Documents upload — a phone
// camera photo of a receipt/warranty plate is routinely several MB at
// 3000-4000px wide, which is both slow to upload on a weak connection and
// needless: nobody needs to zoom past "can I read the serial number" on a
// warranty photo. No library — canvas can already decode, scale, and
// re-encode an image, same zero-dependency approach as this app's CSV/PDF
// exports.

// Long-edge cap and JPEG quality — chosen to keep receipt/warranty text
// legible while meaningfully shrinking a typical phone photo (a modern
// phone camera is 3000px+ on the long edge; 1600px is still sharp on any
// screen this app is viewed on, a phone or a laptop, and comfortably
// readable when zoomed). Not user-configurable — this app doesn't expose
// a quality knob anywhere else, and a sensible fixed default beats one
// more form field for something people want to just work.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// Below this, a photo's likely already a reasonable size (a saved
// screenshot, an already-compressed re-upload) — compressing it anyway
// just burns CPU and image quality for little to no size win, and a
// re-encode occasionally comes out *larger* than a small, already-
// efficient source image.
const SKIP_BELOW_BYTES = 300 * 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))), type, quality);
  });
}

// Returns the original `file` unchanged for anything this isn't worth
// compressing (not an image, already small, or — rare, but checked
// rather than assumed — the "compressed" result actually came out
// bigger). Otherwise returns a new File: same base name with a `.jpg`
// extension (the output is always re-encoded as JPEG, so a mismatched
// `.png` name holding JPEG bytes would be confusing in Drive later).
export async function maybeCompressImage(file) {
  if (!file.type.startsWith('image/') || file.size <= SKIP_BELOW_BYTES) return file;

  let bitmap;
  try {
    // imageOrientation: 'from-image' applies the photo's own EXIF
    // rotation during decode — without it, a portrait phone photo often
    // comes out sideways after re-encoding, since a canvas has no EXIF
    // tag of its own to carry that metadata forward.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // A format canvas can't decode (unlikely for anything a file picker
    // would hand back as image/*) — upload the original rather than fail
    // the whole save over a skippable optimization.
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY).catch(() => null);
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
}
