import { describe, it, expect } from "vitest";
import { evaluateCompatibility } from "@/lib/catalog/matcher";
import { ComponentCategory } from "@prisma/client";
import { TargetHardwareContext } from "@/types/compatibility";

describe("Deterministic Compatibility Engine (matcher.ts) - Safety & Accuracy Audit Suite", () => {
  // Test Fixture: TMC2209 Stepper Driver
  const tmc2209 = {
    id: "part_tmc2209",
    mpn: "TMC2209-LA",
    category: ComponentCategory.MOTOR_DRIVER,
    name: "TMC2209 SilentStepStick Stepper Motor Driver",
    specs: {
      supplyVoltageMinV: 4.75,
      supplyVoltageMaxV: 29.0,
      logicVoltage: "3.3V / 5.0V compatible",
      maxCurrentRmsA: 2.0, // Silicon IC rating (requires heatsink + fan cooling)
      practicalContinuousCurrentA: 1.4, // Standard 4-layer StepStick PCB ambient limit without fan
      requiresActiveCoolingAboveA: 1.2,
      maxCurrentPeakA: 2.8,
      controlInterface: ["STEP_DIR", "UART"],
    },
    supportedPlatforms: ["Voron 2.4", "Raspberry Pi", "Arduino CNC Shield"],
  };

  // Test Fixture: ESP32-WROOM-32E Microcontroller
  const esp32 = {
    id: "part_esp32",
    mpn: "ESP32-WROOM-32E-N4",
    category: ComponentCategory.MICROCONTROLLER,
    specs: {
      operatingVoltageMinV: 3.0,
      operatingVoltageMaxV: 3.6,
      logicVoltageV: 3.3,
      is5VTolerant: false,
      interfaces: ["UART", "SPI", "I2C", "PWM", "CAN"],
    },
  };

  // Test Fixture: MPU-6050 IMU Sensor
  const mpu6050 = {
    id: "part_mpu6050",
    mpn: "MPU-6050",
    category: ComponentCategory.SENSOR,
    specs: {
      carrierModuleSupplyVoltageV: "3.3V - 5.0V (onboard RT9161 LDO)",
      sensorSupplyVoltageMinV: 2.375,
      sensorSupplyVoltageMaxV: 3.46,
      logicVoltageV: 3.3,
      interface: ["I2C"],
      i2cAddressHex: "0x68 (AD0=GND) / 0x69 (AD0=VCC)",
    },
  };

  // Test Fixture: LM2596 Buck Converter
  const lm2596 = {
    id: "part_lm2596",
    mpn: "LM2596S-ADJ",
    category: ComponentCategory.POWER_MODULE,
    specs: {
      inputVoltageMinV: 4.5,
      inputVoltageMaxV: 40.0,
      outputVoltageMinV: 1.23,
      outputVoltageMaxV: 37.0,
      maxOutputCurrentA: 3.0,
    },
  };

  // Test Fixture: NEMA 17 Stepper Motor
  const nema17 = {
    id: "part_nema17",
    mpn: "17HS4401",
    category: ComponentCategory.MOTOR,
    specs: {
      stepAngleDeg: 1.8,
      stepsPerRevolution: 200,
      ratedVoltageV: 12.0,
      ratedCurrentPerPhaseA: 1.7,
      frameSizeMm: 42.0,
      shaftDiameterMm: 5.0,
      leadWiresCount: 4,
    },
  };

  // Test Fixture: JST-XH 4-pin Connector (Strict 2.50mm Metric Pitch)
  const jst4p = {
    id: "part_jst4p",
    mpn: "B4B-XH-A",
    category: ComponentCategory.CONNECTOR,
    specs: {
      pitchMm: 2.50,
      pinCount: 4,
      ratedCurrentA: 3.0,
      ratedVoltageV: 250,
    },
  };

  // ---------------------------------------------------------------------------
  // 1. Fully Compatible Combinations (VERIFIED)
  // ---------------------------------------------------------------------------
  describe("1. Fully Compatible Combinations (VERIFIED)", () => {
    it("should classify TMC2209 as VERIFIED for 24V supply, 1.2A load, 3.3V logic, and STEP_DIR", () => {
      const context: TargetHardwareContext = {
        hostBoard: "Voron 2.4",
        supplyVoltageV: 24.0,
        loadCurrentA: 1.2,
        logicVoltageV: 3.3,
        requiredProtocols: ["STEP_DIR"],
      };

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("VERIFIED");
      expect(report.confidenceScore).toBe(1.0);
      expect(report.failedCount).toBe(0);
      expect(report.unknownCount).toBe(0);
      expect(report.missingRequiredSpecs).toHaveLength(0);
      expect(report.summary).toContain("pass based on documented manufacturer specifications");
    });

    it("should classify LM2596 as VERIFIED for 24V input, 5.0V output, and 2.0A load", () => {
      const context: TargetHardwareContext = {
        supplyVoltageV: 24.0,
        targetOutputVoltageV: 5.0,
        loadCurrentA: 2.0,
      };

      const report = evaluateCompatibility(lm2596, context);

      expect(report.tier).toBe("VERIFIED");
      expect(report.confidenceScore).toBe(1.0);
      expect(report.failedCount).toBe(0);
      expect(report.unknownCount).toBe(0);
    });

    it("should classify JST-XH 4-pin as VERIFIED ONLY when exact 2.50mm pitch is matched", () => {
      const context: TargetHardwareContext = {
        connectorPinCount: 4,
        connectorPitchMm: 2.50, // Exact metric match
        circuitCurrentA: 1.5,
      };

      const report = evaluateCompatibility(jst4p, context);

      expect(report.tier).toBe("VERIFIED");
      expect(report.failedCount).toBe(0);
      expect(report.unknownCount).toBe(0);
    });

    it("should classify NEMA 17 as VERIFIED for bipolar stepper, 1.7A driver, 42mm frame, 5mm shaft", () => {
      const context: TargetHardwareContext = {
        motorType: "STEPPER_BIPOLAR",
        loadCurrentA: 1.7,
        motorFrameSizeMm: 42,
        motorShaftDiameterMm: 5.0,
      };

      const report = evaluateCompatibility(nema17, context);

      expect(report.tier).toBe("VERIFIED");
      expect(report.confidenceScore).toBe(1.0);
      expect(report.failedCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. JST Connector Pitch Strictness (2.50mm vs 2.54mm)
  // ---------------------------------------------------------------------------
  describe("2. JST Connector Pitch Audit (Strict 2.50mm vs 2.54mm Non-Interchangeability)", () => {
    it("should FAIL JST-XH when mating to standard 2.54mm header (0.100 inch)", () => {
      const context: TargetHardwareContext = {
        connectorPinCount: 4,
        connectorPitchMm: 2.54, // Imperial standard (0.100")
        circuitCurrentA: 1.5,
      };

      const report = evaluateCompatibility(jst4p, context);

      expect(report.tier).toBe("UNVERIFIED");
      expect(report.failedCount).toBe(1);
      const pitchCheck = report.conditions.find((c) => c.name === "Pin Pitch");
      expect(pitchCheck?.status).toBe("FAILED");
      expect(pitchCheck?.message).toContain("2.50mm and 2.54mm are NOT interchangeable");
      expect(pitchCheck?.message).toContain("terminal splay");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TMC2209 Current Rating Audit (Silicon vs PCB Thermal Dissipation)
  // ---------------------------------------------------------------------------
  describe("3. TMC2209 Current Rating Audit (Silicon IC vs Breakout Board Thermal Dissipation)", () => {
    it("should flag thermal boundary warning when current is between 1.4A and 2.0A RMS", () => {
      const context: TargetHardwareContext = {
        supplyVoltageV: 24.0,
        loadCurrentA: 1.8, // Above 1.4A passive PCB limit, but within 2.0A IC limit
        logicVoltageV: 3.3,
        requiredProtocols: ["STEP_DIR"],
      };

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("VERIFIED");
      const currentCheck = report.conditions.find((c) => c.name.includes("Thermal Boundary"));
      expect(currentCheck?.status).toBe("PASSED");
      expect(currentCheck?.message).toContain("Forced fan airflow and heatsink are mandatory");
    });

    it("should FAIL when current exceeds 2.0A RMS silicon IC limit", () => {
      const context: TargetHardwareContext = {
        supplyVoltageV: 24.0,
        loadCurrentA: 2.5, // Exceeds silicon max 2.0A
        logicVoltageV: 3.3,
        requiredProtocols: ["STEP_DIR"],
      };

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("UNVERIFIED");
      const currentCheck = report.conditions.find((c) => c.name === "Current Capacity");
      expect(currentCheck?.status).toBe("FAILED");
      expect(currentCheck?.message).toContain("exceeds driver silicon rating");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Voltage Mismatch (UNVERIFIED)
  // ---------------------------------------------------------------------------
  describe("4. Voltage Mismatch (UNVERIFIED)", () => {
    it("should fail TMC2209 when motor supply voltage exceeds maximum (48V on 29V max)", () => {
      const context: TargetHardwareContext = {
        supplyVoltageV: 48.0, // Exceeds 29.0V max
        loadCurrentA: 1.2,
        logicVoltageV: 3.3,
        requiredProtocols: ["STEP_DIR"],
      };

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("UNVERIFIED");
      const voltageCheck = report.conditions.find((c) => c.name === "Motor Supply Voltage");
      expect(voltageCheck?.status).toBe("FAILED");
      expect(voltageCheck?.message).toContain("outside driver operating limits");
    });

    it("should fail LM2596 when input voltage exceeds regulator maximum (48V on 40V max)", () => {
      const context: TargetHardwareContext = {
        supplyVoltageV: 48.0,
        targetOutputVoltageV: 12.0,
        loadCurrentA: 1.0,
      };

      const report = evaluateCompatibility(lm2596, context);

      expect(report.tier).toBe("UNVERIFIED");
      const inputCheck = report.conditions.find((c) => c.name === "Input Voltage Range");
      expect(inputCheck?.status).toBe("FAILED");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Logic-Level Mismatch (UNVERIFIED)
  // ---------------------------------------------------------------------------
  describe("5. Logic-Level Mismatch (UNVERIFIED)", () => {
    it("should fail ESP32 when host is 5.0V and module is non-tolerant 3.3V", () => {
      const context: TargetHardwareContext = {
        logicVoltageV: 5.0, // Host is strict 5V (e.g. Arduino Uno R3 IO)
        requiredProtocols: ["UART"],
      };

      const report = evaluateCompatibility(esp32, context);

      expect(report.tier).toBe("UNVERIFIED");
      const logicCheck = report.conditions.find((c) => c.name === "Logic Level Compatibility");
      expect(logicCheck?.status).toBe("FAILED");
      expect(logicCheck?.message).toContain("not 5V tolerant");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Unsupported Communication Protocol (UNVERIFIED)
  // ---------------------------------------------------------------------------
  describe("6. Unsupported Communication Protocol (UNVERIFIED)", () => {
    it("should fail MPU-6050 when target requires SPI bus (MPU-6050 is I2C only)", () => {
      const context: TargetHardwareContext = {
        logicVoltageV: 3.3,
        supplyVoltageV: 3.3,
        requiredProtocols: ["SPI"], // MPU-6050 has interface: ["I2C"]
      };

      const report = evaluateCompatibility(mpu6050, context);

      expect(report.tier).toBe("UNVERIFIED");
      const protocolCheck = report.conditions.find((c) => c.name.includes("Protocol Support"));
      expect(protocolCheck?.status).toBe("FAILED");
      expect(protocolCheck?.message).toContain("does not support required protocol: SPI");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Missing Mandatory Specifications Cannot Silently Pass as Compatible (POSSIBLE)
  // ---------------------------------------------------------------------------
  describe("7. Missing Mandatory Specifications Audit (Must be POSSIBLE, Never VERIFIED)", () => {
    it("should classify driver as POSSIBLE when required protocol is missing", () => {
      // Missing requiredProtocols
      const context: TargetHardwareContext = {
        supplyVoltageV: 24.0,
        loadCurrentA: 1.2,
        logicVoltageV: 3.3,
      };

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("POSSIBLE");
      expect(report.tier).not.toBe("VERIFIED");
      expect(report.unknownCount).toBeGreaterThan(0);
      expect(report.missingRequiredSpecs).toContain("host control interface protocol (e.g. STEP_DIR, PWM)");
    });

    it("should classify regulator as POSSIBLE when target output voltage is missing", () => {
      // Missing targetOutputVoltageV
      const context: TargetHardwareContext = {
        supplyVoltageV: 24.0,
        loadCurrentA: 2.0,
      };

      const report = evaluateCompatibility(lm2596, context);

      expect(report.tier).toBe("POSSIBLE");
      expect(report.tier).not.toBe("VERIFIED");
      expect(report.missingRequiredSpecs).toContain("desired regulated output voltage (Vout)");
    });

    it("should classify connector as POSSIBLE if user did not provide connector pitch", () => {
      const context: TargetHardwareContext = {
        connectorPinCount: 4,
        circuitCurrentA: 1.5,
      };

      const report = evaluateCompatibility(jst4p, context);

      expect(report.tier).toBe("POSSIBLE");
      expect(report.tier).not.toBe("VERIFIED");
      expect(report.missingRequiredSpecs).toContain("target header pin pitch (e.g. 2.50mm vs 2.54mm)");
    });

    it("should classify motor as POSSIBLE if motor topology or mount size is missing", () => {
      const context: TargetHardwareContext = {
        loadCurrentA: 1.7,
      };

      const report = evaluateCompatibility(nema17, context);

      expect(report.tier).toBe("POSSIBLE");
      expect(report.tier).not.toBe("VERIFIED");
      expect(report.missingRequiredSpecs).toContain("target motor topology (e.g. STEPPER_BIPOLAR)");
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Empty Context Combinations (UNVERIFIED)
  // ---------------------------------------------------------------------------
  describe("8. Empty Context Combinations (UNVERIFIED)", () => {
    it("should classify as UNVERIFIED with confidence 0.0 when target context is empty", () => {
      const context: TargetHardwareContext = {};

      const report = evaluateCompatibility(tmc2209, context);

      expect(report.tier).toBe("UNVERIFIED");
      expect(report.confidenceScore).toBe(0.0);
      expect(report.unknownCount).toBeGreaterThan(0);
      expect(report.summary).toContain("Target hardware specifications required");
    });
  });
});
