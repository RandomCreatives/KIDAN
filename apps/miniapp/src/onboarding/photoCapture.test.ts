import { afterEach, describe, expect, it, vi } from "vitest";
import { fileToVerificationPhotoDataUrl } from "./photoCapture";

/** Fake image whose src assignment deterministically fails to decode. */
function installFailingImage(): void {
  class FakeImage {
    onerror: ((event: Event) => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onerror?.(new Event("error")));
    }
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

  it("falls back to the original file when canvas decode fails, for a supported type", async () => {
    installFailingImage();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const file = new File([pngBytes], "photo.png", { type: "image/png" });
    const result = await fileToVerificationPhotoDataUrl(file);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects a non-image that also cannot be decoded in the WebView", async () => {
    installFailingImage();
    // Empty/unknown type that is genuinely not an image: not a supported type
    // even after the FileReader fallback.
    const file = new File(["bytes"], "photo.heic", { type: "" });
    await expect(fileToVerificationPhotoDataUrl(file)).rejects.toThrow("UNSUPPORTED_TYPE");
  });
});
