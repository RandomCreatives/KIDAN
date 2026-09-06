// Reads a selected verification photo and downscales it to a bounded JPEG data
// URL before upload. The photo is private (admin verification only); we never
// display it in discovery and never persist it in the public draft.

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PhotoCaptureResult {
  dataUrl: string;
}

/**
 * Downscale the image so the longest edge is at most MAX_DIMENSION, then
 * encode as JPEG. Returns a data URL. Throws if the file is not a supported
 * image or cannot be decoded.
 */
export function fileToVerificationPhotoDataUrl(file: File): Promise<PhotoCaptureResult> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      reject(new Error("UNSUPPORTED_TYPE"));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("NO_CONTEXT");
        context.drawImage(image, 0, 0, width, height);
        // JPEG keeps the payload small; transparency is flattened to white.
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        URL.revokeObjectURL(url);
        resolve({ dataUrl });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error instanceof Error ? error : new Error("ENCODE_FAILED"));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("DECODE_FAILED"));
    };
    image.src = url;
  });
}
