import { afterEach, describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "@driftlock/be/src/secrets";

const KEY = "0".repeat(63) + "1";

afterEach(() => {
    delete process.env.SESSION_ENC_KEY;
});

describe("access-token encryption", () => {
    test("round-trips when a key is configured", () => {
        process.env.SESSION_ENC_KEY = KEY;
        const blob = encryptSecret("gho_live_token");
        expect(blob.startsWith("v1.")).toBe(true);
        expect(blob).not.toContain("gho_live_token");
        expect(decryptSecret(blob)).toBe("gho_live_token");
    });

    test("ciphertexts differ per encryption (random IV)", () => {
        process.env.SESSION_ENC_KEY = KEY;
        expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
    });

    test("legacy plaintext passes through untouched", () => {
        process.env.SESSION_ENC_KEY = KEY;
        expect(decryptSecret("gho_plaintext")).toBe("gho_plaintext");
    });

    test("keyless dev stores plaintext", () => {
        expect(encryptSecret("gho_dev")).toBe("gho_dev");
    });

    test("malformed key fails loudly", () => {
        process.env.SESSION_ENC_KEY = "too-short";
        expect(() => encryptSecret("x")).toThrow("64 hex chars");
    });

    test("wrong key fails closed", () => {
        process.env.SESSION_ENC_KEY = KEY;
        const blob = encryptSecret("gho_live_token");
        process.env.SESSION_ENC_KEY = "2".repeat(64);
        expect(() => decryptSecret(blob)).toThrow();
    });

    test("tampered blob fails closed", () => {
        process.env.SESSION_ENC_KEY = KEY;
        const blob = encryptSecret("gho_live_token");
        const tampered = blob.slice(0, -2) + (blob.endsWith("AA") ? "BB" : "AA");
        expect(() => decryptSecret(tampered)).toThrow();
    });
});
