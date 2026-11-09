import { NextRequest, NextResponse } from "next/server";
import { extractComponentDiagnosis } from "@/lib/ai/gemini";
import { matchCataloguePart } from "@/lib/catalog/db-matching";
import { evaluateCompatibility } from "@/lib/catalog/matcher";
import { validateImageSignature } from "@/lib/security/image-validator";
import {
  extractSafeClientIp,
  hashClientIdentifier,
  checkRateLimit,
} from "@/lib/security/rate-limiter";
import {
  TargetHardwareContext,
  CompatibilityReport,
  ConditionEvaluation,
} from "@/types/compatibility";
import { DiagnoseResponse, EvaluationSource } from "@/types/ai";
import { ComponentCategory } from "@prisma/client";

// Maximum allowable Content-Length header before parsing (6 MB)
const MAX_RAW_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // 1. Production-hardened shared rate limiting (PostgreSQL atomic with memory fallback)
  const safeIp = extractSafeClientIp(req);
  const clientHash = hashClientIdentifier(safeIp, "diagnose");
  const rateLimitResult = await checkRateLimit(clientHash, 30, 60);

  if (!rateLimitResult.allowed) {
    const retrySec = rateLimitResult.retryAfterSeconds ?? 60;
    return new NextResponse(
      JSON.stringify({
        error: `Too many diagnostic requests. Rate limit exceeded. Please retry in ${retrySec} seconds.`,
        retryAfterSeconds: retrySec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retrySec),
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }

  // 2. Pre-check Content-Length header to prevent oversized request DOS
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredSize = parseInt(contentLengthHeader, 10);
    if (!isNaN(declaredSize) && declaredSize > MAX_RAW_BODY_BYTES) {
      return NextResponse.json(
        {
          error: `Request body exceeds the maximum permitted size of 6 MB (received ${(declaredSize / (1024 * 1024)).toFixed(2)} MB).`,
        },
        { status: 413, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    let userMpn: string | undefined;
    let symptomDescription: string | undefined;
    let targetContext: TargetHardwareContext | undefined;
    let imageBuffer: Buffer | undefined;
    let detectedMime: "image/jpeg" | "image/png" | "image/webp" | undefined;

    // 3. Safe Request Parsing
    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch (parseErr) {
        return NextResponse.json(
          {
            error: "Malformed multipart form data. Unable to parse boundary or payload.",
          },
          { status: 400, headers: { "X-Content-Type-Options": "nosniff" } }
        );
      }

      const rawMpn = formData.get("userMpn") ?? formData.get("mpn");
      if (typeof rawMpn === "string" && rawMpn.trim()) {
        userMpn = rawMpn.trim().slice(0, 100);
      }

      const rawSymptom =
        formData.get("symptomDescription") ?? formData.get("problemDescription");
      if (typeof rawSymptom === "string" && rawSymptom.trim()) {
        symptomDescription = rawSymptom.trim().slice(0, 2000);
      }

      const rawTargetContext = formData.get("targetContext");
      if (typeof rawTargetContext === "string" && rawTargetContext.trim()) {
        try {
          targetContext = JSON.parse(rawTargetContext);
        } catch {
          return NextResponse.json(
            { error: "Invalid targetContext: Expected valid JSON string." },
            { status: 400, headers: { "X-Content-Type-Options": "nosniff" } }
          );
        }
      }

      const file = formData.get("image");
      if (file && file instanceof File && file.size > 0) {
        // Check declared MIME type
        const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedMimes.includes(file.type)) {
          return NextResponse.json(
            {
              error: `Unsupported image format (${file.type}). Only JPEG, PNG, and WEBP are accepted.`,
            },
            { status: 400, headers: { "X-Content-Type-Options": "nosniff" } }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 4. Inspect binary file signature (magic bytes)
        const signatureCheck = validateImageSignature(buffer);
        if (!signatureCheck.isValid) {
          return NextResponse.json(
            { error: signatureCheck.error },
            {
              status: signatureCheck.statusCode || 400,
              headers: { "X-Content-Type-Options": "nosniff" },
            }
          );
        }

        detectedMime = signatureCheck.detectedMime;
        imageBuffer = buffer;
      }
    } else if (contentType.includes("application/json")) {
      // Handle text-only JSON request
      let body: any;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { error: "Malformed JSON payload." },
          { status: 400, headers: { "X-Content-Type-Options": "nosniff" } }
        );
      }

      if (typeof body.userMpn === "string" && body.userMpn.trim()) {
        userMpn = body.userMpn.trim().slice(0, 100);
      }
      if (typeof body.symptomDescription === "string" && body.symptomDescription.trim()) {
        symptomDescription = body.symptomDescription.trim().slice(0, 2000);
      }
      if (body.targetContext && typeof body.targetContext === "object") {
        targetContext = body.targetContext;
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Please use multipart/form-data or application/json.",
        },
        { status: 415, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }

    // Require at least an image, user MPN, or symptom description
    if (!imageBuffer && !userMpn && !symptomDescription) {
      return NextResponse.json(
        {
          error:
            "Diagnostic intake requires at least one input: an uploaded component photograph, a part number (MPN), or a symptom description.",
        },
        { status: 400, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }

    // 5. Run Gemini Multimodal AI extraction
    const aiExtraction = await extractComponentDiagnosis({
      imageBuffer,
      mimeType: detectedMime,
      userMpn,
      symptomDescription,
      targetContext,
    });

    // 6. Match identified component against Neon PostgreSQL catalogue
    const resolvedMpn = aiExtraction.likelyMpn || userMpn;
    const catalogueResult = await matchCataloguePart({
      mpn: resolvedMpn,
      category: aiExtraction.category,
      manufacturer: aiExtraction.manufacturerMarkings,
    });

    const matchedPart = catalogueResult.matchedPart;
    const candidateParts = catalogueResult.candidateParts;
    const isLiveDatabase = catalogueResult.dataSource === "LIVE_DATABASE";
    const isDemoFixture = catalogueResult.dataSource === "DEMO_FIXTURE";

    // Determine evaluation provenance source
    let evaluationSource: EvaluationSource;
    if (isLiveDatabase && matchedPart) {
      evaluationSource = "CATALOGUE_AUTHORITATIVE";
    } else if (isDemoFixture && matchedPart) {
      evaluationSource = "DEMO_FIXTURE_UNVERIFIED";
    } else {
      evaluationSource = "AI_EXTRACTED_UNVERIFIED";
    }

    // 7. Run Authoritative Deterministic Compatibility Engine
    let compatibilityReport: CompatibilityReport;

    if (matchedPart) {
      compatibilityReport = evaluateCompatibility(
        {
          id: matchedPart.id,
          mpn: matchedPart.mpn,
          name: matchedPart.name,
          category: matchedPart.category,
          specs: (matchedPart.specs as Record<string, unknown>) ?? {},
          supportedPlatforms: matchedPart.supportedPlatforms,
        },
        targetContext ?? {}
      );
    } else {
      // Evaluate against AI observed/inferred specs (unverified source)
      const combinedSpecs: Record<string, unknown> = {
        ...aiExtraction.inferredSpecs,
        ...aiExtraction.observedSpecs,
      };

      compatibilityReport = evaluateCompatibility(
        {
          mpn: resolvedMpn ?? "UNKNOWN-COMPONENT",
          name: aiExtraction.likelyMpn ?? "Uncatalogued Electronic Component",
          category: aiExtraction.category ?? ComponentCategory.ACCESSORY,
          specs: combinedSpecs,
        },
        targetContext ?? {}
      );
    }

    // -------------------------------------------------------------------------
    // CRITICAL SECURITY & SAFETY SAFEGUARD 1: DATABASE OUTAGE PROVENANCE CAP
    // If the live Neon database is unavailable, fixture-only results CAN NEVER
    // be represented or certified as VERIFIED. Capped to POSSIBLE or UNVERIFIED.
    // -------------------------------------------------------------------------
    if (isDemoFixture) {
      if (compatibilityReport.tier === "VERIFIED") {
        compatibilityReport.tier = "POSSIBLE";
      }

      const provenanceCondition: ConditionEvaluation = {
        name: "Catalogue Database Provenance",
        status: "UNKNOWN",
        message:
          "Neon PostgreSQL database is currently unreachable. Fitment was evaluated against offline demonstration sample data only. Production hardware fitment cannot be verified.",
      };

      compatibilityReport.conditions.unshift(provenanceCondition);
      compatibilityReport.unknownCount += 1;
      compatibilityReport.summary = `[OFFLINE DEMO FIXTURE — DATABASE OFFLINE] ${compatibilityReport.summary}`;
      compatibilityReport.confidenceScore = Math.min(compatibilityReport.confidenceScore, 0.5);
    }

    // -------------------------------------------------------------------------
    // CRITICAL SECURITY & SAFETY SAFEGUARD 2: UNCATALOGUED AI EVIDENCE BOUNDARY
    // An AI identification for an uncatalogued part can NEVER be VERIFIED.
    // Inferred values are never manufacturer-certified.
    // -------------------------------------------------------------------------
    if (!matchedPart && compatibilityReport.tier === "VERIFIED") {
      compatibilityReport.tier = "POSSIBLE";
      const unverifiedAiCondition: ConditionEvaluation = {
        name: "Component Datasheet Provenance",
        status: "UNKNOWN",
        message:
          "Component is not verified in the authoritative parts catalogue. AI-extracted parameters require physical multimeter and datasheet verification.",
      };
      compatibilityReport.conditions.unshift(unverifiedAiCondition);
      compatibilityReport.unknownCount += 1;
    }

    // -------------------------------------------------------------------------
    // CRITICAL SECURITY & SAFETY SAFEGUARD 3: PHYSICAL DAMAGE OVERRIDE
    // If physical damage is observed, hardware fitment CANNOT be verified or safe.
    // -------------------------------------------------------------------------
    if (aiExtraction.physicalDamage.detected && aiExtraction.physicalDamage.type !== "NONE") {
      const damageCondition: ConditionEvaluation = {
        name: "Visual Physical Integrity",
        status: "FAILED",
        message: `Visible physical damage detected: ${aiExtraction.physicalDamage.description} (${aiExtraction.physicalDamage.severity} severity). Applying power to damaged silicon risks catastrophic hardware failure.`,
      };

      compatibilityReport.conditions.unshift(damageCondition);
      compatibilityReport.failedCount += 1;
      compatibilityReport.tier = "UNVERIFIED";
      compatibilityReport.confidenceScore = 0.0;
      compatibilityReport.summary = `PHYSICAL DAMAGE DETECTED: ${aiExtraction.physicalDamage.description}. Hardware cannot be safely powered or mounted.`;
    }

    const responsePayload: DiagnoseResponse = {
      success: true,
      aiExtraction,
      matchedPart,
      candidateParts,
      compatibilityReport,
      meta: {
        modelUsed: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
        evaluationSource,
        dataSource: catalogueResult.dataSource,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        notice: catalogueResult.dbUnavailableNotice,
      },
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";

    // Detect timeout or upstream provider errors
    if (message.includes("GEMINI_TIMEOUT") || message.includes("timed out")) {
      return NextResponse.json(
        { error: "Diagnostic request timed out while communicating with Gemini AI." },
        { status: 504, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }

    if (message.includes("GEMINI_API_KEY_NOT_CONFIGURED")) {
      return NextResponse.json(
        {
          error:
            "Gemini Multimodal AI service is currently unavailable: GEMINI_API_KEY is not configured on the server. Please configure your API key in .env.",
        },
        { status: 503, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }

    // Production security: Strip any internal filesystem paths or database URLs from error message
    const sanitizedMessage = message
      .replace(/[A-Za-z]:\\[\w\\.-]+/g, "[internal-path]")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database-url]");

    return NextResponse.json(
      { error: `Diagnostic pipeline failed: ${sanitizedMessage}` },
      { status: 500, headers: { "X-Content-Type-Options": "nosniff" } }
    );
  }
}
