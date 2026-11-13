/**
 * Sets up (or replaces) the authenticator app and issues 10 new backup codes.
 * Run on the server: docker compose exec web npm run user:setup-2fa
 */
import { eq } from "drizzle-orm";
import qrcode from "qrcode-terminal";
import { db, schema } from "../src/db";
import { encrypt } from "../src/lib/crypto";
import { newBackupCodes, newTotpSecret, totpUri, verifyTotp } from "../src/lib/auth/totp";
import { ask } from "./_prompt";

const [user] = await db.select().from(schema.users).limit(1);
if (!user) {
  console.log("No user yet. Run user:create first.");
  process.exit(1);
}

const secret = newTotpSecret();
const uri = totpUri(user.username, secret);
console.log("\nScan this with your authenticator app (Google Authenticator, 1Password, Authy…):\n");
qrcode.generate(uri, { small: true });
console.log(`\nOr enter this key manually: ${secret}\n`);

for (let tries = 0; ; tries++) {
  const code = await ask("Enter the 6-digit code it shows: ");
  if (verifyTotp(secret, code)) break;
  if (tries >= 2) {
    console.log("Codes didn't match. Check the phone's clock is set automatically, then run this again.");
    process.exit(1);
  }
  console.log("Not quite — try the next code.");
}

const { plain, hashes } = newBackupCodes();
await db.transaction(async (tx) => {
  await tx.update(schema.users).set({ totpSecretEnc: encrypt(secret), totpEnabledAt: new Date() }).where(eq(schema.users.id, user.id));
  await tx.delete(schema.backupCodes).where(eq(schema.backupCodes.userId, user.id));
  await tx.insert(schema.backupCodes).values(hashes.map((codeHash) => ({ userId: user.id, codeHash })));
  await tx.insert(schema.securityEvents).values({ userId: user.id, type: "2fa_setup", ip: "server" });
});

console.log("\n✓ Two-factor is on. Your backup codes (each works once) — save them somewhere safe now:\n");
for (const c of plain) console.log("   " + c);
console.log("\nThey won't be shown again. Running this command again replaces the app and the codes.");
process.exit(0);
