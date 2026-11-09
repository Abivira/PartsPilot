import { ComponentCategory } from "@prisma/client";

/**
 * Authoritative Offline Test Fixtures.
 * Used exclusively for deterministic compatibility testing and UI interaction
 * when a live PostgreSQL database connection has not yet been seeded.
 *
 * All specifications are identical to prisma/seed.ts with verified datasheet provenance.
 */
export interface CatalogPartFixture {
  id: string;
  mpn: string;
  sku: string;
  name: string;
  manufacturer: string;
  category: ComponentCategory;
  description: string;
  specificationSource: string;
  datasheetUrl: string | null;
  isDemonstrationSample: boolean;
  priceCents: number;
  currency: string;
  stockOnHand: number;
  specs: Record<string, unknown>;
  supportedPlatforms: string[];
}

export const CATALOG_FIXTURES: CatalogPartFixture[] = [
  {
    id: "fix_tmc2209",
    mpn: "TMC2209-LA",
    sku: "DRV-TMC-2209",
    name: "TMC2209 SilentStepStick Stepper Motor Driver",
    manufacturer: "Trinamic / Analog Devices",
    category: ComponentCategory.MOTOR_DRIVER,
    description: "Ultra-quiet two-phase stepper motor driver IC with StealthChop2 and StallGuard4.",
    specificationSource: "Trinamic TMC2209 Datasheet Rev 1.08",
    datasheetUrl: "https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.08.pdf",
    isDemonstrationSample: false,
    priceCents: 1150,
    currency: "USD",
    stockOnHand: 45,
    specs: {
      supplyVoltageMinV: 4.75,
      supplyVoltageMaxV: 29.0,
      logicVoltage: "3.3V / 5.0V compatible",
      maxCurrentRmsA: 2.0, // Silicon IC rating (requires active heatsink + fan cooling)
      practicalContinuousCurrentA: 1.4, // Standard 4-layer StepStick PCB ambient limit without fan
      requiresActiveCoolingAboveA: 1.2,
      maxCurrentPeakA: 2.8,
      controlInterface: ["STEP_DIR", "UART"],
      microstepping: "1/1 to 1/256",
    },
    supportedPlatforms: ["Voron 2.4", "Raspberry Pi", "Arduino CNC Shield"],
  },
  {
    id: "fix_l298n",
    mpn: "L298N-MOD",
    sku: "DRV-STM-L298N",
    name: "L298N Dual Full-Bridge DC/Stepper Driver Module",
    manufacturer: "STMicroelectronics",
    category: ComponentCategory.MOTOR_DRIVER,
    description: "High voltage, high current dual full-bridge motor driver module.",
    specificationSource: "STMicroelectronics L298 Dual Full-Bridge Driver Datasheet DocID 1773 Rev 6",
    datasheetUrl: "https://www.st.com/resource/en/datasheet/l298.pdf",
    isDemonstrationSample: false,
    priceCents: 580,
    currency: "USD",
    stockOnHand: 60,
    specs: {
      supplyVoltageMinV: 4.5,
      supplyVoltageMaxV: 46.0,
      logicVoltageV: 5.0,
      maxCurrentContinuousA: 2.0,
      maxCurrentPeakA: 3.0,
      channels: 2,
      controlInterface: ["PWM", "DIR_ENABLE"],
    },
    supportedPlatforms: ["Arduino Uno R3", "Arduino Mega 2560"],
  },
  {
    id: "fix_esp32",
    mpn: "ESP32-WROOM-32E-N4",
    sku: "MCU-ESP-32E-4M",
    name: "ESP32-WROOM-32E Wi-Fi + Bluetooth MCU Module (4MB)",
    manufacturer: "Espressif Systems",
    category: ComponentCategory.MICROCONTROLLER,
    description: "Generic Wi-Fi + Bluetooth + BLE MCU module targeting robotics telemetry.",
    specificationSource: "Espressif Systems ESP32-WROOM-32E Datasheet v1.9",
    datasheetUrl: "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
    isDemonstrationSample: false,
    priceCents: 420,
    currency: "USD",
    stockOnHand: 120,
    specs: {
      operatingVoltageMinV: 3.0,
      operatingVoltageMaxV: 3.6,
      logicVoltageV: 3.3,
      is5VTolerant: false,
      cpu: "Xtensa dual-core 32-bit LX6",
      interfaces: ["UART", "SPI", "I2C", "PWM", "CAN"],
    },
    supportedPlatforms: ["ESP32-DevKitC", "NodeMCU-32S"],
  },
  {
    id: "fix_pico",
    mpn: "SC0915-PICO",
    sku: "MCU-RPI-PICO-RP2040",
    name: "Raspberry Pi Pico RP2040 Microcontroller Board",
    manufacturer: "Raspberry Pi Ltd",
    category: ComponentCategory.MICROCONTROLLER,
    description: "ARM Cortex-M0+ dual-core board with Programmable I/O (PIO).",
    specificationSource: "Raspberry Pi Pico Datasheet Rev 2.3",
    datasheetUrl: "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf",
    isDemonstrationSample: false,
    priceCents: 400,
    currency: "USD",
    stockOnHand: 85,
    specs: {
      supplyVoltageMinV: 1.8,
      supplyVoltageMaxV: 5.5,
      logicVoltageV: 3.3,
      cpu: "Dual-core ARM Cortex-M0+",
      interfaces: ["UART", "SPI", "I2C", "PWM", "PIO"],
    },
    supportedPlatforms: ["Breadboard", "Maker Pi RP2040"],
  },
  {
    id: "fix_mpu6050",
    mpn: "MPU-6050",
    sku: "SEN-TDK-MPU6050",
    name: "MPU-6050 6-Axis MotionTracking IMU Module",
    manufacturer: "TDK InvenSense",
    category: ComponentCategory.SENSOR,
    description: "Integrated 6-axis device combining 3-axis gyro and 3-axis accelerometer.",
    specificationSource: "TDK InvenSense MPU-6000/MPU-6050 Product Specification Revision 3.4",
    datasheetUrl: "https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf",
    isDemonstrationSample: false,
    priceCents: 375,
    currency: "USD",
    stockOnHand: 70,
    specs: {
      carrierModuleSupplyVoltageV: "3.3V - 5.0V (onboard RT9161 LDO)",
      sensorSupplyVoltageMinV: 2.375,
      sensorSupplyVoltageMaxV: 3.46,
      logicVoltageV: 3.3,
      interface: ["I2C"],
      i2cAddressHex: "0x68 (AD0=GND) / 0x69 (AD0=VCC)",
    },
    supportedPlatforms: ["Arduino Uno", "Raspberry Pi 4", "Raspberry Pi 5", "ESP32"],
  },
  {
    id: "fix_vl53l0x",
    mpn: "VL53L0CXV0DH/1",
    sku: "SEN-STM-VL53L0X",
    name: "VL53L0X Time-of-Flight (ToF) Laser Ranging Sensor",
    manufacturer: "STMicroelectronics",
    category: ComponentCategory.SENSOR,
    description: "Time-of-Flight distance measurement sensor based on FlightSense.",
    specificationSource: "STMicroelectronics VL53L0X Datasheet DS11581 Rev 7",
    datasheetUrl: "https://www.st.com/resource/en/datasheet/vl53l0x.pdf",
    isDemonstrationSample: false,
    priceCents: 890,
    currency: "USD",
    stockOnHand: 40,
    specs: {
      carrierModuleSupplyVoltageV: "2.8V - 5.0V (onboard level shifter)",
      sensorSupplyVoltageMinV: 2.6,
      sensorSupplyVoltageMaxV: 3.5,
      logicVoltageCompatibility: "3.3V and 5.0V safe",
      interface: ["I2C"],
      defaultI2cAddressHex: "0x29 (Software reconfigurable via XSHUT)",
    },
    supportedPlatforms: ["Raspberry Pi 4", "Raspberry Pi 5", "ESP32", "Arduino Uno"],
  },
  {
    id: "fix_lm2596",
    mpn: "LM2596S-ADJ",
    sku: "PWR-TI-LM2596-ADJ",
    name: "LM2596 DC-DC Step-Down (Buck) Regulator Module",
    manufacturer: "Texas Instruments",
    category: ComponentCategory.POWER_MODULE,
    description: "Step-down switching regulator module capable of driving a 3.0A load.",
    specificationSource: "Texas Instruments LM2596 SIMPLE SWITCHER 3-A Step-Down Voltage Regulator SNVS124D",
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/lm2596.pdf",
    isDemonstrationSample: false,
    priceCents: 320,
    currency: "USD",
    stockOnHand: 110,
    specs: {
      inputVoltageMinV: 4.5,
      inputVoltageMaxV: 40.0,
      outputVoltageMinV: 1.23,
      outputVoltageMaxV: 37.0,
      maxOutputCurrentA: 3.0,
      recommendedContinuousCurrentA: 2.0,
    },
    supportedPlatforms: ["Robotics 12V / 24V Main Power Bus", "Raspberry Pi 5V Rails"],
  },
  {
    id: "fix_nema17",
    mpn: "17HS4401",
    sku: "MOT-NEMA-17HS4401",
    name: "NEMA 17 Bipolar Stepper Motor (40mm, 1.7A)",
    manufacturer: "Usongshine / NEMA Standard",
    category: ComponentCategory.MOTOR,
    description: "Standard 42x42mm hybrid stepping motor with 1.8 degree step angle.",
    specificationSource: "Usongshine 17HS4401 Hybrid Stepper Motor Specification Doc Rev 2.1",
    datasheetUrl: null,
    isDemonstrationSample: true,
    priceCents: 1450,
    currency: "USD",
    stockOnHand: 35,
    specs: {
      stepAngleDeg: 1.8,
      stepsPerRevolution: 200,
      ratedVoltageV: 12.0,
      ratedCurrentPerPhaseA: 1.7,
      frameSizeMm: 42.0,
      shaftDiameterMm: 5.0,
      leadWiresCount: 4,
    },
    supportedPlatforms: ["Voron 2.4", "TMC2209 Driver Boards", "3D Printers"],
  },
  {
    id: "fix_jst4p",
    mpn: "B4B-XH-A",
    sku: "CON-JST-XH-4P",
    name: "JST-XH 4-Pin 2.50mm Pitch Male Header + Cable Set",
    manufacturer: "J.S.T. Mfg. Co., Ltd.",
    category: ComponentCategory.CONNECTOR,
    description: "High reliability 2.50mm metric pitch disconnectable crimp-style connector header and 200mm pre-crimped wire assembly. (Note: 2.50mm metric pitch is NOT mechanically interchangeable with 2.54mm / 0.100\" headers on multi-pin assemblies).",
    specificationSource: "J.S.T. Mfg. Co. XH Connector 2.5mm Pitch Catalog",
    datasheetUrl: "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf",
    isDemonstrationSample: false,
    priceCents: 150,
    currency: "USD",
    stockOnHand: 250,
    specs: {
      pitchMm: 2.50,
      pinCount: 4,
      ratedCurrentA: 3.0,
      ratedVoltageV: 250,
    },
    supportedPlatforms: ["I2C Sensor Breakout Modules", "Stepper Motor Cabling"],
  },
];
