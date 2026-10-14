import { describe, expect, it } from "vitest";
import { isMovementInputMessage, isPingMessage, isWorldStateMessage } from "../src/messages.js";

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

describe("isMovementInputMessage", () => {
  it("accepts directional booleans", () => {
    expect(isMovementInputMessage({ up: false, down: true, left: false, right: false })).toBe(true);
  });

  it("rejects incomplete or non-boolean input", () => {
    expect(isMovementInputMessage({ up: true, down: false, left: false })).toBe(false);
    expect(isMovementInputMessage({ up: 1, down: false, left: false, right: false })).toBe(false);
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