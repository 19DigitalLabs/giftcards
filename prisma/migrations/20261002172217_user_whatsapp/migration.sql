-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3);
