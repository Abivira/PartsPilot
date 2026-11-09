# PartsPilot: Autonomous AI Electronics & Robotics Procurement Engine

> **Built for the PayPal AI Hackathon 2026**  
> *Datasheet-backed compatibility verification, multimodal hardware diagnostics, deterministic bill-of-materials sourcing, and server-authoritative PayPal REST API v2 agentic commerce.*

---

## 🌟 Overview

When roboticists, makers, and embedded systems engineers source electronic components, single-letter MPN differences (e.g., `ESP32-WROOM-32E` vs `32D`, 3.3V vs 5V logic tolerances, or StepStick stepper current ratings) routinely result in blown microcontrollers, ruined prototypes, and wasted budget.

**PartsPilot** bridges the gap between AI-driven hardware inspection and autonomous procurement:
1. **Multimodal Silkscreen & Defect Inspection:** Analyzes component markings, damage, and electrical constraints using Google Gemini Multimodal AI.
2. **Deterministic Rules Engine:** Verifies logic voltage levels, supply rail limits, bus protocols (I2C, SPI, UART, STEP/DIR), and pin pitch against authoritative datasheets.
3. **Interactive Bill of Materials (BOM):** Resolves uncatalogued hardware into procurement-ready line items mapped against a live PostgreSQL catalog.
4. **Agentic PayPal Commerce (REST Orders v2):** Implements atomic inventory leasing, server-authoritative pricing (never trusting the client), double-spend protection, and exact-once stock commitment upon verified payment capture.

---

## 🏗️ Architecture & Technology Stack

```
   ┌───────────────────────────────────────────────────────────────┐
   │                        Next.js 15 App                         │
   │           RCB Red & Obsidian Dark Engineering UI              │
   └───────────────┬───────────────────────────────┬───────────────┘
                   │                               │
                   ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   Gemini AI & Rules    │      │    Procurement Cart    │
       │   Multimodal Silk-     │      │   Integer-Cent Math,   │
       │   screen Extraction    │      │   Inventory Leasing    │
       └───────────┬────────────┘      └───────────┬────────────┘
                   │                               │
                   ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │  Deterministic Engine  │      │  PayPal REST v2 Orders │
       │  Voltage, Protocol &   │      │  OAuth Caching, Atomic │
       │  Pinout Verification   │      │  Capture & Webhooks    │
       └───────────┬────────────┘      └───────────┬────────────┘
                   │                               │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │     Neon Serverless Postgres │
                    │     Prisma ORM Atomic State  │
                    └──────────────────────────────┘
```

* **Frontend:** Next.js 15 (App Router), React 18, Tailwind CSS, Lucide Icons
* **Database & ORM:** Neon Serverless PostgreSQL with Prisma ORM
* **AI Diagnostics:** Google Gemini (`@google/genai`) with Deterministic Rules Engine fallback
* **Payments & Sourcing:** PayPal REST API Orders v2 (Sandbox), Server-Authoritative Captures, Webhooks
* **Testing:** Vitest (80 comprehensive unit & integration tests)

---

## 🚀 Key Features

### 1. Multimodal & Deterministic Diagnostics
* Direct silkscreen text extraction and physical damage detection (burn marks, solder bridges, cracked packaging).
* Real-time verification against target hardware contexts (e.g. Voron 2.4 gantry, Raspberry Pi 5, Arduino Uno R3, custom laboratory bench).
* Never hallucinates part numbers: unverified specs remain explicitly marked with low confidence scores.

### 2. Interactive BOM & Catalog Sourcing
* Generates structured Bills of Materials from verified diagnostic sessions.
* Real-time matching against live inventory in Neon PostgreSQL.
* Visual distinction between live purchasable inventory and demonstration fixtures.
* One-click CSV export and batch procurement cart addition.

### 3. Server-Authoritative Shopping Cart
* Integer-cent precision calculations eliminating floating-point rounding errors.
* Guaranteed server pricing: browser cannot submit modified price totals.
* Dynamic shipping calculation (\$5.00 flat rate for orders under \$50, FREE for orders \$50+).
* Stock validation preventing over-ordering beyond live available inventory.

### 4. Complete PayPal REST Orders v2 Integration
* Server-side order creation (`POST /api/paypal/create-order`) with idempotency keys.
* Inventory leasing with automatic 15-minute reservation expiry.
* Server-side capture (`POST /api/paypal/capture-order`) validating exact amount and currency before committing stock.
* Verified webhook event receiver (`POST /api/paypal/webhook`) with cryptographic signature validation and SSRF domain protection.

---

## 🛠️ Getting Started

### 1. Prerequisites
* **Node.js:** v18.17+ or v20+
* **Database:** Neon PostgreSQL database connection string
* **PayPal:** Developer Sandbox credentials

### 2. Environment Setup
Create a `.env` file in the root directory:

```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://neondb_owner:...@ep-...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:...@ep-...ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# AI Engine (Optional - Deterministic Engine acts as fallback)
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-2.5-flash"

# PayPal REST API Orders v2 (Sandbox)
NEXT_PUBLIC_PAYPAL_CLIENT_ID="your_sandbox_client_id"
PAYPAL_CLIENT_ID="your_sandbox_client_id"
PAYPAL_CLIENT_SECRET="your_sandbox_client_secret"
PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"
PAYPAL_WEBHOOK_ID="your_sandbox_webhook_id"
```

### 3. Install & Seed Database
```bash
npm install
npx prisma db push
npm run seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Test Suite

PartsPilot maintains an 80-test regression suite covering all critical engineering, safety, rate-limiting, and financial invariants:

```bash
npx vitest run
```

### Test Suite Breakdown:
1. `matcher.test.ts` (16 tests) — Deterministic electrical, voltage, and protocol fitment.
2. `diagnose-api.test.ts` (14 tests) — Multimodal AI extraction, silkscreen OCR, and catalog queries.
3. `security-hardening.test.ts` (14 tests) — Atomic rate limiting, magic-byte image validation, and error sanitization.
4. `bom-cart.test.ts` (14 tests) — BOM generation, catalog sourcing, integer-cent totals, and stock reservation.
5. `paypal-commerce.test.ts` (22 tests) — Orders v2 lifecycle, OAuth caching, exact-once stock commitment, amount validation, and webhook signature verification.

---

## 📄 License
MIT License. Built for the **PayPal AI Hackathon 2026**.
