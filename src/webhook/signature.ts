import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

export function verifyWebhookSignature(
  secret: string,
  rawBody: Uint8Array,
  signatureHeader: string | null | undefined,
): boolean {
  if (secret.length === 0 || signatureHeader === null || signatureHeader === undefined) return false;
  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  const hex = match?.[1];
  if (hex === undefined) return false;

  const supplied = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
