import { PrismaClient, type Prisma } from "@prisma/client";

/* Reuse one client across dev hot reloads so connections aren't leaked. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** The client or an open transaction — helpers accept either. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** True for a unique-constraint violation (Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
