import { PrismaClient, ComponentCategory } from "@prisma/client";

const prisma = new PrismaClient();

export const SEED_PARTS = [
  {
    mpn: "TMC2209-LA",
    sku: "DRV-TMC-2209",
    name: "TMC2209 SilentStepStick Stepper Motor Driver",
    manufacturer: "Trinamic / Analog Devices",
    category: ComponentCategory.MOTOR_DRIVER,
    description:
      "Ultra-quiet two-phase stepper motor driver IC with StealthChop2, SpreadCycle, and StallGuard4 sensorless homing. Popular for precision 3D printing and quiet robotics actuators.",
    specificationSource: "Trinamic TMC2209 Datasheet Rev 1.08",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl:
      "https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.08.pdf",
    isDemonstrationSample: false,
    priceCents: 1150, // $11.50
    currency: "USD",
    stockOnHand: 45,
    stockReserved: 0,
    specs: {
      supplyVoltageMinV: 4.75,
      supplyVoltageMaxV: 29.0,
      logicVoltage: "3.3V / 5.0V compatible",
      maxCurrentRmsA: 2.0, // Silicon IC limit with ideal active cooling
      practicalContinuousCurrentA: 1.4, // Standard 4-layer StepStick PCB ambient limit without fan
      requiresActiveCoolingAboveA: 1.2,
      maxCurrentPeakA: 2.8,
      controlInterface: ["STEP_DIR", "UART"],
      microstepping: "1/1 to 1/256 with MicroPlyer interpolation",
      protection: ["Thermal shutdown", "Overcurrent", "Undervoltage lockout"],
      package: "QFN-28 (5x5mm) / StepStick 16-pin Carrier Module",
    },
    supportedPlatforms: [
      "Voron 2.4 / Trident",
      "BTT Octopus / SKR Mini E3",
      "Arduino CNC Shield V3",
      "Raspberry Pi GPIO with StepStick Carrier",
    ],
  },
  {
    mpn: "L298N-MOD",
    sku: "DRV-STM-L298N",
    name: "L298N Dual Full-Bridge DC/Stepper Driver Module",
    manufacturer: "STMicroelectronics",
    category: ComponentCategory.MOTOR_DRIVER,
    description:
      "High voltage, high current dual full-bridge motor driver designed to accept standard TTL logic levels and drive inductive loads such as relays, solenoids, DC and stepping motors.",
    specificationSource:
      "STMicroelectronics L298 Dual Full-Bridge Driver Datasheet DocID 1773 Rev 6",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://www.st.com/resource/en/datasheet/l298.pdf",
    isDemonstrationSample: false,
    priceCents: 580, // $5.80
    currency: "USD",
    stockOnHand: 60,
    stockReserved: 0,
    specs: {
      supplyVoltageMinV: 4.5,
      supplyVoltageMaxV: 46.0,
      logicVoltageV: 5.0,
      maxCurrentContinuousA: 2.0,
      maxCurrentPeakA: 3.0,
      channels: 2,
      controlInterface: ["PWM", "DIR_ENABLE"],
      onboardRegulator: "5V 78M05 onboard (usable when Vmot <= 12V)",
      terminalType: "Screw terminals (Power & Motor) + 2.54mm DuPont header",
    },
    supportedPlatforms: [
      "Arduino Uno R3 / Mega 2560",
      "Raspberry Pi (with 3.3V-5V level shifting)",
      "Generic 12V-24V DC Robotics Chassis",
    ],
  },
  {
    mpn: "ESP32-WROOM-32E-N4",
    sku: "MCU-ESP-32E-4M",
    name: "ESP32-WROOM-32E Wi-Fi + Bluetooth MCU Module (4MB)",
    manufacturer: "Espressif Systems",
    category: ComponentCategory.MICROCONTROLLER,
    description:
      "Powerful generic Wi-Fi + Bluetooth + Bluetooth LE MCU module with 4MB SPI flash, targeting a wide variety of robotics telemetry, sensor hubs, and wireless motor control applications.",
    specificationSource: "Espressif Systems ESP32-WROOM-32E Datasheet v1.9",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl:
      "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
    isDemonstrationSample: false,
    priceCents: 420, // $4.20
    currency: "USD",
    stockOnHand: 120,
    stockReserved: 0,
    specs: {
      operatingVoltageMinV: 3.0,
      operatingVoltageMaxV: 3.6,
      logicVoltageV: 3.3,
      is5VTolerant: false,
      cpu: "Xtensa dual-core 32-bit LX6 microprocessor",
      clockFrequencyMhz: 240,
      sramKb: 520,
      flashMb: 4,
      wireless: ["Wi-Fi 802.11 b/g/n (150 Mbps)", "Bluetooth v4.2 BR/EDR & BLE"],
      interfaces: ["UART", "SPI", "I2C", "PWM", "ADC", "DAC", "CAN 2.0B / TWAI"],
      minSupplyCurrentMa: 500,
    },
    supportedPlatforms: [
      "ESP32-DevKitC-32E Breakout",
      "NodeMCU-32S",
      "Custom Robotics PCB SMD Footprint",
    ],
  },
  {
    mpn: "SC0915-PICO",
    sku: "MCU-RPI-PICO-RP2040",
    name: "Raspberry Pi Pico RP2040 Microcontroller Board",
    manufacturer: "Raspberry Pi Ltd",
    category: ComponentCategory.MICROCONTROLLER,
    description:
      "ARM Cortex-M0+ dual-core microcontroller development board featuring RP2040 silicon with high-speed Programmable I/O (PIO) state machines for custom robotics bus protocols.",
    specificationSource: "Raspberry Pi Pico Datasheet Rev 2.3",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf",
    isDemonstrationSample: false,
    priceCents: 400, // $4.00
    currency: "USD",
    stockOnHand: 85,
    stockReserved: 0,
    specs: {
      supplyVoltageMinV: 1.8,
      supplyVoltageMaxV: 5.5,
      logicVoltageV: 3.3,
      cpu: "Dual-core ARM Cortex-M0+ processor",
      clockFrequencyMhz: 133,
      sramKb: 264,
      flashMb: 2,
      gpioCount: 26,
      interfaces: [
        "2x UART",
        "2x SPI",
        "2x I2C",
        "16x PWM channels",
        "8x PIO state machines",
      ],
      usb: "USB 1.1 Micro-B (Host & Device)",
    },
    supportedPlatforms: [
      "Standard 2.54mm Breadboard",
      "Maker Pi RP2040 Carrier",
      "Cytron Motion 2350 / Pico Robotics Hub",
    ],
  },
  {
    mpn: "MPU-6050",
    sku: "SEN-TDK-MPU6050",
    name: "MPU-6050 6-Axis MotionTracking IMU Module",
    manufacturer: "TDK InvenSense",
    category: ComponentCategory.SENSOR,
    description:
      "Integrated 6-axis MotionTracking device combining a 3-axis gyroscope and a 3-axis accelerometer with an onboard Digital Motion Processor (DMP) for self-balancing robots and drone IMU stabilization.",
    specificationSource:
      "TDK InvenSense MPU-6000/MPU-6050 Product Specification Revision 3.4",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl:
      "https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf",
    isDemonstrationSample: false,
    priceCents: 375, // $3.75
    currency: "USD",
    stockOnHand: 70,
    stockReserved: 0,
    specs: {
      carrierModuleSupplyVoltageV: "3.3V - 5.0V (onboard RT9161 LDO)",
      sensorSupplyVoltageMinV: 2.375,
      sensorSupplyVoltageMaxV: 3.46,
      logicVoltageV: 3.3,
      degreesOfFreedom: 6,
      gyroscopeRangeDps: ["±250", "±500", "±1000", "±2000"],
      accelerometerRangeG: ["±2", "±4", "±8", "±16"],
      interface: ["I2C (Fast Mode up to 400kHz)"],
      i2cAddressHex: "0x68 (AD0=GND) / 0x69 (AD0=VCC)",
      pinHeader: "8-pin 2.54mm pitch (VCC, GND, SCL, SDA, XDA, XCL, AD0, INT)",
    },
    supportedPlatforms: [
      "Arduino Uno / Nano",
      "Raspberry Pi 4 / 5 (3.3V bus)",
      "ESP32 DevKit",
      "STM32 BlackPill",
    ],
  },
  {
    mpn: "VL53L0CXV0DH/1",
    sku: "SEN-STM-VL53L0X",
    name: "VL53L0X Time-of-Flight (ToF) Laser Ranging Sensor",
    manufacturer: "STMicroelectronics",
    category: ComponentCategory.SENSOR,
    description:
      "High accuracy Time-of-Flight distance measurement sensor based on FlightSense technology. Measures absolute distance up to 2m independent of target color or surface reflectance.",
    specificationSource:
      "STMicroelectronics VL53L0X Time-of-Flight Ranging Sensor Datasheet DS11581 Rev 7",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://www.st.com/resource/en/datasheet/vl53l0x.pdf",
    isDemonstrationSample: false,
    priceCents: 890, // $8.90
    currency: "USD",
    stockOnHand: 40,
    stockReserved: 0,
    specs: {
      carrierModuleSupplyVoltageV: "2.8V - 5.0V (onboard level shifter)",
      sensorSupplyVoltageMinV: 2.6,
      sensorSupplyVoltageMaxV: 3.5,
      logicVoltageCompatibility: "3.3V and 5.0V safe",
      maxRangeMm: 2000,
      laserEmitter: "940nm Invisible Laser (Class 1 Eye-Safe)",
      fieldOfViewDeg: 25,
      interface: ["I2C (Fast Mode up to 400kHz)"],
      defaultI2cAddressHex: "0x29 (Software reconfigurable via XSHUT pin)",
    },
    supportedPlatforms: [
      "Raspberry Pi 4 / 5",
      "ESP32-WROOM",
      "Arduino Uno R3 / R4",
      "Teensy 4.0 / 4.1",
    ],
  },
  {
    mpn: "LM2596S-ADJ",
    sku: "PWR-TI-LM2596-ADJ",
    name: "LM2596 DC-DC Step-Down (Buck) Regulator Module",
    manufacturer: "Texas Instruments",
    category: ComponentCategory.POWER_MODULE,
    description:
      "Step-down switching regulator module capable of driving a 3.0A load with excellent line and load regulation. Ideal for powering 5V logic controllers from 12V-24V robot batteries.",
    specificationSource:
      "Texas Instruments LM2596 SIMPLE SWITCHER 3-A Step-Down Voltage Regulator SNVS124D",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://www.ti.com/lit/ds/symlink/lm2596.pdf",
    isDemonstrationSample: false,
    priceCents: 320, // $3.20
    currency: "USD",
    stockOnHand: 110,
    stockReserved: 0,
    specs: {
      inputVoltageMinV: 4.5,
      inputVoltageMaxV: 40.0,
      outputVoltageMinV: 1.23,
      outputVoltageMaxV: 37.0,
      adjustmentType: "Onboard multi-turn precision potentiometer",
      maxOutputCurrentA: 3.0,
      recommendedContinuousCurrentA: 2.0,
      switchingFrequencyKhz: 150,
      typicalEfficiencyPercent: 92,
      protection: ["Thermal shutdown", "Cycle-by-cycle current limit"],
    },
    supportedPlatforms: [
      "Robotics 12V / 24V Main Power Bus",
      "3S / 4S / 6S LiPo Battery Systems",
      "Raspberry Pi 5V Power Supply Rails",
    ],
  },
  {
    mpn: "17HS4401",
    sku: "MOT-NEMA-17HS4401",
    name: "NEMA 17 Bipolar Stepper Motor (40mm, 1.7A)",
    manufacturer: "Usongshine / NEMA Standard",
    category: ComponentCategory.MOTOR,
    description:
      "Standard 42x42mm hybrid stepping motor with 1.8 degree step angle (200 steps/revolution). Widely used in 3D printers, CNC axis drives, and wheeled robot platforms.",
    specificationSource:
      "Usongshine 17HS4401 Hybrid Stepper Motor Specification Doc Rev 2.1",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: null, // Demonstration standard specification
    isDemonstrationSample: true, // Tagged because batch specifications can vary slightly across vendors
    priceCents: 1450, // $14.50
    currency: "USD",
    stockOnHand: 35,
    stockReserved: 0,
    specs: {
      stepAngleDeg: 1.8,
      stepsPerRevolution: 200,
      ratedVoltageV: 12.0,
      ratedCurrentPerPhaseA: 1.7,
      phaseResistanceOhm: 1.5,
      holdingTorqueNcm: 40.0,
      frameSizeMm: 42.0,
      bodyLengthMm: 40.0,
      shaftDiameterMm: 5.0,
      shaftType: "D-Shape (4.5mm flat edge)",
      leadWiresCount: 4,
      wiringSequence: "Black (A+), Green (A-), Red (B+), Blue (B-)",
    },
    supportedPlatforms: [
      "TMC2209 / A4988 / DRV8825 Driver Boards",
      "Creality / Voron / Prusa 3D Printers",
      "Custom Robotic Gantry Systems",
    ],
  },
  {
    mpn: "B4B-XH-A",
    sku: "CON-JST-XH-4P",
    name: "JST-XH 4-Pin 2.50mm Pitch Male Header + Cable Set",
    manufacturer: "J.S.T. Mfg. Co., Ltd.",
    category: ComponentCategory.CONNECTOR,
    description:
      "High reliability 2.50mm metric pitch disconnectable crimp-style connector header and 200mm pre-crimped wire assembly. (Note: 2.50mm metric pitch is NOT mechanically interchangeable with 2.54mm / 0.100\" headers on multi-pin assemblies).",
    specificationSource: "J.S.T. Mfg. Co. XH Connector 2.5mm Pitch Catalog",
    specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
    datasheetUrl: "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf",
    isDemonstrationSample: false,
    priceCents: 150, // $1.50
    currency: "USD",
    stockOnHand: 250,
    stockReserved: 0,
    specs: {
      pitchMm: 2.50,
      pinCount: 4,
      ratedCurrentA: 3.0,
      ratedVoltageV: 250,
      wireGauge: "24 AWG pre-crimped lead wires",
      wireLengthMm: 200,
      orientation: "Straight Through-Hole (Top Entry)",
      matingLock: "Friction lock with polarization guide",
      colorCode: "Standard 4-Wire (Red, Black, Yellow, White)",
    },
    supportedPlatforms: [
      "I2C Sensor Breakout Modules",
      "TMC2209 / Stepper Motor Cabling",
      "Robotics Modular Sensor Busses",
    ],
  },
];

