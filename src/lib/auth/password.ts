import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to Argon2id. These are OWASP-recommended minimums.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function checkPasswordStrength(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  return null;
}
