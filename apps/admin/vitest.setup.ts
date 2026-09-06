import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
});
