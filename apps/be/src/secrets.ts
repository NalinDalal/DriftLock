import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1";

let warnedMissingKey = false;

/**
 * 32-byte encryption key from SESSION_ENC_KEY (64 hex chars). Null when
 * unset (dev falls back to plaintext with a warning); throws when malformed
 * so a half-configured prod fails loudly instead of encrypting weakly.
 */
export function encryptionKey(): Buffer | null {
    const raw = (process.env.SESSION_ENC_KEY ?? "").trim();
    if (!raw) {
        if (!warnedMissingKey) {
            warnedMissingKey = true;
            console.warn(
                "[SECURITY] SESSION_ENC_KEY unset — secrets stored in plaintext. Set it in prod.",
            );
        }
        return null;
    }
    const key = Buffer.from(raw, "hex");
    if (key.length !== 32) {
        throw new Error("SESSION_ENC_KEY must be 64 hex chars (32 bytes)");
    }
    return key;
}

/** Encrypt to `v1.<iv>.<ciphertext>.<tag>` (base64url). Plaintext when keyless. */
export function encryptSecret(plaintext: string): string {
    const key = encryptionKey();
    if (!key) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const b64 = (b: Buffer) => b.toString("base64url");
    return `${PREFIX}.${b64(iv)}.${b64(ct)}.${b64(tag)}`;
}

/**
 * Decrypt a `v1.` blob. Anything else passes through untouched, so rows
 * written before encryption (or in keyless dev) keep working — migration
 * without a backfill.
 */
export function decryptSecret(blob: string): string {
    if (!blob.startsWith(`${PREFIX}.`)) return blob;
    const key = encryptionKey();
    if (!key) {
        throw new Error("SESSION_ENC_KEY required to decrypt stored secret");
    }
    const [, ivB64, ctB64, tagB64] = blob.split(".");
    if (!ivB64 || !ctB64 || !tagB64) {
        throw new Error("Malformed encrypted secret");
    }
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return decipher.update(Buffer.from(ctB64, "base64url"), undefined, "utf8") +
        decipher.final("utf8");
}
