-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "adminDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerStatus" "AvailabilityStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "adminDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerStatus" "AvailabilityStatus" NOT NULL DEFAULT 'ACTIVE';