async function main() {
  console.log("Seeding authoritative electronics and robotics components...");

  for (const part of SEED_PARTS) {
    const upserted = await prisma.part.upsert({
      where: { mpn: part.mpn },
      update: {
        sku: part.sku,
        name: part.name,
        manufacturer: part.manufacturer,
        category: part.category,
        description: part.description,
        specificationSource: part.specificationSource,
        specificationVerifiedAt: part.specificationVerifiedAt,
        datasheetUrl: part.datasheetUrl,
        isDemonstrationSample: part.isDemonstrationSample,
        priceCents: part.priceCents,
        currency: part.currency,
        stockOnHand: part.stockOnHand,
        stockReserved: part.stockReserved,
        specs: part.specs,
        supportedPlatforms: part.supportedPlatforms,
        isActive: true,
      },
      create: {
        mpn: part.mpn,
        sku: part.sku,
        name: part.name,
        manufacturer: part.manufacturer,
        category: part.category,
        description: part.description,
        specificationSource: part.specificationSource,
        specificationVerifiedAt: part.specificationVerifiedAt,
        datasheetUrl: part.datasheetUrl,
        isDemonstrationSample: part.isDemonstrationSample,
        priceCents: part.priceCents,
        currency: part.currency,
        stockOnHand: part.stockOnHand,
        stockReserved: part.stockReserved,
        specs: part.specs,
        supportedPlatforms: part.supportedPlatforms,
        isActive: true,
      },
    });

    console.log(
      `[✓] Upserted: ${upserted.mpn} (${upserted.name}) - $${(
        upserted.priceCents / 100
      ).toFixed(2)}`
    );
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error executing seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
