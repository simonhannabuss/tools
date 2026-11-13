import { createInterface } from "node:readline";

export function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

/** Reads a line without echoing it (for passwords). */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a);
    });
    muted = true;
  });
}

export async function newPassword(): Promise<string> {
  const { checkPasswordStrength } = await import("../src/lib/auth/password");
  for (;;) {
    const a = await askHidden("New password: ");
    const problem = checkPasswordStrength(a);
    if (problem) {
      console.log(problem);
      continue;
    }
    const b = await askHidden("Repeat password: ");
    if (a === b) return a;
    console.log("Passwords didn't match, try again.");
  }
}
