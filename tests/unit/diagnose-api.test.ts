import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/diagnose/route";
import { NextRequest } from "next/server";
import { extractComponentDiagnosis } from "@/lib/ai/gemini";
import { matchCataloguePart } from "@/lib/catalog/db-matching";
import { ComponentCategory } from "@prisma/client";
import { ExtractedComponentDataSchema } from "@/lib/ai/schemas";

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe("Phase 3: Gemini Multimodal Diagnostic Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-mock-api-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
  });

  // 1. Successful structured AI extraction
  it("1. Successfully extracts structured component data from Gemini response", async () => {
    const validGeminiJson = {
      category: "MOTOR_DRIVER",
      manufacturerMarkings: "Trinamic",
      rawSilkscreenText: "TMC2209-LA SilentStepStick",
      likelyMpn: "TMC2209-LA",
      packageType: "QFN-28",
      pinCount: 28,
      visibleElectricalClues: ["5.5V-28V motor supply", "3.3V logic"],
      communicationProtocolClues: ["STEP_DIR", "UART"],
      physicalDamage: {
        detected: false,
        type: "NONE",
        severity: "NONE",
        description: "No physical damage detected.",
      },
      confidence: 0.95,
      isUncertain: false,
      observedSpecs: {
        supplyVoltageMaxV: 28.0,
      },
      inferredSpecs: {
        practicalContinuousCurrentA: 1.4,
      },
      unknownSpecs: [],
      clarificationQuestions: [],
      reasoning: "Clear Trinamic silkscreen and QFN-28 package identified.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validGeminiJson),
    });

    const result = await extractComponentDiagnosis({
      userMpn: "TMC2209-LA",
    });

    expect(result.likelyMpn).toBe("TMC2209-LA");
    expect(result.category).toBe(ComponentCategory.MOTOR_DRIVER);
    expect(result.confidence).toBe(0.95);
    expect(result.isUncertain).toBe(false);
    expect(result.observedSpecs.supplyVoltageMaxV).toBe(28.0);
    expect(result.inferredSpecs.practicalContinuousCurrentA).toBe(1.4);
  });

  // 2. Unreadable photographs (unclear / low confidence / clarification questions)
  it("2. Handles unreadable/blurry photographs by flagging uncertain identification and questions", async () => {
    const blurryGeminiJson = {
      category: "ACCESSORY",
      manufacturerMarkings: null,
      rawSilkscreenText: null,
      likelyMpn: null,
      packageType: "Unclear DIP/SOIC module",
      pinCount: null,
      visibleElectricalClues: [],
      communicationProtocolClues: [],
      physicalDamage: {
        detected: false,
        type: "NONE",
        severity: "NONE",
        description: "Markings rubbed off or out of focus.",
      },
      confidence: 0.25,
      isUncertain: true,
      observedSpecs: {},
      inferredSpecs: {},
      unknownSpecs: ["operatingVoltage", "pinout", "protocol"],
      clarificationQuestions: [
        "Please provide a closer, in-focus photograph under direct lighting.",
        "Can you read any etched markings on the main silicon IC?",
      ],
      reasoning: "Silkscreen is obliterated and focus is too blurry to identify part.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(blurryGeminiJson),
    });

    const result = await extractComponentDiagnosis({
      imageBuffer: Buffer.from("fake-blurry-image-bytes"),
      mimeType: "image/jpeg",
    });

    expect(result.isUncertain).toBe(true);
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.clarificationQuestions.length).toBeGreaterThan(0);
    expect(result.likelyMpn).toBeUndefined();
  });

  // 3. Missing or ambiguous MPN
  it("3. Handles missing or ambiguous MPN without guessing or hallucinating", async () => {
    const ambiguousJson = {
      category: "SENSOR",
      manufacturerMarkings: "Generic",
      rawSilkscreenText: "GY-521",
      likelyMpn: null,
      packageType: "Breakout PCB",
      pinCount: 8,
      visibleElectricalClues: ["VCC, GND, SCL, SDA"],
      communicationProtocolClues: ["I2C"],
      physicalDamage: {
        detected: false,
        type: "NONE",
        severity: "NONE",
        description: "None",
      },
      confidence: 0.5,
      isUncertain: true,
      observedSpecs: {},
      inferredSpecs: {},
      unknownSpecs: ["exactSiliconMpn"],
      clarificationQuestions: ["Is the IC an MPU-6050 or ITG-3205?"],
      reasoning: "Board says GY-521 but sensor IC marking is not legible.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(ambiguousJson),
    });

    const result = await extractComponentDiagnosis({
      symptomDescription: "Board with GY-521 written on it",
    });

    expect(result.likelyMpn).toBeUndefined();
    expect(result.isUncertain).toBe(true);
  });

  // 4. Unknown component not present in catalogue
  it("4. Queries Neon catalogue and returns candidate matches or indicates absence when part is unknown", async () => {
    const match = await matchCataloguePart({
      mpn: "NON-EXISTENT-ROBOTIC-PART-9999",
      category: ComponentCategory.SENSOR,
    });

    expect(match.matchedPart).toBeNull();
    // It should not invent an exact match
    expect(match.matchType).not.toBe("EXACT");
  });

  // 5. Gemini provider failure and timeout
  it("5. Handles Gemini provider failure gracefully", async () => {
    mockGenerateContent.mockRejectedValueOnce(
      new Error("API quota exceeded or network connection reset")
    );

    await expect(
      extractComponentDiagnosis({
        userMpn: "ESP32",
      })
    ).rejects.toThrow("Gemini diagnostic extraction failed");
  });

  // 6. Invalid image MIME type validation
  it("6. Rejects invalid image MIME types with 400 Bad Request in API route", async () => {
    const formData = new FormData();
    const fakeFile = new File(["dummy text content"], "notes.txt", { type: "text/plain" });
    formData.append("image", fakeFile);
    formData.append("userMpn", "TMC2209-LA");

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Unsupported image format");
  });

  // 7. Image exceeding 5 MB validation
  it("7. Rejects uploaded images exceeding 5 MB limit with 413 Payload Too Large", async () => {
    const formData = new FormData();
    // 5.5 MB payload
    const largeBuffer = new Uint8Array(5.5 * 1024 * 1024);
    const largeFile = new File([largeBuffer], "huge-photo.jpg", { type: "image/jpeg" });
    formData.append("image", largeFile);

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);

    const body = await res.json();
    expect(body.error).toContain("exceeds the 5 MB size limit");
  });

  // 8. Malformed structured AI response
  it("8. Validates and recovers or rejects malformed AI response with Zod", () => {
    const malformed = {
      category: "INVALID_UNKNOWN_CAT",
      // missing physicalDamage
    };

    // Schema parser safely handles or pipes into default
    const parsed = ExtractedComponentDataSchema.parse(malformed);
    expect(parsed.category).toBe(ComponentCategory.ACCESSORY);
    expect(parsed.physicalDamage.detected).toBe(false);
  });

  // 9. Exact MPN matching against Neon database
  it("9. Matches exact MPN against catalogue with authoritative specs", async () => {
    const match = await matchCataloguePart({
      mpn: "TMC2209-LA",
      category: ComponentCategory.MOTOR_DRIVER,
    });

    expect(match.matchedPart).not.toBeNull();
    expect(match.matchedPart?.mpn).toBe("TMC2209-LA");
    expect(match.matchType).toBe("EXACT");
  });

  // 10. AI inference versus directly observed evidence
  it("10. Distinguishes directly observed evidence from inferred datasheet specs", async () => {
    const dataWithDistinction = {
      category: "MOTOR_DRIVER",
      likelyMpn: "TMC2209-LA",
      observedSpecs: {
        printedMaxVolts: 28.0,
      },
      inferredSpecs: {
        stepStickPassiveLimitA: 1.4,
      },
      unknownSpecs: ["traceCopperThicknessOz"],
      visibleElectricalClues: ["Printed label 'VIO 3.3V-5V'"],
      communicationProtocolClues: ["UART"],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(dataWithDistinction),
    });

    const result = await extractComponentDiagnosis({ userMpn: "TMC2209-LA" });

    // Directly observed must be separate from inferred
    expect(result.observedSpecs.printedMaxVolts).toBe(28.0);
    expect(result.inferredSpecs.stepStickPassiveLimitA).toBe(1.4);
    expect(result.unknownSpecs).toContain("traceCopperThicknessOz");
  });

  // 11. High AI confidence with failed deterministic compatibility
  it("11. CRITICAL: High AI confidence must NEVER override a failed deterministic compatibility rule", async () => {
    // AI has 99% confidence that the chip is ESP32 (3.3V logic only)
    const esp32AiData = {
      category: "MICROCONTROLLER",
      manufacturerMarkings: "Espressif",
      rawSilkscreenText: "ESP32-WROOM-32E",
      likelyMpn: "ESP32-WROOM-32E-N4",
      packageType: "Module",
      pinCount: 38,
      visibleElectricalClues: ["3.3V VDD"],
      communicationProtocolClues: ["I2C", "SPI", "UART"],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
      confidence: 0.99, // Extremely confident AI
      isUncertain: false,
      observedSpecs: { logicVoltageV: 3.3 },
      inferredSpecs: {},
      unknownSpecs: [],
      clarificationQuestions: [],
      reasoning: "Crystal clear ESP32 module.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(esp32AiData),
    });

    // Send request into target context with 5.0V Logic (Arduino Uno R3)
    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "ESP32-WROOM-32E-N4",
        targetContext: {
          hostBoard: "Arduino Uno R3",
          logicVoltageV: 5.0, // 5V logic fed into non-5V tolerant 3.3V ESP32
          supplyVoltageV: 9.0,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // AI identification is confident
    expect(body.aiExtraction.confidence).toBe(0.99);

    // BUT deterministic compatibility MUST BE UNVERIFIED (FAILED)
    expect(body.compatibilityReport.tier).toBe("UNVERIFIED");
    expect(body.compatibilityReport.failedCount).toBeGreaterThanOrEqual(1);

    const logicCondition = body.compatibilityReport.conditions.find(
      (c: any) => c.name.toLowerCase().includes("logic") || c.name.toLowerCase().includes("voltage")
    );
    expect(logicCondition?.status).toBe("FAILED");
  });

  // 12. Missing mandatory compatibility specifications
  it("12. Missing mandatory specifications cannot silently pass as VERIFIED", async () => {
    // Custom unknown component with missing voltages
    const unknownPartAi = {
      category: "MOTOR_DRIVER",
      likelyMpn: "GENERIC-DRIVER-XYZ",
      confidence: 0.8,
      isUncertain: false,
      observedSpecs: {},
      inferredSpecs: {},
      unknownSpecs: ["supplyVoltageMaxV", "maxCurrentA"],
      visibleElectricalClues: [],
      communicationProtocolClues: [],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(unknownPartAi),
    });

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "GENERIC-DRIVER-XYZ",
        targetContext: {
          supplyVoltageV: 24.0,
          logicVoltageV: 3.3,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Must NOT be VERIFIED
    expect(body.compatibilityReport.tier).not.toBe("VERIFIED");
    expect(body.compatibilityReport.unknownCount).toBeGreaterThanOrEqual(1);
  });

  // 13. Text-only diagnostic requests
  it("13. Supports text-only diagnostic requests when no photograph is supplied", async () => {
    const textExtraction = {
      category: "POWER_MODULE",
      manufacturerMarkings: "Texas Instruments",
      rawSilkscreenText: null,
      likelyMpn: "LM2596S-ADJ",
      packageType: "DC-DC Step-Down Module",
      visibleElectricalClues: ["Input 3V-40V", "Output 1.25V-35V"],
      communicationProtocolClues: [],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
      confidence: 0.9,
      isUncertain: false,
      observedSpecs: {},
      inferredSpecs: { inputVoltageMaxV: 40.0, outputCurrentMaxA: 3.0 },
      unknownSpecs: [],
      clarificationQuestions: [],
      reasoning: "Standard LM2596 buck converter identified from MPN text input.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(textExtraction),
    });

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "LM2596S-ADJ",
        symptomDescription: "Buck converter converting 24V down to 5V",
        targetContext: {
          supplyVoltageV: 24.0,
          targetOutputVoltageV: 5.0,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.aiExtraction.likelyMpn).toBe("LM2596S-ADJ");
    expect(body.matchedPart?.mpn).toBe("LM2596S-ADJ");
    expect(body.meta.evaluationSource).toBe("CATALOGUE_AUTHORITATIVE");
  });

  // Bonus test: Physical damage override
  it("14. Flags physical damage and enforces UNVERIFIED even when specs match", async () => {
    const damagedDriver = {
      category: "MOTOR_DRIVER",
      likelyMpn: "TMC2209-LA",
      confidence: 0.92,
      isUncertain: false,
      observedSpecs: { supplyVoltageMaxV: 28.0 },
      inferredSpecs: {},
      unknownSpecs: [],
      visibleElectricalClues: [],
      communicationProtocolClues: ["STEP_DIR"],
      physicalDamage: {
        detected: true,
        type: "BURN_MARK",
        severity: "CRITICAL",
        description: "Severe burn crater and melted resin on driver IC top surface.",
      },
      clarificationQuestions: [],
      reasoning: "Component has suffered an electrical overstress event.",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(damagedDriver),
    });

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "TMC2209-LA",
        targetContext: {
          supplyVoltageV: 24.0,
          logicVoltageV: 3.3,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.aiExtraction.physicalDamage.detected).toBe(true);
    // Must be UNVERIFIED due to physical damage
    expect(body.compatibilityReport.tier).toBe("UNVERIFIED");
    expect(body.compatibilityReport.confidenceScore).toBe(0.0);
    expect(body.compatibilityReport.summary).toContain("PHYSICAL DAMAGE DETECTED");
  });
});
