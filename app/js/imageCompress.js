// Client-side image resize/re-encode for a Documents upload — a phone
// camera photo of a receipt/warranty plate is routinely several MB at
// 3000-4000px wide. No library — canvas can already decode, scale, and
// re-encode an image, same zero-dependency approach as this app's CSV/PDF
// exports.
//
// Rather than silently picking a size for you, this builds all three
// candidate files up front — Small/Medium/Large, each with its real
// resulting byte size — so openUploadDocumentSheet() can show them as
// options and let the person picking the photo see the actual size
// trade-off before choosing, instead of trusting a fixed default.

// Long-edge caps per option. "Large" is the original file, completely
// untouched — not re-encoded at a bigger size, since that could only ever
// make it bigger or throw away quality for no reason; it's the one option
// guaranteed to be exactly what was selected.
const SIZE_OPTIONS = [
  { key: 'small', label: 'Small', maxDimension: 800, quality: 0.7 },
  { key: 'medium', label: 'Medium', maxDimension: 1600, quality: 0.8 },
];

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))), type, quality);
  });
}

// Returns `null` for anything this doesn't apply to (not an image, or a
// format canvas can't decode) — the caller falls back to a plain upload
// with no size picker shown, same as before this existed. Otherwise
// returns `[{ key, label, file, size }, ...]` for 'small', 'medium', and
// 'large' in that order, 'medium' meant as the sensible pre-selected
// default (legible, meaningfully smaller than most camera photos).
export async function buildImageSizeOptions(file) {
  if (!file.type.startsWith('image/')) return null;

  let bitmap;
  try {
    // imageOrientation: 'from-image' applies the photo's own EXIF
    // rotation during decode — without it, a portrait phone photo often
    // comes out sideways after re-encoding, since a canvas has no EXIF
    // tag of its own to carry that metadata forward.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const variants = [];
  for (const opt of SIZE_OPTIONS) {
    const scale = Math.min(1, opt.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', opt.quality);
    const variantFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
    variants.push({ key: opt.key, label: opt.label, file: variantFile, size: variantFile.size });
  }
  bitmap.close();

  variants.push({ key: 'large', label: 'Large (original)', file, size: file.size });
  return variants;
}
