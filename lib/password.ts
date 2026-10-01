import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/*
 * Passwords are hashed (one-way), never encrypted: scrypt from node:crypto
 * with a per-user random salt, stored as "salt:hash" hex. The async scrypt
 * keeps the ~50ms of hashing off the event loop.
 */

const KEY_LENGTH = 64;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = await derive(password, salt);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same scrypt time as a real check, for logins with an unknown
 * email — so response timing doesn't reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummyHash);
  return false;
}

/** New-password policy. The 128 cap stops multi-MB "passwords" hogging scrypt. */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password needs at least one letter.")
  .regex(/\d/, "Password needs at least one number.");
