import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

/**
 * Leases inventory for an order during payment initiation.
 * Prevents overselling by reserving stock until payment completes or lease expires.
 */
export async function leaseInventoryForOrder(
  orderId: string,
  durationMinutes = 15
): Promise<{ success: boolean; expiresAt: Date }> {
  return await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { part: true },
        },
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.stockCommitted) {
      throw new Error(`Inventory already committed for order ${order.orderNumber}.`);
    }

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    // If already leased and not expired, just extend the lease
    if (order.inventoryLeased && order.leaseExpiresAt && order.leaseExpiresAt > new Date()) {
      await tx.order.update({
        where: { id: orderId },
        data: { leaseExpiresAt: expiresAt },
      });
      return { success: true, expiresAt };
    }

    // Verify stock availability and increment stockReserved
    for (const item of order.items) {
      const part = item.part;
      const available = part.stockOnHand - part.stockReserved;

      if (item.quantity > available) {
        throw new Error(
          `Insufficient inventory for component ${part.mpn} (${part.name}). Requested: ${item.quantity}, Available: ${Math.max(0, available)}.`
        );
      }

      await tx.part.update({
        where: { id: part.id },
        data: {
          stockReserved: { increment: item.quantity },
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        inventoryLeased: true,
        leaseExpiresAt: expiresAt,
        status: OrderStatus.PENDING_PAYMENT,
      },
    });

    return { success: true, expiresAt };
  });
}

/**
 * Releases reserved inventory back to available stock if payment is cancelled or fails.
 */
export async function releaseInventoryLease(orderId: string): Promise<boolean> {
  return await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { part: true },
        },
      },
    });

    if (!order) return false;

    // Never release stock if payment was already confirmed and committed
    if (order.stockCommitted) {
      return false;
    }

    if (order.inventoryLeased) {
      for (const item of order.items) {
        const newReserved = Math.max(0, item.part.stockReserved - item.quantity);
        await tx.part.update({
          where: { id: item.partId },
          data: { stockReserved: newReserved },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          inventoryLeased: false,
          leaseExpiresAt: null,
          status: OrderStatus.CANCELLED,
        },
      });

      return true;
    }

    return false;
  });
}

/**
 * Commits stock permanently once payment is verified and confirmed.
 * Implements strict idempotency: if already committed, this operation is a safe NOOP.
 */
export async function commitInventoryForOrder(orderId: string): Promise<boolean> {
  return await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { part: true },
        },
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    // Idempotency check: prevent duplicate stock decrement
    if (order.stockCommitted) {
      return true;
    }

    for (const item of order.items) {
      const part = item.part;
      const newOnHand = Math.max(0, part.stockOnHand - item.quantity);
      // If stock was reserved under lease, release that reservation count
      const newReserved = order.inventoryLeased
        ? Math.max(0, part.stockReserved - item.quantity)
        : part.stockReserved;

      await tx.part.update({
        where: { id: part.id },
        data: {
          stockOnHand: newOnHand,
          stockReserved: newReserved,
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        stockCommitted: true,
        inventoryLeased: false,
        leaseExpiresAt: null,
        status: OrderStatus.PAID,
      },
    });

    return true;
  });
}

/**
 * Background/cron helper to clean up expired inventory leases.
 */
export async function expireStaleLeases(): Promise<number> {
  const expiredOrders = await db.order.findMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      inventoryLeased: true,
      stockCommitted: false,
      leaseExpiresAt: {
        lt: new Date(),
      },
    },
    select: { id: true },
  });

  let expiredCount = 0;
  for (const ord of expiredOrders) {
    try {
      await releaseInventoryLease(ord.id);
      await db.order.update({
        where: { id: ord.id },
        data: { status: OrderStatus.EXPIRED },
      });
      expiredCount++;
    } catch (err) {
      console.warn(`Failed to expire lease for order ${ord.id}:`, err);
    }
  }

  return expiredCount;
}
