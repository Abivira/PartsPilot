import crypto from "crypto";
import { db } from "@/lib/db";
import { CartItemDto, CartResponse } from "@/types/cart";
import { OrderStatus, Part } from "@prisma/client";
import { BomEntry } from "@/types/bom";
import { CATALOG_FIXTURES } from "@/lib/catalog/fixtures";

// Memory fallback cart cache if Neon DB is offline
const memoryCarts = new Map<
  string,
  {
    id: string;
    orderNumber: string;
    items: Array<{
      id: string;
      partId: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
      mpn: string;
      name: string;
      part: Part;
    }>;
    updatedAt: Date;
  }
>();

export function hashGuestToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateGuestToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${rand}`;
}

function calculateFinancialTotals(items: Array<{ totalCents: number }>): {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
} {
  const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  // Business logic: Free shipping over $50 (5000 cents), otherwise flat $5.00 (500 cents)
  // (Zero shipping if cart is empty)
  const shippingCents = subtotalCents === 0 ? 0 : subtotalCents >= 5000 ? 0 : 500;
  // Estimated sales tax (0% for B2B export prototype)
  const taxCents = 0;
  const totalCents = subtotalCents + shippingCents + taxCents;

  return { subtotalCents, shippingCents, taxCents, totalCents };
}

/**
 * Retrieves or initializes an active DRAFT cart for the given guest token.
 */
export async function getOrCreateCart(
  guestToken?: string
): Promise<{ cart: CartResponse; guestToken: string; isNew: boolean }> {
  let isNew = false;
  let rawToken = guestToken?.trim();

  if (!rawToken || rawToken.length < 16) {
    rawToken = generateGuestToken();
    isNew = true;
  }

  const tokenHash = hashGuestToken(rawToken);

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      let draftOrder = await db.order.findUnique({
        where: { guestTokenHash: tokenHash },
        include: {
          items: {
            include: { part: true },
            orderBy: { id: "asc" },
          },
        },
      });

      if (!draftOrder) {
        const orderNum = generateOrderNumber();
        draftOrder = await db.order.create({
          data: {
            orderNumber: orderNum,
            status: OrderStatus.DRAFT,
            guestTokenHash: tokenHash,
            subtotalCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalCents: 0,
            currency: "USD",
          },
          include: {
            items: {
              include: { part: true },
            },
          },
        });
        isNew = true;
      } else if (
        draftOrder.status !== OrderStatus.DRAFT &&
        draftOrder.status !== OrderStatus.PENDING_PAYMENT
      ) {
        // If the previous order was already finalized (PAID / CANCELLED / EXPIRED),
        // generate a new guest token and new cart so we don't violate the unique constraint.
        rawToken = generateGuestToken();
        const newTokenHash = hashGuestToken(rawToken);
        isNew = true;
        const orderNum = generateOrderNumber();
        draftOrder = await db.order.create({
          data: {
            orderNumber: orderNum,
            status: OrderStatus.DRAFT,
            guestTokenHash: newTokenHash,
            subtotalCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalCents: 0,
            currency: "USD",
          },
          include: {
            items: {
              include: { part: true },
            },
          },
        });
      }

      const itemsDto: CartItemDto[] = draftOrder.items.map((item) => ({
        id: item.id,
        partId: item.partId,
        mpn: item.mpn || item.part.mpn,
        name: item.name || item.part.name,
        category: item.part.category,
        manufacturer: item.part.manufacturer,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        stockAvailable: Math.max(0, item.part.stockOnHand - item.part.stockReserved),
        imageUrl: item.part.imageUrl,
        datasheetUrl: item.part.datasheetUrl,
      }));

      const itemCount = itemsDto.reduce((sum, item) => sum + item.quantity, 0);

      const cart: CartResponse = {
        id: draftOrder.id,
        orderNumber: draftOrder.orderNumber,
        status: draftOrder.status,
        items: itemsDto,
        itemCount,
        subtotalCents: draftOrder.subtotalCents,
        shippingCents: draftOrder.shippingCents,
        taxCents: draftOrder.taxCents,
        totalCents: draftOrder.totalCents,
        currency: draftOrder.currency,
        updatedAt: draftOrder.updatedAt.toISOString(),
      };

      return { cart, guestToken: rawToken, isNew };
    } catch (dbError) {
      console.warn(
        "[CartService] Live database query failed, using resilient memory fallback cart:",
        dbError instanceof Error ? dbError.message : "DB error"
      );
    }
  }

  // Resilient memory cart fallback (for offline demos or transient DB outages)
  let mem = memoryCarts.get(tokenHash);
  if (!mem) {
    mem = {
      id: `mem-ord-${Date.now()}`,
      orderNumber: generateOrderNumber(),
      items: [],
      updatedAt: new Date(),
    };
    memoryCarts.set(tokenHash, mem);
    isNew = true;
  }

  const itemsDto: CartItemDto[] = mem.items.map((item) => ({
    id: item.id,
    partId: item.partId,
    mpn: item.mpn,
    name: item.name,
    category: item.part.category,
    manufacturer: item.part.manufacturer,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    totalCents: item.totalCents,
    stockAvailable: Math.max(0, item.part.stockOnHand - item.part.stockReserved),
    imageUrl: item.part.imageUrl,
    datasheetUrl: item.part.datasheetUrl,
  }));

  const { subtotalCents, shippingCents, taxCents, totalCents } = calculateFinancialTotals(mem.items);

  return {
    cart: {
      id: mem.id,
      orderNumber: mem.orderNumber,
      status: OrderStatus.DRAFT,
      items: itemsDto,
      itemCount: itemsDto.reduce((sum, i) => sum + i.quantity, 0),
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      currency: "USD",
      updatedAt: mem.updatedAt.toISOString(),
    },
    guestToken: rawToken,
    isNew,
  };
}

/**
 * Adds a catalogue product to the guest's DRAFT cart.
 * Strictly uses server-authoritative pricing and inventory limits.
 */
export async function addItemToCart(
  guestToken: string,
  partId: string,
  quantity: number
): Promise<CartResponse> {
  if (!partId || typeof partId !== "string" || partId.trim().length === 0) {
    throw new Error("Invalid partId: Component identifier is required.");
  }

  const parsedQty = Math.floor(quantity);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    throw new Error("Invalid quantity: Must be a positive integer greater than zero.");
  }
  if (parsedQty > 100) {
    throw new Error("Maximum order quantity for prototype prototype orders is 100 units per item.");
  }

  const tokenHash = hashGuestToken(guestToken);

  // 1. Resolve Part strictly from Neon DB
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const part = await db.part.findUnique({
        where: { id: partId },
      });

      if (!part || !part.isActive) {
        throw new Error("Component not found or is currently inactive in the catalogue.");
      }

      if (part.isDemonstrationSample) {
        throw new Error(
          "Demonstration fixture components are unverified samples and cannot be added to a purchasing cart."
        );
      }

      const availableStock = Math.max(0, part.stockOnHand - part.stockReserved);

      // Ensure DRAFT order exists
      let order = await db.order.findUnique({
        where: { guestTokenHash: tokenHash },
        include: { items: true },
      });

      if (!order || order.status !== OrderStatus.DRAFT) {
        order = await db.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            status: OrderStatus.DRAFT,
            guestTokenHash: tokenHash,
            subtotalCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalCents: 0,
            currency: "USD",
          },
          include: { items: true },
        });
      }

      const existingItem = order.items.find((i) => i.partId === partId);
      const targetQty = (existingItem?.quantity ?? 0) + parsedQty;

      if (targetQty > availableStock) {
        throw new Error(
          `Requested total quantity (${targetQty}) exceeds available inventory (${availableStock} units available).`
        );
      }

      // Server-authoritative pricing snapshot
      const unitPriceCents = part.priceCents;
      const lineTotalCents = unitPriceCents * targetQty;

      if (existingItem) {
        await db.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: targetQty,
            unitPriceCents,
            totalCents: lineTotalCents,
            mpn: part.mpn,
            name: part.name,
          },
        });
      } else {
        await db.orderItem.create({
          data: {
            orderId: order.id,
            partId: part.id,
            quantity: targetQty,
            unitPriceCents,
            totalCents: lineTotalCents,
            mpn: part.mpn,
            name: part.name,
          },
        });
      }

      // Recalculate order totals
      const refreshedItems = await db.orderItem.findMany({
        where: { orderId: order.id },
      });
      const totals = calculateFinancialTotals(refreshedItems);

      await db.order.update({
        where: { id: order.id },
        data: {
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
        },
      });

      const res = await getOrCreateCart(guestToken);
      return res.cart;
    } catch (err) {
      if (err instanceof Error && !err.message.includes("database")) {
        throw err;
      }
      console.warn("[CartService] Database operation failed, falling back to memory:", err);
    }
  }

  // Memory fallback handling
  const fixturePart = CATALOG_FIXTURES.find((f) => f.id === partId);
  if (!fixturePart) {
    throw new Error("Component not found in catalogue.");
  }

  const mem = memoryCarts.get(tokenHash) || {
    id: `mem-ord-${Date.now()}`,
    orderNumber: generateOrderNumber(),
    items: [],
    updatedAt: new Date(),
  };

  const existing = mem.items.find((i) => i.partId === partId);
  const targetQty = (existing?.quantity ?? 0) + parsedQty;

  const mockPart: Part = {
    id: fixturePart.id,
    mpn: fixturePart.mpn,
    sku: `SKU-${fixturePart.mpn}`,
    name: fixturePart.name,
    manufacturer: fixturePart.manufacturer,
    category: fixturePart.category,
    description: fixturePart.description,
    imageUrl: null,
    specificationSource: "Offline Fixture",
    specificationVerifiedAt: new Date(),
    datasheetUrl: null,
    isDemonstrationSample: false,
    priceCents: fixturePart.priceCents,
    currency: "USD",
    stockOnHand: 50,
    stockReserved: 0,
    specs: fixturePart.specs as any,
    supportedPlatforms: fixturePart.supportedPlatforms,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    existing.quantity = targetQty;
    existing.totalCents = mockPart.priceCents * targetQty;
  } else {
    mem.items.push({
      id: `mem-item-${Date.now()}`,
      partId,
      quantity: targetQty,
      unitPriceCents: mockPart.priceCents,
      totalCents: mockPart.priceCents * targetQty,
      mpn: mockPart.mpn,
      name: mockPart.name,
      part: mockPart,
    });
  }

  mem.updatedAt = new Date();
  memoryCarts.set(tokenHash, mem);

  const res = await getOrCreateCart(guestToken);
  return res.cart;
}

/**
 * Updates item quantity in the cart. Passing quantity <= 0 deletes the line item.
 */
export async function updateCartItem(
  guestToken: string,
  itemId: string,
  quantity: number
): Promise<CartResponse> {
  const parsedQty = Math.floor(quantity);
  const tokenHash = hashGuestToken(guestToken);

  if (parsedQty <= 0) {
    return removeCartItem(guestToken, itemId);
  }
  if (parsedQty > 100) {
    throw new Error("Maximum order quantity is 100 units per line item.");
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const item = await db.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true, part: true },
      });

      if (!item || item.order.guestTokenHash !== tokenHash) {
        throw new Error("Cart item not found.");
      }

      const availableStock = Math.max(0, item.part.stockOnHand - item.part.stockReserved);
      if (parsedQty > availableStock) {
        throw new Error(
          `Requested quantity (${parsedQty}) exceeds available stock (${availableStock} units available).`
        );
      }

      const lineTotalCents = item.unitPriceCents * parsedQty;

      await db.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: parsedQty,
          totalCents: lineTotalCents,
        },
      });

      const refreshedItems = await db.orderItem.findMany({
        where: { orderId: item.orderId },
      });
      const totals = calculateFinancialTotals(refreshedItems);

      await db.order.update({
        where: { id: item.orderId },
        data: {
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
        },
      });

      const res = await getOrCreateCart(guestToken);
      return res.cart;
    } catch (err) {
      if (err instanceof Error && !err.message.includes("database")) {
        throw err;
      }
      console.warn("[CartService] Database update failed, checking memory fallback:", err);
    }
  }

  // Memory fallback
  const mem = memoryCarts.get(tokenHash);
  if (mem) {
    const item = mem.items.find((i) => i.id === itemId);
    if (item) {
      item.quantity = parsedQty;
      item.totalCents = item.unitPriceCents * parsedQty;
      mem.updatedAt = new Date();
    }
  }

  const res = await getOrCreateCart(guestToken);
  return res.cart;
}

/**
 * Removes a line item from the cart.
 */
export async function removeCartItem(
  guestToken: string,
  itemId: string
): Promise<CartResponse> {
  const tokenHash = hashGuestToken(guestToken);

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const item = await db.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true },
      });

      if (item && item.order.guestTokenHash === tokenHash) {
        await db.orderItem.delete({
          where: { id: itemId },
        });

        const refreshedItems = await db.orderItem.findMany({
          where: { orderId: item.orderId },
        });
        const totals = calculateFinancialTotals(refreshedItems);

        await db.order.update({
          where: { id: item.orderId },
          data: {
            subtotalCents: totals.subtotalCents,
            shippingCents: totals.shippingCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
          },
        });
      }

      const res = await getOrCreateCart(guestToken);
      return res.cart;
    } catch (err) {
      console.warn("[CartService] Database remove failed, checking memory fallback:", err);
    }
  }

  // Memory fallback
  const mem = memoryCarts.get(tokenHash);
  if (mem) {
    mem.items = mem.items.filter((i) => i.id !== itemId);
    mem.updatedAt = new Date();
  }

  const res = await getOrCreateCart(guestToken);
  return res.cart;
}

/**
 * Clears all items from the active draft cart.
 */
export async function clearCart(guestToken: string): Promise<CartResponse> {
  const tokenHash = hashGuestToken(guestToken);

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const order = await db.order.findUnique({
        where: { guestTokenHash: tokenHash },
      });

      if (order && order.status === OrderStatus.DRAFT) {
        await db.orderItem.deleteMany({
          where: { orderId: order.id },
        });

        await db.order.update({
          where: { id: order.id },
          data: {
            subtotalCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalCents: 0,
          },
        });
      }

      const res = await getOrCreateCart(guestToken);
      return res.cart;
    } catch (err) {
      console.warn("[CartService] Database clear failed, clearing memory fallback:", err);
    }
  }

  const mem = memoryCarts.get(tokenHash);
  if (mem) {
    mem.items = [];
    mem.updatedAt = new Date();
  }

  const res = await getOrCreateCart(guestToken);
  return res.cart;
}

/**
 * Adds all resolved, purchasable catalogue items from a Bill of Materials into the cart in batch.
 */
export async function addBomToCart(
  guestToken: string,
  entries: BomEntry[]
): Promise<{ cart: CartResponse; addedCount: number; skippedCount: number }> {
  let addedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    if (
      entry.resolutionStatus === "RESOLVED_CATALOGUE" &&
      entry.matchedPartId &&
      entry.isPurchasable
    ) {
      try {
        await addItemToCart(guestToken, entry.matchedPartId, entry.quantity || 1);
        addedCount += 1;
      } catch (err) {
        console.warn(`[BOM Cart Batch] Skipped item ${entry.name}:`, err);
        skippedCount += 1;
      }
    } else {
      skippedCount += 1;
    }
  }

  const res = await getOrCreateCart(guestToken);
  return { cart: res.cart, addedCount, skippedCount };
}
