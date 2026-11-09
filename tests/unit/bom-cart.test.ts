import { describe, it, expect, beforeEach } from "vitest";
import { generateBomFromDiagnostic, exportBomToCsv } from "@/lib/bom/generator";
import { assignCatalogueMatchToBomEntry, searchCatalogueForSourcing } from "@/lib/bom/sourcing";
import {
  getOrCreateCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  addBomToCart,
  generateGuestToken,
  hashGuestToken,
} from "@/lib/cart/cart-service";
import { DiagnoseResponse } from "@/types/ai";
import { BillOfMaterials, BomEntry } from "@/types/bom";
import { ComponentCategory, CompatibilityTier, Part } from "@prisma/client";
import { db } from "@/lib/db";

describe("Phase 4: Interactive BOM & Component Sourcing Engine", () => {
  const mockCataloguePart: Part = {
    id: "part-tmc2209-mock",
    mpn: "TMC2209-LA",
    sku: "SKU-TMC2209",
    name: "TMC2209 Stepper Driver",
    manufacturer: "TRINAMIC",
    category: ComponentCategory.MOTOR_DRIVER,
    description: "Ultra-quiet motor driver",
    imageUrl: null,
    specificationSource: "Trinamic Datasheet Rev 1.08",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.08.pdf",
    isDemonstrationSample: false,
    priceCents: 1250, // $12.50
    currency: "USD",
    stockOnHand: 45,
    stockReserved: 5,
    specs: {
      voltageMaxV: 28.0,
      continuousCurrentA: 1.4,
      logicVoltageV: [3.3, 5.0],
    },
    supportedPlatforms: ["Voron 2.4", "Raspberry Pi 5"],
    isActive: true,
    createdAt: new Date("2026-11-08T00:00:00Z"),
    updatedAt: new Date("2026-11-08T00:00:00Z"),
  };

  const mockDemoPart: Part = {
    id: "part-demo-mock",
    mpn: "DEMO-SAMPLE-01",
    sku: "SKU-DEMO",
    name: "Unverified Engineering Prototype",
    manufacturer: "Generic Lab",
    category: ComponentCategory.MOTOR_DRIVER,
    description: "Lab test sample",
    imageUrl: null,
    specificationSource: "[OFFLINE DEMO FIXTURE] Lab Prototype",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: null,
    isDemonstrationSample: true, // DEMO SAMPLE
    priceCents: 999,
    currency: "USD",
    stockOnHand: 10,
    stockReserved: 0,
    specs: {},
    supportedPlatforms: [],
    isActive: true,
    createdAt: new Date("2026-11-08T00:00:00Z"),
    updatedAt: new Date("2026-11-08T00:00:00Z"),
  };

  const mockDiagnoseResponse: DiagnoseResponse = {
    success: true,
    aiExtraction: {
      category: ComponentCategory.MOTOR_DRIVER,
      manufacturerMarkings: "TRINAMIC",
      rawSilkscreenText: "TMC2209-LA 2134 GERMANY",
      likelyMpn: "TMC2209-LA",
      packageType: "QFN-28",
      pinCount: 28,
      visibleElectricalClues: ["28V VMOT", "VREF Potentiometer"],
      communicationProtocolClues: ["UART", "STEP/DIR"],
      observedSpecs: { voltageMaxV: 28.0 },
      inferredSpecs: { logicVoltageV: [3.3, 5.0] },
      unknownSpecs: [],
      reasoning: "Visual markings clearly indicate TMC2209-LA.",
      physicalDamage: {
        detected: false,
        type: "NONE",
        severity: "NONE",
        description: "No burn marks or damage.",
      },
      confidence: 0.96,
      isUncertain: false,
      clarificationQuestions: [],
    },
    matchedPart: mockCataloguePart,
    candidateParts: [],
    compatibilityReport: {
      mpn: "TMC2209-LA",
      category: ComponentCategory.MOTOR_DRIVER,
      tier: CompatibilityTier.VERIFIED,
      summary: "TMC2209-LA fully satisfies Voron 2.4 voltage and current requirements.",
      confidenceScore: 1.0,
      passedCount: 4,
      failedCount: 0,
      unknownCount: 0,
      missingRequiredSpecs: [],
      evaluatedAt: new Date().toISOString(),
      conditions: [
        {
          name: "Supply Voltage Ceilings",
          status: "PASSED",
          message: "24V rail within 28V limit.",
        },
      ],
    },
    meta: {
      evaluationSource: "CATALOGUE_AUTHORITATIVE",
      dataSource: "LIVE_DATABASE",
      modelUsed: "gemini-2.5-flash",
      executionTimeMs: 120,
      timestamp: new Date().toISOString(),
    },
  };

  // 1. BOM Generation with exact match
  it("1. Generates structured BOM from diagnostic response with exact catalogue match", () => {
    const bom = generateBomFromDiagnostic({
      diagnoseResponse: mockDiagnoseResponse,
    });

    expect(bom.entries).toHaveLength(1);
    const entry = bom.entries[0];
    expect(entry.mpn).toBe("TMC2209-LA");
    expect(entry.resolutionStatus).toBe("RESOLVED_CATALOGUE");
    expect(entry.unitPriceCents).toBe(1250);
    expect(entry.totalPriceCents).toBe(1250);
    expect(entry.stockAvailable).toBe(40); // 45 - 5
    expect(entry.isPurchasable).toBe(true);
    expect(bom.totalEstimatedCents).toBe(1250);
    expect(bom.resolvedCount).toBe(1);
    expect(bom.unresolvedCount).toBe(0);
  });

  // 2. BOM Generation with uncatalogued/unresolved AI extraction
  it("2. Correctly flags uncatalogued AI components as UNRESOLVED_AI with isPurchasable=false", () => {
    const uncataloguedResponse: DiagnoseResponse = {
      ...mockDiagnoseResponse,
      matchedPart: null,
      aiExtraction: {
        ...mockDiagnoseResponse.aiExtraction,
        likelyMpn: "UNKNOWN-CHIP-99",
        confidence: 0.72,
      },
    };

    const bom = generateBomFromDiagnostic({
      diagnoseResponse: uncataloguedResponse,
    });

    expect(bom.entries).toHaveLength(1);
    const entry = bom.entries[0];
    expect(entry.mpn).toBe("UNKNOWN-CHIP-99");
    expect(entry.resolutionStatus).toBe("UNRESOLVED_AI");
    expect(entry.matchedPartId).toBeNull();
    expect(entry.unitPriceCents).toBeNull();
    expect(entry.totalPriceCents).toBeNull();
    expect(entry.isPurchasable).toBe(false);
    expect(entry.warnings).toBeDefined();
    expect(entry.warnings?.length).toBeGreaterThan(0);
    expect(bom.resolvedCount).toBe(0);
    expect(bom.unresolvedCount).toBe(1);
  });

  // 3. BOM Companion Parts inclusion
  it("3. Successfully appends suggested companion subsystem components to BOM", () => {
    const companionMotor: Part = {
      id: "part-motor-companion",
      mpn: "17HS4401-NEMA17",
      sku: "SKU-NEMA17",
      name: "NEMA 17 Stepper Motor 42mm",
      manufacturer: "Usongshine",
      category: ComponentCategory.MOTOR,
      description: "Bipolar stepper motor",
      imageUrl: null,
      specificationSource: "Manufacturer Datasheet",
      specificationVerifiedAt: new Date(),
      datasheetUrl: null,
      isDemonstrationSample: false,
      priceCents: 1400, // $14.00
      currency: "USD",
      stockOnHand: 30,
      stockReserved: 0,
      specs: {},
      supportedPlatforms: ["Voron 2.4"],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bom = generateBomFromDiagnostic({
      diagnoseResponse: mockDiagnoseResponse,
      suggestedCompanionParts: [companionMotor],
    });

    expect(bom.entries).toHaveLength(2);
    expect(bom.entries[1].mpn).toBe("17HS4401-NEMA17");
    expect(bom.entries[1].resolutionStatus).toBe("RESOLVED_CATALOGUE");
    expect(bom.totalEstimatedCents).toBe(1250 + 1400);
    expect(bom.resolvedCount).toBe(2);
  });

  // 4. Catalogue Assignment via assignCatalogueMatchToBomEntry
  it("4. Explicitly maps catalogue match to an unresolved entry and updates pricing/stock", () => {
    const unresolvedEntry: BomEntry = {
      id: "bom-entry-test",
      name: "Unresolved Stepper",
      category: ComponentCategory.MOTOR_DRIVER,
      requiredSpecs: {},
      quantity: 3,
      confidence: 0.8,
      compatibilityTier: CompatibilityTier.UNVERIFIED,
      resolutionStatus: "UNRESOLVED_AI",
      userNotes: "Needs assignment",
      isPurchasable: false,
    };

    const resolved = assignCatalogueMatchToBomEntry(unresolvedEntry, mockCataloguePart);

    expect(resolved.resolutionStatus).toBe("RESOLVED_CATALOGUE");
    expect(resolved.matchedPartId).toBe(mockCataloguePart.id);
    expect(resolved.mpn).toBe(mockCataloguePart.mpn);
    expect(resolved.unitPriceCents).toBe(1250);
    expect(resolved.totalPriceCents).toBe(1250 * 3); // 3750 cents
    expect(resolved.stockAvailable).toBe(40);
    expect(resolved.isPurchasable).toBe(true);
  });

  // 5. Demo Fixture mapping guard in BOM
  it("5. Flags demonstration fixture component as unpurchasable with warning when mapped", () => {
    const unresolvedEntry: BomEntry = {
      id: "bom-entry-demo",
      name: "Demo Candidate",
      category: ComponentCategory.MOTOR_DRIVER,
      requiredSpecs: {},
      quantity: 1,
      confidence: 1.0,
      compatibilityTier: CompatibilityTier.UNVERIFIED,
      resolutionStatus: "UNRESOLVED_AI",
      userNotes: "Demo test",
      isPurchasable: false,
    };

    const resolved = assignCatalogueMatchToBomEntry(unresolvedEntry, mockDemoPart);

    expect(resolved.resolutionStatus).toBe("RESOLVED_CATALOGUE");
    expect(resolved.isPurchasable).toBe(false);
    expect(resolved.warnings).toContain(
      "Demonstration fixture sample. Cannot be added to live purchasing cart."
    );
  });

  // 6. RFC 4180 CSV Export
  it("6. Exports structured BOM into standard RFC 4180 CSV with escaped cells and USD prices", () => {
    const bom = generateBomFromDiagnostic({
      diagnoseResponse: mockDiagnoseResponse,
    });

    const csv = exportBomToCsv(bom);

    expect(csv).toContain('"Item #","MPN","Component Name"');
    expect(csv).toContain("TMC2209-LA");
    expect(csv).toContain("12.50"); // Unit price in USD
    expect(csv).toContain("RESOLVED_CATALOGUE");
  });

  // 7. Cart Creation and Guest Token Hashing
  it("7. Generates guest tokens and creates isolated DRAFT cart", async () => {
    const rawToken = generateGuestToken();
    expect(rawToken.length).toBe(64);

    const hash = hashGuestToken(rawToken);
    expect(hash).toHaveLength(64);

    const { cart, guestToken, isNew } = await getOrCreateCart(rawToken);
    expect(guestToken).toBe(rawToken);
    expect(cart.status).toBe("DRAFT");
    expect(cart.items).toBeInstanceOf(Array);
    expect(cart.subtotalCents).toBe(0);
    expect(cart.totalCents).toBe(0);
  });

  // 8. Add Item to Cart with server-authoritative pricing
  it("8. Adds active catalogue item to cart with server-authoritative pricing", async () => {
    const guestToken = generateGuestToken();

    // Query a known Neon seeded component (e.g. TMC2209-LA)
    const dbPart = await db.part.findFirst({
      where: { mpn: "TMC2209-LA", isActive: true },
    });

    if (dbPart) {
      const cart = await addItemToCart(guestToken, dbPart.id, 2);
      expect(cart.itemCount).toBe(2);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].partId).toBe(dbPart.id);
      expect(cart.items[0].unitPriceCents).toBe(dbPart.priceCents);
      expect(cart.items[0].totalCents).toBe(dbPart.priceCents * 2);

      // Financials: Under $50 subtotal has $5.00 (500 cents) shipping
      const expectedSubtotal = dbPart.priceCents * 2;
      const expectedShipping = expectedSubtotal >= 5000 ? 0 : 500;
      expect(cart.subtotalCents).toBe(expectedSubtotal);
      expect(cart.shippingCents).toBe(expectedShipping);
      expect(cart.totalCents).toBe(expectedSubtotal + expectedShipping);
    }
  });

  // 9. Rejects invalid quantities
  it("9. Rejects zero, negative, and excessive (>100) item quantities", async () => {
    const guestToken = generateGuestToken();
    const dbPart = await db.part.findFirst({ where: { isActive: true } });

    if (dbPart) {
      await expect(addItemToCart(guestToken, dbPart.id, 0)).rejects.toThrow(
        "Invalid quantity"
      );
      await expect(addItemToCart(guestToken, dbPart.id, -5)).rejects.toThrow(
        "Invalid quantity"
      );
      await expect(addItemToCart(guestToken, dbPart.id, 101)).rejects.toThrow(
        "Maximum order quantity"
      );
    }
  });

  // 10. Rejects demo sample components
  it("10. Rejects adding demonstration fixture sample components to purchasing cart", async () => {
    const guestToken = generateGuestToken();

    // Find demo sample if present, or test mock enforcement
    const demoPart = await db.part.findFirst({
      where: { isDemonstrationSample: true },
    });

    if (demoPart) {
      await expect(addItemToCart(guestToken, demoPart.id, 1)).rejects.toThrow(
        "Demonstration fixture components are unverified samples and cannot be added to a purchasing cart"
      );
    }
  });

  // 11. Enforces stock inventory limits
  it("11. Rejects cart addition when requested quantity exceeds available stock", async () => {
    const guestToken = generateGuestToken();
    const partWithLowStock =
      (await db.part.findFirst({
        where: { isActive: true, isDemonstrationSample: false, stockOnHand: { lt: 90 } },
      })) || (await db.part.findFirst({ where: { isActive: true } }));

    if (partWithLowStock) {
      const avail = Math.max(0, partWithLowStock.stockOnHand - partWithLowStock.stockReserved);
      const testQty = Math.min(100, avail + 2);
      if (testQty > avail) {
        await expect(addItemToCart(guestToken, partWithLowStock.id, testQty)).rejects.toThrow(
          "exceeds available inventory"
        );
      }
    }
  });

  // 12. Updates item quantity and recalculates totals
  it("12. Updates line item quantity and deletes item when set to 0", async () => {
    const guestToken = generateGuestToken();
    const dbPart = await db.part.findFirst({ where: { isActive: true } });

    if (dbPart) {
      const initialCart = await addItemToCart(guestToken, dbPart.id, 2);
      const lineItemId = initialCart.items[0].id;

      // Update to 3
      const updatedCart = await updateCartItem(guestToken, lineItemId, 3);
      expect(updatedCart.itemCount).toBe(3);
      expect(updatedCart.items[0].quantity).toBe(3);
      expect(updatedCart.items[0].totalCents).toBe(dbPart.priceCents * 3);

      // Setting quantity to 0 removes the item
      const emptiedCart = await updateCartItem(guestToken, lineItemId, 0);
      expect(emptiedCart.itemCount).toBe(0);
      expect(emptiedCart.items).toHaveLength(0);
      expect(emptiedCart.totalCents).toBe(0);
    }
  });

  // 13. Removes item and clears cart
  it("13. Clears cart and resets financial totals to zero", async () => {
    const guestToken = generateGuestToken();
    const dbPart = await db.part.findFirst({ where: { isActive: true } });

    if (dbPart) {
      await addItemToCart(guestToken, dbPart.id, 1);
      const clearedCart = await clearCart(guestToken);
      expect(clearedCart.itemCount).toBe(0);
      expect(clearedCart.subtotalCents).toBe(0);
      expect(clearedCart.totalCents).toBe(0);
    }
  });

  // 14. Batch adds sourced items from BOM
  it("14. Batch adds resolved purchasable BOM entries to cart and skips unresolved/demo items", async () => {
    const guestToken = generateGuestToken();
    const dbPart = await db.part.findFirst({
      where: { mpn: "TMC2209-LA", isActive: true },
    });

    if (dbPart) {
      const entries: BomEntry[] = [
        {
          id: "bom-resolved-1",
          name: dbPart.name,
          category: dbPart.category,
          requiredSpecs: {},
          quantity: 2,
          confidence: 1.0,
          compatibilityTier: CompatibilityTier.VERIFIED,
          resolutionStatus: "RESOLVED_CATALOGUE",
          matchedPartId: dbPart.id,
          isPurchasable: true,
          userNotes: "",
        },
        {
          id: "bom-unresolved-2",
          name: "Unknown Sensor",
          category: ComponentCategory.SENSOR,
          requiredSpecs: {},
          quantity: 1,
          confidence: 0.5,
          compatibilityTier: CompatibilityTier.UNVERIFIED,
          resolutionStatus: "UNRESOLVED_AI",
          matchedPartId: null,
          isPurchasable: false,
          userNotes: "",
        },
      ];

      const { cart, addedCount, skippedCount } = await addBomToCart(guestToken, entries);
      expect(addedCount).toBe(1);
      expect(skippedCount).toBe(1);
      expect(cart.itemCount).toBe(2);
    }
  });
});
