export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface ImageValidationResult {
  isValid: boolean;
  detectedMime?: SupportedImageMime;
  error?: string;
  statusCode?: number;
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB ceiling

/**
 * Validates actual binary file signatures (magic bytes) to prevent executable,
 * HTML, or malicious scripts disguised with deceptive MIME extensions.
 */
export function validateImageSignature(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      error: "Uploaded image file is empty (0 bytes).",
      statusCode: 400,
    };
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `Uploaded photograph exceeds the 5 MB size limit (received ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
      statusCode: 413,
    };
  }

  // 1. JPEG signature: 0xFF 0xD8 0xFF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      isValid: true,
      detectedMime: "image/jpeg",
    };
  }

  // 2. PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      isValid: true,
      detectedMime: "image/png",
    };
  }

  // 3. WEBP signature: 'RIFF' .... 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return {
      isValid: true,
      detectedMime: "image/webp",
    };
  }

  return {
    isValid: false,
    error:
      "File header signature does not match a valid JPEG, PNG, or WEBP image format. Disguised or corrupted files are rejected.",
    statusCode: 400,
  };
}
