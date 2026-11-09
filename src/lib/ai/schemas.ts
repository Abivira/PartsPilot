import { z } from "zod";
import { ComponentCategory } from "@prisma/client";

export const DamageTypeSchema = z.enum([
  "NONE",
  "BURN_MARK",
  "CRACKED_PACKAGE",
  "BENT_PINS",
  "SOLDER_BRIDGE",
  "CORROSION",
  "BLOWN_CAPACITOR",
  "OTHER",
]);

export const DamageSeveritySchema = z.enum(["NONE", "LOW", "MEDIUM", "CRITICAL"]);

export const PhysicalDamageReportSchema = z.object({
  detected: z.boolean().default(false),
  type: DamageTypeSchema.default("NONE"),
  severity: DamageSeveritySchema.default("NONE"),
  description: z.string().default("No visible physical damage detected."),
});

// Map string category values to Prisma ComponentCategory enum values safely
const categoryEnumValues = Object.values(ComponentCategory) as [string, ...string[]];

export const ComponentCategorySchema = z
  .string()
  .transform((val) => {
    const upper = val.toUpperCase().trim();
    if (upper === "POWER_REGULATOR") return ComponentCategory.POWER_MODULE;
    if (upper === "REGULATOR") return ComponentCategory.POWER_MODULE;
    if (categoryEnumValues.includes(upper)) {
      return upper as ComponentCategory;
    }
    return ComponentCategory.ACCESSORY;
  })
  .pipe(z.nativeEnum(ComponentCategory));

/**
 * Zod schema for the structured response returned by Google Gemini.
 */
export const ExtractedComponentDataSchema = z.object({
  category: ComponentCategorySchema.default(ComponentCategory.ACCESSORY),
  manufacturerMarkings: z.string().nullable().optional().transform((val) => val ?? undefined),
  rawSilkscreenText: z.string().nullable().optional().transform((val) => val ?? undefined),
  likelyMpn: z.string().nullable().optional().transform((val) => val ?? undefined),
  packageType: z.string().nullable().optional().transform((val) => val ?? undefined),
  pinCount: z.number().int().positive().nullable().optional().transform((val) => val ?? undefined),
  visibleElectricalClues: z.array(z.string()).default([]),
  communicationProtocolClues: z.array(z.string()).default([]),
  physicalDamage: PhysicalDamageReportSchema.default({
    detected: false,
    type: "NONE",
    severity: "NONE",
    description: "No observable physical damage on component exterior.",
  }),
  confidence: z.number().min(0).max(1).default(0.5),
  isUncertain: z.boolean().default(false),
  observedSpecs: z.record(z.unknown()).default({}),
  inferredSpecs: z.record(z.unknown()).default({}),
  unknownSpecs: z.array(z.string()).default([]),
  clarificationQuestions: z.array(z.string()).default([]),
  reasoning: z.string().default("Visual inspection complete."),
});

export type ExtractedComponentData = z.infer<typeof ExtractedComponentDataSchema>;
export type ExtractedComponentDataParsed = ExtractedComponentData;

/**
 * Target hardware context schema for incoming diagnostic requests.
 */
export const TargetHardwareContextSchema = z.object({
  hostBoard: z.string().optional(),
  logicVoltageV: z.number().positive().optional(),
  supplyVoltageV: z.number().positive().optional(),
  loadCurrentA: z.number().positive().optional(),
  requiredProtocols: z.array(z.string()).optional(),
  existingI2cAddresses: z.array(z.string()).optional(),
  motorType: z
    .enum(["STEPPER_BIPOLAR", "DC_BRUSHED", "SERVO", "BRUSHLESS"])
    .optional(),
  motorFrameSizeMm: z.number().positive().optional(),
  motorShaftDiameterMm: z.number().positive().optional(),
  connectorPinCount: z.number().int().positive().optional(),
  connectorPitchMm: z.number().positive().optional(),
  circuitCurrentA: z.number().positive().optional(),
  circuitVoltageV: z.number().positive().optional(),
  targetOutputVoltageV: z.number().positive().optional(),
});

/**
 * Zod schema for validating the incoming diagnostic payload (form fields / JSON).
 */
export const DiagnoseInputSchema = z.object({
  userMpn: z.string().max(100).optional(),
  symptomDescription: z.string().max(2000).optional(),
  targetContext: TargetHardwareContextSchema.optional(),
});
