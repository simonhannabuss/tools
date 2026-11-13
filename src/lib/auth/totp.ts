import { authenticator } from "otplib";
import { randomBytes } from "node:crypto";
import { sha256 } from "../crypto";

authenticator.options = { window: 1, step: 30, digits: 6 }; // allow ±30s clock drift

export const ISSUER = "Simon's Tools";

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(username: string, secret: string): string {
  return authenticator.keyuri(username, ISSUER, secret);
}

export function verifyTotp(secret: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return authenticator.verify({ token: clean, secret });
}

/** 10 one-time backup codes like "k3f9-2mqp". Only hashes are stored. */
export function newBackupCodes(count = 10): { plain: string[]; hashes: string[] } {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const plain = Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
  return { plain, hashes: plain.map(hashBackupCode) };
}

export function hashBackupCode(code: string): string {
  return sha256(code.trim().toLowerCase());
}
