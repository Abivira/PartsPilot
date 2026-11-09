-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "customerEmail" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "mpn" TEXT,
ADD COLUMN     "name" TEXT;
