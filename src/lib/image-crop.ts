/**
 * Cropping a picked photo into the square an avatar needs, in the browser.
 *
 * Doing it here rather than on the server keeps a 6 MB phone photo off the
 * wire, keeps a native image library out of the deployment, and means the
 * bytes that reach storage are already the bytes that will be displayed.
 */

/**
 * The largest centred square that fits in an image. Portrait photos keep their
 * middle, which is where a face usually is; landscape ones keep their centre.
 */
export function squareCropRect(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  };
}

/** Formats a canvas can encode, best first. WebP is ~30% smaller than JPEG here. */
const ENCODINGS = [
  { type: 'image/webp', quality: 0.9 },
  { type: 'image/jpeg', quality: 0.9 },
] as const;

/**
 * Reads `file`, crops it to a centred square, scales it to at most
 * `dimension` pixels a side and re-encodes it. Never upscales: a 96px picture
 * stays 96px rather than being blown up into a blurry 512px one.
 */
export async function cropToSquareImage(file: File, dimension: number): Promise<File> {
  const { bitmap, release } = await loadBitmap(file);
  try {
    const crop = squareCropRect(bitmap.width, bitmap.height);
    const size = Math.min(crop.size, dimension);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the image');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);

    const encoded = await encode(canvas);
    return new File([encoded.blob], `avatar.${encoded.type === 'image/webp' ? 'webp' : 'jpg'}`, {
      type: encoded.type,
    });
  } finally {
    release();
  }
}

async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; type: string }> {
  for (const { type, quality } of ENCODINGS) {
    const blob = await toBlob(canvas, type, quality);
    // A canvas asked for a format it cannot encode silently returns a PNG.
    if (blob && blob.type === type) return { blob, type };
  }
  const png = await toBlob(canvas, 'image/png');
  if (!png) throw new Error('Could not prepare the image');
  return { blob: png, type: 'image/png' };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

type LoadedImage = { bitmap: CanvasImageSource & { width: number; height: number }; release: () => void };

async function loadBitmap(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { bitmap, release: () => bitmap.close() };
  }

  // Safari before 17 cannot make an ImageBitmap from a file. The object URL
  // has to outlive the draw, so it is revoked by the caller's `release`.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { bitmap: image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
