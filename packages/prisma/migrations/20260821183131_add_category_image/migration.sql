-- AlterEnum
ALTER TYPE "MediaUsageType" ADD VALUE 'CATEGORY_IMAGE';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "imageUrl" TEXT;
