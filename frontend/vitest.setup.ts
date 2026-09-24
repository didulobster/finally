import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** jsdom has no matchMedia; default to a wide (desktop) viewport. Tests can override `matches`. */
export const media = { matches: false };
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: media.matches,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

afterEach(() => {
  cleanup();
  media.matches = false;
});
