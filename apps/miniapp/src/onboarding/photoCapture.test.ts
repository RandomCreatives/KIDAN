import { afterEach, describe, expect, it, vi } from "vitest";
import { fileToVerificationPhotoDataUrl } from "./photoCapture";

/** A fake image whose src assignment deterministically fails to decode. */
function installFailingImage(): void {
  class FakeImage {
    width = 0;
    height = 0;
    set src(_value: string) {
      // Simulate a file the browser cannot decode (corrupt / unsupported).
      queueMicrotask(() => this.onerror?.(new Event("error")));
    }
    onerror: ((event: Event) => void) | null = null;
    onload: (() => void) | null = null;
  }
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:fake", revokeObjectURL: () => undefined });
}

describe("fileToVerificationPhotoDataUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an obvious non-image file (e.g. a PDF)", async () => {
    const file = new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });
    await expect(fileToVerificationPhotoDataUrl(file)).rejects.toThrow("UNSUPPORTED_TYPE");
  });

  it("does not reject an image purely on its MIME type — empty types proceed to decode", async () => {
    installFailingImage();
    // Empty MIME type (common for camera captures inside the Telegram WebView)
    // must not be fast-rejected as an unsupported type; it reaches the decoder,
    // which in this simulation cannot decode and rejects DECODE_FAILED.
    const file = new File(["bytes"], "photo.heic", { type: "" });
    await expect(fileToVerificationPhotoDataUrl(file)).rejects.toThrow("DECODE_FAILED");
  });
});
