-- CreateEnum
CREATE TYPE "ComponentCategory" AS ENUM ('MICROCONTROLLER', 'MOTOR_DRIVER', 'SENSOR', 'MOTOR', 'POWER_MODULE', 'CONNECTOR', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "CompatibilityTier" AS ENUM ('VERIFIED', 'POSSIBLE', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('INITIAL', 'ORDER_CREATED', 'CAPTURE_PENDING', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "mpn" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "category" "ComponentCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "specificationSource" TEXT NOT NULL,
    "specificationVerifiedAt" TIMESTAMP(3) NOT NULL,
    "datasheetUrl" TEXT,
    "isDemonstrationSample" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "stockReserved" INTEGER NOT NULL DEFAULT 0,
    "specs" JSONB NOT NULL,
    "supportedPlatforms" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticSession" (
    "id" TEXT NOT NULL,
    "userPrompt" TEXT,
    "targetHardwareContext" JSONB,
    "imageHash" TEXT,
    "aiRawResponse" JSONB NOT NULL,
    "aiIdentificationScore" DOUBLE PRECISION NOT NULL,
    "detectedMpn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticMatch" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "tier" "CompatibilityTier" NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "matchReport" JSONB NOT NULL,

    CONSTRAINT "DiagnosticMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "shippingAddress" JSONB,
    "guestTokenHash" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inventoryLeased" BOOLEAN NOT NULL DEFAULT false,
    "leaseExpiresAt" TIMESTAMP(3),
    "stockCommitted" BOOLEAN NOT NULL DEFAULT false,
    "diagnosticSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "createIdempotencyKey" TEXT NOT NULL,
    "captureIdempotencyKey" TEXT NOT NULL,
    "state" "PaymentState" NOT NULL DEFAULT 'INITIAL',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payerEmail" TEXT,
    "payerId" TEXT,
    "rawCaptureResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "paypalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Part_mpn_key" ON "Part"("mpn");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

-- CreateIndex
CREATE INDEX "Part_category_idx" ON "Part"("category");

-- CreateIndex
CREATE INDEX "Part_mpn_idx" ON "Part"("mpn");

-- CreateIndex
CREATE INDEX "DiagnosticMatch_sessionId_idx" ON "DiagnosticMatch"("sessionId");

-- CreateIndex
CREATE INDEX "DiagnosticMatch_partId_idx" ON "DiagnosticMatch"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestTokenHash_key" ON "Order"("guestTokenHash");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");

-- CreateIndex
CREATE INDEX "Order_status_leaseExpiresAt_idx" ON "Order"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_orderId_key" ON "PaymentRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paypalOrderId_key" ON "PaymentRecord"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paypalCaptureId_key" ON "PaymentRecord"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_createIdempotencyKey_key" ON "PaymentRecord"("createIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_captureIdempotencyKey_key" ON "PaymentRecord"("captureIdempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentRecord_paypalOrderId_idx" ON "PaymentRecord"("paypalOrderId");

-- CreateIndex
CREATE INDEX "PaymentRecord_paypalCaptureId_idx" ON "PaymentRecord"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_paypalEventId_key" ON "ProcessedWebhook"("paypalEventId");

-- AddForeignKey
ALTER TABLE "DiagnosticMatch" ADD CONSTRAINT "DiagnosticMatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticMatch" ADD CONSTRAINT "DiagnosticMatch_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_diagnosticSessionId_fkey" FOREIGN KEY ("diagnosticSessionId") REFERENCES "DiagnosticSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
