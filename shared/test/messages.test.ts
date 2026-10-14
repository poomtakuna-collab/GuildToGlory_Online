import { describe, expect, it } from "vitest";
import { isPingMessage } from "../src/messages.js";

describe("isPingMessage", () => {
  it("accepts a finite client timestamp", () => {
    expect(isPingMessage({ sentAt: 123 })).toBe(true);
  });

  it.each([null, {}, { sentAt: "123" }, { sentAt: Number.NaN }, { sentAt: Infinity }])(
    "rejects an invalid ping payload: %o",
    (value) => {
      expect(isPingMessage(value)).toBe(false);
    }
  );
});