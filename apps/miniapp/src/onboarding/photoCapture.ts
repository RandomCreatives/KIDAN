// Reads a selected verification photo and downscales it to a bounded JPEG data
// URL before upload. The photo is private (admin verification only); we never
// display it in discovery and never persist it in the public draft.

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

export interface PhotoCaptureResult {
  dataUrl: string;
}

/**
 * Downscale the image so the longest edge is at most MAX_DIMENSION, then
 * encode as JPEG. Returns a data URL.
 *
 * We deliberately do NOT gate on `file.type`: inside Telegram's in-app WebView,
 * iOS photos frequently arrive as HEIC or with an empty MIME type, and the
 * platform image decoder still renders them. The canvas re-encodes everything
 * to JPEG, normalising the format. A file that genuinely cannot be decoded
 * (not an image, or corrupt) fires `onerror` and is rejected.
 */
export function fileToVerificationPhotoDataUrl(file: File): Promise<PhotoCaptureResult> {
  return new Promise((resolve, reject) => {
    // Only fast-reject obvious non-images (e.g. a PDF with a declared type).
    // Empty/unknown MIME types are allowed through to decode — they are common
    // for camera captures inside the Telegram WebView.
    if (file.type && !file.type.startsWith("image/")) {
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
        // Flatten transparency to white (JPEG has no alpha channel).
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
          throw new Error("ENCODE_FAILED");
        }
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
