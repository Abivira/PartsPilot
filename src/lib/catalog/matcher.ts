import { ComponentCategory } from "@prisma/client";
import {
  CompatibilityReport,
  CompatibilityTier,
  ConditionEvaluation,
  TargetHardwareContext,
} from "@/types/compatibility";

/**
 * Deterministic Compatibility Engine for Electronics and Robotics.
 * Pure functional evaluation: Given component specifications and target hardware constraints,
 * evaluates every mandatory and elective condition deterministically.
 *
 * Invariants:
 * 1. Missing mandatory parameters MUST NOT pass silently.
 * 2. 2.50mm (metric) and 2.54mm (imperial) connector pitches are NOT interchangeable.
 * 3. TMC2209 IC silicon ratings (2.0A RMS) must be distinguished from PCB breakout thermal dissipation limits (~1.2A-1.4A).
 * 4. VERIFIED means all mandatory checks pass with documented evidence; it does not replace physical pinout verification.
 */

interface ComponentInput {
  id?: string;
  mpn: string;
  category: ComponentCategory;
  name?: string;
  specs: Record<string, unknown>;
  supportedPlatforms?: string[];
}

export function evaluateCompatibility(
  component: ComponentInput,
  target: TargetHardwareContext
): CompatibilityReport {
  const conditions: ConditionEvaluation[] = [];
  const missingRequiredSpecs: string[] = [];

  // Route to category-specific validator
  switch (component.category) {
    case ComponentCategory.MOTOR_DRIVER:
      evaluateMotorDriver(component.specs, target, conditions, missingRequiredSpecs);
      break;
    case ComponentCategory.SENSOR:
      evaluateSensor(component.specs, target, conditions, missingRequiredSpecs);
      break;
    case ComponentCategory.POWER_MODULE:
      evaluatePowerModule(component.specs, target, conditions, missingRequiredSpecs);
      break;
    case ComponentCategory.MOTOR:
      evaluateMotor(component.specs, target, conditions, missingRequiredSpecs);
      break;
    case ComponentCategory.CONNECTOR:
      evaluateConnector(component.specs, target, conditions, missingRequiredSpecs);
      break;
    case ComponentCategory.MICROCONTROLLER:
      evaluateMicrocontroller(component.specs, target, conditions, missingRequiredSpecs);
      break;
    default:
      evaluateGeneric(component.specs, target, conditions, missingRequiredSpecs);
      break;
  }

  // Check supported platform hints if hostBoard is supplied
  if (target.hostBoard && target.hostBoard.trim().length > 0) {
    evaluatePlatformMatch(component.supportedPlatforms ?? [], target.hostBoard, conditions);
  }

  // Compute counts
  const passedCount = conditions.filter((c) => c.status === "PASSED").length;
  const failedCount = conditions.filter((c) => c.status === "FAILED").length;
  const unknownCount = conditions.filter((c) => c.status === "UNKNOWN").length;
  const totalCount = conditions.length;

  // Determine Compatibility Tier
  // Rule 1: Any FAILED condition = UNVERIFIED (incompatible)
  // Rule 2: If no FAILED, but missing required specs or any UNKNOWN condition = POSSIBLE (potential match, verification incomplete)
  // Rule 3: If ALL conditions PASSED, totalCount > 0, and no missing required specs = VERIFIED
  let tier: CompatibilityTier = "UNVERIFIED";
  let confidenceScore = 0.0;
  let summary = "";

  if (totalCount === 0 || passedCount === 0) {
    tier = "UNVERIFIED";
    confidenceScore = 0.0;
    summary =
      passedCount === 0
        ? `Insufficient evidence: all ${unknownCount} evaluated constraint(s) are unknown. Target hardware specifications required to evaluate compatibility.`
        : "No target constraints provided to evaluate compatibility.";
  } else if (failedCount > 0) {
    tier = "UNVERIFIED";
    confidenceScore = Math.max(0, 0.4 - failedCount * 0.15);
    const failReasons = conditions
      .filter((c) => c.status === "FAILED")
      .map((c) => c.name)
      .join(", ");
    summary = `Incompatibility detected in ${failedCount} constraint(s): ${failReasons}.`;
  } else if (unknownCount > 0 || missingRequiredSpecs.length > 0) {
    tier = "POSSIBLE";
    // Scale confidence between 0.50 and 0.85 depending on ratio of passed to total
    confidenceScore = Math.min(0.85, Math.max(0.5, Number((passedCount / totalCount).toFixed(2))));
    const missingList = Array.from(new Set(missingRequiredSpecs)).join(", ");
    summary = `Potential match: ${passedCount} check(s) passed, but requires user verification for: ${missingList || "unspecified constraints"}.`;
  } else {
    tier = "VERIFIED";
    confidenceScore = 1.0;
    summary = `All ${passedCount} evaluated mandatory electrical, voltage, and interface constraints pass based on documented manufacturer specifications. Always cross-verify pinout mapping and thermal limits before powering on.`;
  }

  return {
    partId: component.id,
    mpn: component.mpn,
    category: component.category,
    tier,
    confidenceScore,
    summary,
    conditions,
    passedCount,
    failedCount,
    unknownCount,
    missingRequiredSpecs: Array.from(new Set(missingRequiredSpecs)),
    evaluatedAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Category Evaluators
// -----------------------------------------------------------------------------

function evaluateMotorDriver(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // 1. Motor Voltage Supply
  const minV = getNumber(specs.supplyVoltageMinV);
  const maxV = getNumber(specs.supplyVoltageMaxV);

  if (target.supplyVoltageV !== undefined) {
    if (minV !== undefined && maxV !== undefined) {
      if (target.supplyVoltageV >= minV && target.supplyVoltageV <= maxV) {
        conditions.push({
          name: "Motor Supply Voltage",
          status: "PASSED",
          message: `Target supply ${target.supplyVoltageV}V is within driver rated operating range (${minV}V - ${maxV}V).`,
          expected: `${minV}V - ${maxV}V`,
          actual: `${target.supplyVoltageV}V`,
        });
      } else {
        conditions.push({
          name: "Motor Supply Voltage",
          status: "FAILED",
          message: `Target supply ${target.supplyVoltageV}V is outside driver operating limits (${minV}V - ${maxV}V). Overvoltage risks silicon breakdown; undervoltage triggers lockout.`,
          expected: `${minV}V - ${maxV}V`,
          actual: `${target.supplyVoltageV}V`,
        });
      }
    } else {
      missingRequiredSpecs.push("driver supply voltage limits (min/max)");
      conditions.push({
        name: "Motor Supply Voltage",
        status: "UNKNOWN",
        message: "Driver specification does not define clear supply voltage limits.",
      });
    }
  } else {
    missingRequiredSpecs.push("target motor supply voltage");
    conditions.push({
      name: "Motor Supply Voltage",
      status: "UNKNOWN",
      message: "Target motor supply voltage not provided in context.",
    });
  }

  // 2. Current Capacity & Breakout Board Thermal Capability
  const siliconMaxCurrentA =
    getNumber(specs.maxCurrentContinuousA) ??
    getNumber(specs.maxCurrentRmsA) ??
    getNumber(specs.maxCurrentPeakA);
  const practicalPcbLimitA = getNumber(specs.practicalContinuousCurrentA) ?? 1.4;

  if (target.loadCurrentA !== undefined) {
    if (siliconMaxCurrentA !== undefined) {
      if (target.loadCurrentA > siliconMaxCurrentA) {
        conditions.push({
          name: "Current Capacity",
          status: "FAILED",
          message: `Target motor load (${target.loadCurrentA}A) exceeds driver silicon rating (${siliconMaxCurrentA}A RMS). Overcurrent will trigger thermal shutdown or destroy internal MOSFETs.`,
          expected: `<= ${siliconMaxCurrentA}A RMS`,
          actual: `${target.loadCurrentA}A`,
        });
      } else if (target.loadCurrentA > practicalPcbLimitA) {
        // Target current is within silicon limit but exceeds standard breakout passive dissipation
        conditions.push({
          name: "Current Capacity (Thermal Boundary)",
          status: "PASSED",
          message: `Target current (${target.loadCurrentA}A) is within IC silicon rating (${siliconMaxCurrentA}A RMS), but exceeds typical passive StepStick PCB dissipation (~${practicalPcbLimitA}A). Forced fan airflow and heatsink are mandatory to prevent thermal throttling.`,
          expected: `<= ${siliconMaxCurrentA}A RMS (active cooling required > ${practicalPcbLimitA}A)`,
          actual: `${target.loadCurrentA}A`,
        });
      } else {
        conditions.push({
          name: "Current Capacity",
          status: "PASSED",
          message: `Driver rated capacity (${siliconMaxCurrentA}A RMS) accommodates target load (${target.loadCurrentA}A). Operation is within safe thermal bounds for standard carrier heatsinks.`,
          expected: `>= ${target.loadCurrentA}A`,
          actual: `${target.loadCurrentA}A`,
        });
      }
    } else {
      missingRequiredSpecs.push("driver rated current capacity");
      conditions.push({
        name: "Current Capacity",
        status: "UNKNOWN",
        message: "Driver current rating not found in component specifications.",
      });
    }
  } else {
    missingRequiredSpecs.push("target motor load current");
    conditions.push({
      name: "Current Capacity",
      status: "UNKNOWN",
      message: "Target motor load current not provided.",
    });
  }

  // 3. Logic Voltage Compatibility
  checkLogicVoltage(specs, target, conditions, missingRequiredSpecs);

  // 4. Control Interface Protocol
  if (target.requiredProtocols && target.requiredProtocols.length > 0) {
    const supportedProtocols = getStringArray(specs.controlInterface) ?? [];
    checkProtocols(supportedProtocols, target.requiredProtocols, conditions, missingRequiredSpecs);
  } else {
    missingRequiredSpecs.push("host control interface protocol (e.g. STEP_DIR, PWM)");
    conditions.push({
      name: "Control Interface",
      status: "UNKNOWN",
      message: "Target host control interface protocol not specified.",
    });
  }
}

function evaluateSensor(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // 1. Operating / Carrier Voltage
  const minV = getNumber(specs.sensorSupplyVoltageMinV);
  const maxV = getNumber(specs.sensorSupplyVoltageMaxV);
  const carrierV = specs.carrierModuleSupplyVoltageV;

  const testV = target.supplyVoltageV ?? target.logicVoltageV;

  if (testV !== undefined) {
    if (typeof carrierV === "string" && carrierV.includes("3.3V") && carrierV.includes("5.0V")) {
      conditions.push({
        name: "Sensor Operating Voltage",
        status: "PASSED",
        message: `Sensor carrier module features wide dual-voltage input support (${carrierV}).`,
        expected: "3.3V or 5.0V",
        actual: `${testV}V`,
      });
    } else if (minV !== undefined && maxV !== undefined) {
      if (testV >= minV && testV <= maxV) {
        conditions.push({
          name: "Sensor Operating Voltage",
          status: "PASSED",
          message: `Supply voltage ${testV}V is within sensor operating range (${minV}V - ${maxV}V).`,
          expected: `${minV}V - ${maxV}V`,
          actual: `${testV}V`,
        });
      } else {
        conditions.push({
          name: "Sensor Operating Voltage",
          status: "FAILED",
          message: `Supply voltage ${testV}V violates sensor limits (${minV}V - ${maxV}V).`,
          expected: `${minV}V - ${maxV}V`,
          actual: `${testV}V`,
        });
      }
    } else {
      missingRequiredSpecs.push("sensor supply voltage range");
      conditions.push({
        name: "Sensor Operating Voltage",
        status: "UNKNOWN",
        message: "Sensor voltage specifications incomplete.",
      });
    }
  } else {
    missingRequiredSpecs.push("target sensor power supply voltage");
    conditions.push({
      name: "Sensor Operating Voltage",
      status: "UNKNOWN",
      message: "Target voltage not specified in context.",
    });
  }

  // 2. Logic Level Compatibility
  checkLogicVoltage(specs, target, conditions, missingRequiredSpecs);

  // 3. Communication Protocol
  if (target.requiredProtocols && target.requiredProtocols.length > 0) {
    const supported = getStringArray(specs.interface) ?? [];
    checkProtocols(supported, target.requiredProtocols, conditions, missingRequiredSpecs);
  } else {
    missingRequiredSpecs.push("host communication bus (e.g. I2C, SPI)");
    conditions.push({
      name: "Communication Protocol",
      status: "UNKNOWN",
      message: "Target communication protocol not specified.",
    });
  }

  // 4. I2C Address Collision (if applicable)
  const i2cAddr = getString(specs.i2cAddressHex) ?? getString(specs.defaultI2cAddressHex);
  if (i2cAddr && target.existingI2cAddresses && target.existingI2cAddresses.length > 0) {
    const normalizedTargetAddresses = target.existingI2cAddresses.map((a) => a.toLowerCase().trim());
    const isConflict = normalizedTargetAddresses.some((a) => i2cAddr.toLowerCase().includes(a));

    if (isConflict) {
      if (i2cAddr.includes("/") || i2cAddr.includes("reconfigurable") || i2cAddr.includes("AD0") || i2cAddr.includes("XSHUT")) {
        conditions.push({
          name: "I2C Address Conflict",
          status: "PASSED",
          message: `Potential I2C address match (${i2cAddr}), but sensor supports address reconfiguration via hardware pin (e.g. AD0/XSHUT).`,
          expected: "Non-colliding or reconfigurable address",
          actual: i2cAddr,
        });
      } else {
        conditions.push({
          name: "I2C Address Conflict",
          status: "FAILED",
          message: `I2C address collision detected with existing device on bus (${i2cAddr}).`,
          expected: "Unique I2C bus address",
          actual: i2cAddr,
        });
      }
    } else {
      conditions.push({
        name: "I2C Address Conflict",
        status: "PASSED",
        message: `Sensor address (${i2cAddr}) does not collide with existing bus devices.`,
        expected: "Unique address",
        actual: i2cAddr,
      });
    }
  }
}

function evaluatePowerModule(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // 1. Input Voltage
  const minIn = getNumber(specs.inputVoltageMinV);
  const maxIn = getNumber(specs.inputVoltageMaxV);

  if (target.supplyVoltageV !== undefined) {
    if (minIn !== undefined && maxIn !== undefined) {
      if (target.supplyVoltageV >= minIn && target.supplyVoltageV <= maxIn) {
        conditions.push({
          name: "Input Voltage Range",
          status: "PASSED",
          message: `Source voltage ${target.supplyVoltageV}V is within regulator input range (${minIn}V - ${maxIn}V).`,
          expected: `${minIn}V - ${maxIn}V`,
          actual: `${target.supplyVoltageV}V`,
        });
      } else {
        conditions.push({
          name: "Input Voltage Range",
          status: "FAILED",
          message: `Source voltage ${target.supplyVoltageV}V is outside regulator input limits (${minIn}V - ${maxIn}V).`,
          expected: `${minIn}V - ${maxIn}V`,
          actual: `${target.supplyVoltageV}V`,
        });
      }
    } else {
      missingRequiredSpecs.push("regulator input voltage limits");
      conditions.push({
        name: "Input Voltage Range",
        status: "UNKNOWN",
        message: "Regulator input specifications missing.",
      });
    }
  } else {
    missingRequiredSpecs.push("source supply voltage (Vin)");
    conditions.push({
      name: "Input Voltage Range",
      status: "UNKNOWN",
      message: "Source supply voltage not specified in context.",
    });
  }

  // 2. Output Voltage Capability
  const minOut = getNumber(specs.outputVoltageMinV);
  const maxOut = getNumber(specs.outputVoltageMaxV);

  if (target.targetOutputVoltageV !== undefined) {
    if (minOut !== undefined && maxOut !== undefined) {
      if (target.targetOutputVoltageV >= minOut && target.targetOutputVoltageV <= maxOut) {
        conditions.push({
          name: "Output Voltage Regulation",
          status: "PASSED",
          message: `Desired output ${target.targetOutputVoltageV}V is achievable within regulator range (${minOut}V - ${maxOut}V).`,
          expected: `${minOut}V - ${maxOut}V`,
          actual: `${target.targetOutputVoltageV}V`,
        });
      } else {
        conditions.push({
          name: "Output Voltage Regulation",
          status: "FAILED",
          message: `Target output ${target.targetOutputVoltageV}V is outside regulator range (${minOut}V - ${maxOut}V).`,
          expected: `${minOut}V - ${maxOut}V`,
          actual: `${target.targetOutputVoltageV}V`,
        });
      }
    } else {
      missingRequiredSpecs.push("regulator output voltage range");
      conditions.push({
        name: "Output Voltage Regulation",
        status: "UNKNOWN",
        message: "Regulator output range not defined in datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("desired regulated output voltage (Vout)");
    conditions.push({
      name: "Output Voltage Regulation",
      status: "UNKNOWN",
      message: "Target regulated output voltage not specified.",
    });
  }

  // 3. Maximum Output Current
  const maxCurrentA = getNumber(specs.maxOutputCurrentA);
  if (target.loadCurrentA !== undefined) {
    if (maxCurrentA !== undefined) {
      if (maxCurrentA >= target.loadCurrentA) {
        conditions.push({
          name: "Output Current Capacity",
          status: "PASSED",
          message: `Regulator capacity (${maxCurrentA}A) satisfies required load (${target.loadCurrentA}A).`,
          expected: `>= ${target.loadCurrentA}A`,
          actual: `${maxCurrentA}A`,
        });
      } else {
        conditions.push({
          name: "Output Current Capacity",
          status: "FAILED",
          message: `Regulator max output (${maxCurrentA}A) is insufficient for load (${target.loadCurrentA}A). Regulator will enter thermal shutdown or drop voltage under load.`,
          expected: `>= ${target.loadCurrentA}A`,
          actual: `${maxCurrentA}A`,
        });
      }
    } else {
      missingRequiredSpecs.push("regulator max output current");
      conditions.push({
        name: "Output Current Capacity",
        status: "UNKNOWN",
        message: "Regulator max output current not defined in datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("expected circuit load current");
    conditions.push({
      name: "Output Current Capacity",
      status: "UNKNOWN",
      message: "Target load current not specified.",
    });
  }
}

function evaluateMotor(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // 1. Motor Type / Topology
  if (target.motorType !== undefined) {
    const isStepper = specs.stepAngleDeg !== undefined || specs.stepsPerRevolution !== undefined;
    if (target.motorType === "STEPPER_BIPOLAR") {
      if (isStepper && specs.leadWiresCount === 4) {
        conditions.push({
          name: "Motor Topology",
          status: "PASSED",
          message: "Motor is a verified 4-wire bipolar stepper motor.",
          expected: "STEPPER_BIPOLAR",
          actual: "4-wire bipolar stepper",
        });
      } else {
        conditions.push({
          name: "Motor Topology",
          status: "FAILED",
          message: "Target requires bipolar stepper motor; component specifications do not match.",
          expected: "STEPPER_BIPOLAR",
          actual: isStepper ? `${specs.leadWiresCount}-wire stepper` : "Non-stepper",
        });
      }
    }
  } else {
    missingRequiredSpecs.push("target motor topology (e.g. STEPPER_BIPOLAR)");
    conditions.push({
      name: "Motor Topology",
      status: "UNKNOWN",
      message: "Target motor topology not specified in context.",
    });
  }

  // 2. Rated Current per Phase
  const ratedCurrentA = getNumber(specs.ratedCurrentPerPhaseA);
  if (target.loadCurrentA !== undefined) {
    if (ratedCurrentA !== undefined) {
      if (ratedCurrentA <= target.loadCurrentA * 1.25) {
        conditions.push({
          name: "Phase Current Compatibility",
          status: "PASSED",
          message: `Motor rated phase current (${ratedCurrentA}A) matches driver delivery capability (${target.loadCurrentA}A).`,
          expected: `~${target.loadCurrentA}A`,
          actual: `${ratedCurrentA}A`,
        });
      } else {
        conditions.push({
          name: "Phase Current Compatibility",
          status: "FAILED",
          message: `Motor rated current (${ratedCurrentA}A) exceeds target driver capacity (${target.loadCurrentA}A). Motor will produce reduced torque or driver will overheat.`,
          expected: `<= ${target.loadCurrentA}A`,
          actual: `${ratedCurrentA}A`,
        });
      }
    } else {
      missingRequiredSpecs.push("motor rated current per phase");
      conditions.push({
        name: "Phase Current Compatibility",
        status: "UNKNOWN",
        message: "Motor rated current not found in datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("driver phase current delivery capacity");
    conditions.push({
      name: "Phase Current Compatibility",
      status: "UNKNOWN",
      message: "Target driver phase current delivery not specified.",
    });
  }

  // 3. Mechanical Frame Size
  const frameMm = getNumber(specs.frameSizeMm);
  if (target.motorFrameSizeMm !== undefined) {
    if (frameMm !== undefined) {
      if (Math.abs(frameMm - target.motorFrameSizeMm) < 1.0) {
        conditions.push({
          name: "Mechanical Frame Size",
          status: "PASSED",
          message: `Motor frame size (${frameMm}mm) matches target mount pattern (${target.motorFrameSizeMm}mm).`,
          expected: `${target.motorFrameSizeMm}mm`,
          actual: `${frameMm}mm`,
        });
      } else {
        conditions.push({
          name: "Mechanical Frame Size",
          status: "FAILED",
          message: `Motor frame size (${frameMm}mm) does not match target mount pattern (${target.motorFrameSizeMm}mm). Physical mounting is impossible without an adapter bracket.`,
          expected: `${target.motorFrameSizeMm}mm`,
          actual: `${frameMm}mm`,
        });
      }
    } else {
      missingRequiredSpecs.push("motor mechanical frame size");
      conditions.push({
        name: "Mechanical Frame Size",
        status: "UNKNOWN",
        message: "Motor frame dimensions missing from datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("target mounting frame size (e.g. 42mm for NEMA 17)");
    conditions.push({
      name: "Mechanical Frame Size",
      status: "UNKNOWN",
      message: "Target mounting pattern dimensions not specified.",
    });
  }

  // 4. Shaft Diameter (Elective mechanical verification)
  const shaftMm = getNumber(specs.shaftDiameterMm);
  if (target.motorShaftDiameterMm !== undefined) {
    if (shaftMm !== undefined) {
      if (Math.abs(shaftMm - target.motorShaftDiameterMm) < 0.1) {
        conditions.push({
          name: "Shaft Diameter",
          status: "PASSED",
          message: `Motor shaft diameter (${shaftMm}mm) matches coupler (${target.motorShaftDiameterMm}mm).`,
          expected: `${target.motorShaftDiameterMm}mm`,
          actual: `${shaftMm}mm`,
        });
      } else {
        conditions.push({
          name: "Shaft Diameter",
          status: "FAILED",
          message: `Shaft diameter (${shaftMm}mm) does not fit target coupler (${target.motorShaftDiameterMm}mm).`,
          expected: `${target.motorShaftDiameterMm}mm`,
          actual: `${shaftMm}mm`,
        });
      }
    }
  }
}

function evaluateConnector(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // 1. Pin Count
  const pins = getNumber(specs.pinCount);
  if (target.connectorPinCount !== undefined) {
    if (pins !== undefined) {
      if (pins === target.connectorPinCount) {
        conditions.push({
          name: "Pin Count",
          status: "PASSED",
          message: `Connector pin count (${pins}) matches target requirement (${target.connectorPinCount}).`,
          expected: target.connectorPinCount,
          actual: pins,
        });
      } else {
        conditions.push({
          name: "Pin Count",
          status: "FAILED",
          message: `Pin count mismatch: connector has ${pins} pins, target requires ${target.connectorPinCount}.`,
          expected: target.connectorPinCount,
          actual: pins,
        });
      }
    } else {
      missingRequiredSpecs.push("connector pin count");
      conditions.push({
        name: "Pin Count",
        status: "UNKNOWN",
        message: "Connector pin count not specified in datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("target connector pin count");
    conditions.push({
      name: "Pin Count",
      status: "UNKNOWN",
      message: "Target connector pin count not specified.",
    });
  }

  // 2. Pin Pitch (STRICT: 2.50mm metric and 2.54mm imperial are NOT interchangeable)
  const pitchMm = getNumber(specs.pitchMm);
  if (target.connectorPitchMm !== undefined) {
    if (pitchMm !== undefined) {
      // Strict mechanical tolerance: +/- 0.02mm
      const isPitchMatch = Math.abs(pitchMm - target.connectorPitchMm) <= 0.02;

      if (isPitchMatch) {
        conditions.push({
          name: "Pin Pitch",
          status: "PASSED",
          message: `Connector pitch (${pitchMm.toFixed(2)}mm) matches target header specification (${target.connectorPitchMm.toFixed(2)}mm).`,
          expected: `${target.connectorPitchMm.toFixed(2)}mm`,
          actual: `${pitchMm.toFixed(2)}mm`,
        });
      } else {
        const isCommonConfusion =
          (Math.abs(pitchMm - 2.5) <= 0.01 && Math.abs(target.connectorPitchMm - 2.54) <= 0.01) ||
          (Math.abs(pitchMm - 2.54) <= 0.01 && Math.abs(target.connectorPitchMm - 2.5) <= 0.01);

        const explanation = isCommonConfusion
          ? `Pitch mismatch: Component has ${pitchMm.toFixed(2)}mm pitch (metric JST XH standard), but target specifies ${target.connectorPitchMm.toFixed(2)}mm (0.100" imperial standard). 2.50mm and 2.54mm are NOT interchangeable: multi-pin headers accumulate spacing error (0.12mm+ on 4 pins), causing terminal splay, damaged pins, and intermittent contact.`
          : `Pitch mismatch: Connector has ${pitchMm.toFixed(2)}mm pitch, but target requires ${target.connectorPitchMm.toFixed(2)}mm. Physical mating is impossible.`;

        conditions.push({
          name: "Pin Pitch",
          status: "FAILED",
          message: explanation,
          expected: `${target.connectorPitchMm.toFixed(2)}mm`,
          actual: `${pitchMm.toFixed(2)}mm`,
        });
      }
    } else {
      missingRequiredSpecs.push("connector pin pitch");
      conditions.push({
        name: "Pin Pitch",
        status: "UNKNOWN",
        message: "Connector pitch dimension missing from component datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("target header pin pitch (e.g. 2.50mm vs 2.54mm)");
    conditions.push({
      name: "Pin Pitch",
      status: "UNKNOWN",
      message: "Target header pin pitch not specified.",
    });
  }

  // 3. Current Rating
  const ratedA = getNumber(specs.ratedCurrentA);
  if (target.circuitCurrentA !== undefined) {
    if (ratedA !== undefined) {
      if (ratedA >= target.circuitCurrentA) {
        conditions.push({
          name: "Current Rating",
          status: "PASSED",
          message: `Connector rating (${ratedA}A) accommodates circuit current (${target.circuitCurrentA}A).`,
          expected: `>= ${target.circuitCurrentA}A`,
          actual: `${ratedA}A`,
        });
      } else {
        conditions.push({
          name: "Current Rating",
          status: "FAILED",
          message: `Connector rating (${ratedA}A) is insufficient for circuit current (${target.circuitCurrentA}A). High risk of terminal contact overheating.`,
          expected: `>= ${target.circuitCurrentA}A`,
          actual: `${ratedA}A`,
        });
      }
    } else {
      missingRequiredSpecs.push("connector rated contact current");
      conditions.push({
        name: "Current Rating",
        status: "UNKNOWN",
        message: "Connector current rating not found in component datasheet.",
      });
    }
  } else {
    missingRequiredSpecs.push("target circuit operating current");
    conditions.push({
      name: "Current Rating",
      status: "UNKNOWN",
      message: "Target circuit current not specified.",
    });
  }
}

function evaluateMicrocontroller(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  // Logic Voltage
  checkLogicVoltage(specs, target, conditions, missingRequiredSpecs);

  // Interfaces
  if (target.requiredProtocols && target.requiredProtocols.length > 0) {
    const supported = getStringArray(specs.interfaces) ?? [];
    checkProtocols(supported, target.requiredProtocols, conditions, missingRequiredSpecs);
  }
}

function evaluateGeneric(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  if (target.logicVoltageV !== undefined) {
    checkLogicVoltage(specs, target, conditions, missingRequiredSpecs);
  } else {
    missingRequiredSpecs.push("target hardware constraints");
    conditions.push({
      name: "Generic Component Suitability",
      status: "UNKNOWN",
      message: "Insufficient target constraints to verify generic component.",
    });
  }
}

// -----------------------------------------------------------------------------
// Common Rule Helpers
// -----------------------------------------------------------------------------

function checkLogicVoltage(
  specs: Record<string, unknown>,
  target: TargetHardwareContext,
  conditions: ConditionEvaluation[],
  missingRequiredSpecs: string[]
) {
  if (target.logicVoltageV === undefined) {
    missingRequiredSpecs.push("target host logic voltage (e.g. 3.3V or 5.0V)");
    conditions.push({
      name: "Logic Level Compatibility",
      status: "UNKNOWN",
      message: "Target host logic voltage not defined.",
    });
    return;
  }

  const logicSpec = specs.logicVoltage ?? specs.logicVoltageV ?? specs.logicVoltageCompatibility;
  const is5VTolerant = specs.is5VTolerant === true;

  if (logicSpec === undefined) {
    missingRequiredSpecs.push("component logic voltage rating");
    conditions.push({
      name: "Logic Level Compatibility",
      status: "UNKNOWN",
      message: "Component logic voltage specification not found in datasheet.",
    });
    return;
  }

  const logicStr = String(logicSpec).toLowerCase();

  if (target.logicVoltageV === 3.3) {
    if (logicStr.includes("3.3") || logicStr.includes("compatible") || logicStr.includes("safe") || logicStr === "3.3") {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "PASSED",
        message: "Component directly supports 3.3V logic level signals.",
        expected: "3.3V logic",
        actual: String(logicSpec),
      });
    } else if (logicStr === "5.0" || logicStr === "5v" || logicStr === "5") {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "FAILED",
        message: "Component requires strict 5.0V logic. 3.3V host will experience unreliable high logic threshold detection.",
        expected: "3.3V logic",
        actual: "5.0V strict logic",
      });
    } else {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "UNKNOWN",
        message: `Uncertain logic compatibility: ${logicSpec}.`,
      });
    }
  } else if (target.logicVoltageV === 5.0) {
    if (logicStr.includes("5") || is5VTolerant || logicStr.includes("tolerant")) {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "PASSED",
        message: "Component is 5.0V logic compatible or tolerant.",
        expected: "5.0V safe / tolerant",
        actual: String(logicSpec),
      });
    } else if (logicStr.includes("3.3") && !is5VTolerant) {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "FAILED",
        message: "Component operates strictly at 3.3V (not 5V tolerant). Direct 5V connection will permanently damage IC.",
        expected: "5.0V safe / tolerant",
        actual: "3.3V strict (non-tolerant)",
      });
    } else {
      conditions.push({
        name: "Logic Level Compatibility",
        status: "UNKNOWN",
        message: `Logic tolerance ambiguous: ${logicSpec}.`,
      });
    }
  }
}

function checkProtocols(
  supportedProtocols: string[],
  requiredProtocols: string[],
  conditions: ConditionEvaluation[],
  _missingRequiredSpecs: string[]
) {
  const normSupported = supportedProtocols.map((p) => p.toUpperCase().replace(/[\s_-]/g, ""));

  for (const req of requiredProtocols) {
    const normReq = req.toUpperCase().replace(/[\s_-]/g, "");
    const isSupported = normSupported.some((s) => s.includes(normReq) || normReq.includes(s));

    if (isSupported) {
      conditions.push({
        name: `Protocol Support: ${req}`,
        status: "PASSED",
        message: `Component supports required interface protocol: ${req}.`,
        expected: req,
        actual: supportedProtocols.join(", "),
      });
    } else {
      conditions.push({
        name: `Protocol Support: ${req}`,
        status: "FAILED",
        message: `Component does not support required protocol: ${req}. Supported: [${supportedProtocols.join(", ")}].`,
        expected: req,
        actual: supportedProtocols.join(", ") || "None listed",
      });
    }
  }
}

function evaluatePlatformMatch(
  supportedPlatforms: string[],
  hostBoard: string,
  conditions: ConditionEvaluation[]
) {
  const normHost = hostBoard.toLowerCase().trim();
  const matched = supportedPlatforms.some((p) => {
    const normP = p.toLowerCase();
    return normP.includes(normHost) || normHost.includes(normP);
  });

  if (matched) {
    conditions.push({
      name: "Known Platform Ecosystem",
      status: "PASSED",
      message: `Component has verified community/manufacturer compatibility with ${hostBoard}.`,
      expected: hostBoard,
      actual: supportedPlatforms.join(", "),
    });
  }
}

// Type coercion helpers
function getNumber(val: unknown): number | undefined {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getString(val: unknown): string | undefined {
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  return undefined;
}

function getStringArray(val: unknown): string[] | undefined {
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim());
  }
  return undefined;
}
