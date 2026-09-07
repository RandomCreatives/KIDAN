// Reads a selected verification photo and downscales it to a bounded JPEG data
// URL before upload. The photo is private (admin verification only); we never
// display it in discovery and never persist it in the public draft.

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;
// Server caps the data URL at 5,000,000 characters, and Vercel's serverless
// request body limit is ~4.5 MB total. The raw-upload fallback must stay well
// under both (allowing for JSON envelope overhead), so bound it conservatively.
const MAX_DATA_URL_LENGTH = 3_300_000;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface PhotoCaptureResult {
  dataUrl: string;
}

/**
 * Produces an uploadable data URL for the chosen photo.
 *
 * Primary path: decode the image, downscale to max 1280px, re-encode as JPEG
 * (normalising HEIC/PNG/WebP and shrinking large files). We do NOT gate on
 * `file.type` for decoding — iOS/Telegram WebViews often report HEIC or an
 * empty MIME that the platform decoder still renders.
 *
 * Fallback: if the embedded WebView cannot decode/encode via canvas (seen on
 * some desktop WebViews), and the original is already a supported,
 * size-bounded image, read it directly and upload as-is. The server validates
 * the type and size regardless.
 */
export function fileToVerificationPhotoDataUrl(file: File): Promise<PhotoCaptureResult> {
  return new Promise((resolve, reject) => {
    if (file.type && !file.type.startsWith("image/")) {
      reject(new Error("UNSUPPORTED_TYPE"));
      return;
    }

    const fail = (code: string) => reject(new Error(code));

    const uploadOriginal = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        const supportedType =
          SUPPORTED_TYPES.includes(file.type as (typeof SUPPORTED_TYPES)[number])
          || /^data:image\/(jpeg|png|webp);base64,/.test(dataUrl);
        if (!supportedType) {
          fail("UNSUPPORTED_TYPE");
        } else if (dataUrl.length > MAX_DATA_URL_LENGTH) {
          fail("PHOTO_TOO_LARGE");
        } else {
          resolve({ dataUrl });
        }
      };
      reader.onerror = () => fail("READ_FAILED");
      reader.readAsDataURL(file);
    };

    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
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
        URL.revokeObjectURL(url);
        if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("ENCODE_FAILED");
        if (!settled) {
          settled = true;
          resolve({ dataUrl });
        }
      } catch {
        URL.revokeObjectURL(url);
        if (!settled) {
          settled = true;
          uploadOriginal();
        }
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      if (!settled) {
        settled = true;
        uploadOriginal();
      }
    };
    image.src = url;
  });
}
