import { OrderStatus } from "@prisma/client";

export interface CartItemDto {
  id: string;
  partId: string;
  mpn: string;
  name: string;
  category: string;
  manufacturer: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  stockAvailable: number;
  imageUrl?: string | null;
  datasheetUrl?: string | null;
}

export interface CartResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  items: CartItemDto[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  guestTokenHash?: string;
  updatedAt: string;
}
