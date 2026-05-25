import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretHint } from "./crypto";

describe("secret encryption", () => {
  it("round-trips a secret", () => {
    const plain = "jb_live_abcdef0123456789";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails to decrypt tampered payloads", () => {
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("masks a secret without revealing it", () => {
    expect(secretHint("jb_live_abcdef0123456789")).toBe("••••6789");
  });
});
