import { describe, expect, it } from "vitest";

import {
  ZWIRK_FIELD_MAX_CHARS,
  ZWIRK_MAX_MESSAGES,
  ZWIRK_MESSAGE_MAX_CHARS,
  capTextField,
  sanitizeZwirkInput,
} from "./input-limits";

const msg = (content: string, role: "user" | "assistant" = "user") => ({ role, content });

describe("sanitizeZwirkInput", () => {
  it("rejects a body with no usable messages", () => {
    expect(sanitizeZwirkInput({ messages: [] })).toMatchObject({ ok: false, status: 400 });
    expect(sanitizeZwirkInput({ messages: [{ role: "user", content: 42 }] })).toMatchObject({ ok: false, status: 400 });
    expect(sanitizeZwirkInput(null)).toMatchObject({ ok: false, status: 400 });
  });

  it("caps each message and keeps only the most recent ones", () => {
    const messages = Array.from({ length: 20 }, (_, i) => msg(`m${i} ` + "x".repeat(10)));
    messages[19] = msg("y".repeat(5_000));
    const result = sanitizeZwirkInput({ messages });
    if (!result.ok) throw new Error("expected ok");
    expect(result.input.messages).toHaveLength(ZWIRK_MAX_MESSAGES);
    expect(result.input.messages[0].content.startsWith("m8 ")).toBe(true);
    expect(result.input.messages.at(-1)!.content).toHaveLength(ZWIRK_MESSAGE_MAX_CHARS);
  });

  it("caps string and object context fields to 4,000 chars", () => {
    const result = sanitizeZwirkInput({
      messages: [msg("hi")],
      context: "c".repeat(10_000),
      adSpyContext: { ads: "a".repeat(10_000) },
      competitorContext: 123,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.input.context).toHaveLength(ZWIRK_FIELD_MAX_CHARS);
    expect(result.input.adSpyContext).toHaveLength(ZWIRK_FIELD_MAX_CHARS);
    expect(result.input.competitorContext).toBeUndefined();
  });

  it("drops an oversized entityContext but keeps a small one", () => {
    const big = sanitizeZwirkInput({ messages: [msg("hi")], entityContext: { blob: "z".repeat(5_000) } });
    const small = sanitizeZwirkInput({ messages: [msg("hi")], entityContext: { name: "Kapiva" } });
    if (!big.ok || !small.ok) throw new Error("expected ok");
    expect(big.input.entityContext).toBeNull();
    expect(small.input.entityContext).toEqual({ name: "Kapiva" });
  });

  it("rejects with 413 when the combined input is over 30,000 chars", () => {
    const messages = Array.from({ length: 12 }, () => msg("q".repeat(2_000)));
    const result = sanitizeZwirkInput({
      messages,
      context: "c".repeat(4_000),
      adSpyContext: "a".repeat(4_000),
    });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});

describe("capTextField", () => {
  it("returns undefined for missing or unsupported values", () => {
    expect(capTextField(undefined)).toBeUndefined();
    expect(capTextField(null)).toBeUndefined();
    expect(capTextField(5)).toBeUndefined();
  });
});
