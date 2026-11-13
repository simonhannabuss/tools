/** Sets a new password and signs out every device. Run on the server: docker compose exec web npm run user:reset-password */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/auth/password";
import { newPassword } from "./_prompt";

const [user] = await db.select().from(schema.users).limit(1);
if (!user) {
  console.log("No user yet. Run user:create first.");
  process.exit(1);
}
console.log(`Resetting password for ${user.username}`);
const password = await newPassword();
await db
  .update(schema.users)
  .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
  .where(eq(schema.users.id, user.id));
await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
await db.insert(schema.securityEvents).values({ userId: user.id, type: "password_reset", ip: "server" });
console.log("✓ Password changed. All devices signed out.");
process.exit(0);
