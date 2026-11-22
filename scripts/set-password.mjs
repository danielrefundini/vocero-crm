#!/usr/bin/env node
/**
 * Sets a new password for an existing account, straight in the database.
 * For when the owner is locked out: this CRM doesn't send email, so there's
 * no "forgot password" flow.
 *
 *   pnpm set-password                   # asks for the email
 *   pnpm set-password you@example.com
 *
 * The new password is typed in the terminal (hidden) and never printed. It's
 * hashed with Better Auth's own hasher, so the normal sign-in accepts it, and
 * every open session of that account is signed out.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

const MIN_LENGTH = 8;

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const m = /^DATABASE_URL=(.*)$/m.exec(env);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env here
  }
  console.error("DATABASE_URL not found. Run this from the project folder (where .env is).");
  process.exit(1);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    })
  );
}

/** Reads a line without echoing it. */
function askHidden(question) {
  return new Promise((done, fail) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      fail(new Error("Run this in an interactive terminal so the password can be typed hidden."));
      return;
    }
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          done(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const sql = postgres(databaseUrl(), { max: 1 });

try {
  let email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    const users = await sql`select email from "user" order by created_at`;
    if (users.length === 0) {
      console.log("There are no accounts yet. Create the first one at /register.");
      process.exit(0);
    }
    console.log("Accounts:");
    for (const u of users) console.log(`  - ${u.email}`);
    email = (await ask("Email of the account: ")).toLowerCase();
  }

  const [user] = await sql`select id, email from "user" where lower(email) = ${email}`;
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }

  const password = await askHidden(`New password (min. ${MIN_LENGTH} characters): `);
  if (password.length < MIN_LENGTH) {
    console.error(`Too short: it needs at least ${MIN_LENGTH} characters. Nothing changed.`);
    process.exit(1);
  }
  const again = await askHidden("Type it again: ");
  if (again !== password) {
    console.error("The two passwords don't match. Nothing changed.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const updated = await sql`
    update account set password = ${hash}, updated_at = now()
    where user_id = ${user.id} and provider_id = 'credential'
    returning id`;
  if (updated.length === 0) {
    console.error("This account has no email/password login to change. Nothing changed.");
    process.exit(1);
  }
  const ended = await sql`delete from session where user_id = ${user.id} returning id`;
  console.log(
    `Password changed for ${user.email}. ` +
      `${ended.length} open session(s) signed out. Sign in at /login with the new password.`
  );
} finally {
  await sql.end();
}
