import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Missing TOKEN_ENCRYPTION_KEY.");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptToken(value: string | null | undefined) {
  if (!value || !value.startsWith(PREFIX)) return value ?? null;
  const [ivText, tagText, ciphertextText] = value.slice(PREFIX.length).split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
