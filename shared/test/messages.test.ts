import { describe, expect, it } from "vitest";
import { isPingMessage, isWorldDestinationMessage, isWorldStateMessage } from "../src/messages.js";

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

describe("isWorldDestinationMessage", () => {
  it("accepts integer grid coordinates", () => {
    expect(isWorldDestinationMessage({ column: 4, row: 7 })).toBe(true);
  });

  it("rejects incomplete or fractional coordinates", () => {
    expect(isWorldDestinationMessage({ column: 4 })).toBe(false);
    expect(isWorldDestinationMessage({ column: 4.5, row: 7 })).toBe(false);
  });
});

describe("isWorldStateMessage", () => {
  it("accepts a list of positioned players", () => {
    expect(isWorldStateMessage({ players: [{ id: "a", name: "Adventurer 1", color: 123, x: 10, y: 20 }] })).toBe(true);
  });

  it("rejects malformed positions", () => {
    expect(isWorldStateMessage({ players: [{ id: "a", name: "Adventurer 1", color: 123, x: NaN, y: 20 }] })).toBe(false);
    expect(isWorldStateMessage({ players: "invalid" })).toBe(false);
  });
});