import { ComponentCategory } from "@prisma/client";

export type CompatibilityTier = "VERIFIED" | "POSSIBLE" | "UNVERIFIED";

export type ConditionStatus = "PASSED" | "FAILED" | "UNKNOWN";

export interface ConditionEvaluation {
  name: string;
  status: ConditionStatus;
  message: string;
  expected?: string | number | boolean | string[];
  actual?: string | number | boolean | string[];
}

export interface CompatibilityReport {
  partId?: string;
  mpn: string;
  category: ComponentCategory;
  tier: CompatibilityTier;
  confidenceScore: number; // 0.0 to 1.0
  summary: string;
  conditions: ConditionEvaluation[];
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  missingRequiredSpecs: string[];
  evaluatedAt: string;
}

/**
 * Target hardware context specified by user or diagnostic workflow.
 * Reflects the host board, power rails, protocol buses, and mechanical constraints.
 */
export interface TargetHardwareContext {
  hostBoard?: string;
  logicVoltageV?: number; // e.g. 3.3 or 5.0
  supplyVoltageV?: number; // e.g. 12.0 or 24.0 (motor or power rail)
  loadCurrentA?: number; // e.g. 1.5A
  requiredProtocols?: string[]; // e.g. ["I2C", "STEP_DIR", "PWM", "UART", "SPI"]
  existingI2cAddresses?: string[]; // e.g. ["0x68"] to detect collisions
  motorType?: "STEPPER_BIPOLAR" | "DC_BRUSHED" | "SERVO" | "BRUSHLESS";
  motorFrameSizeMm?: number; // e.g. 42 (NEMA 17)
  motorShaftDiameterMm?: number; // e.g. 5.0
  connectorPinCount?: number; // e.g. 4
  connectorPitchMm?: number; // e.g. 2.50 or 2.54
  circuitCurrentA?: number; // e.g. 2.0
  circuitVoltageV?: number; // e.g. 24.0
  targetOutputVoltageV?: number; // for power regulators, e.g. 5.0
}
