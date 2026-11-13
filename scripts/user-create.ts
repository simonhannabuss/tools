/** Creates the one login. Run on the server: docker compose exec web npm run user:create */
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/auth/password";
import { ask, newPassword } from "./_prompt";

const existing = await db.select().from(schema.users);
if (existing.length) {
  console.log(`A user already exists (${existing[0].username}). Use user:reset-password instead.`);
  process.exit(1);
}

const username = (await ask("Username: ")).toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.log("Use 3–32 letters, numbers, dots, dashes or underscores.");
  process.exit(1);
}
const password = await newPassword();
await db.insert(schema.users).values({ username, passwordHash: await hashPassword(password) });
console.log(`\n✓ Created ${username}. Next: npm run user:setup-2fa`);
process.exit(0);
