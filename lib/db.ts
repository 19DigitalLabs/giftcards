import { PrismaClient } from "@prisma/client";

/* Reuse one client across dev hot reloads so SQLite isn't opened repeatedly. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
