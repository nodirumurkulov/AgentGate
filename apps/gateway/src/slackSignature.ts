import { createHmac, timingSafeEqual } from "node:crypto";

interface VerifySlackSignatureInput {
  body: string;
  signature: string;
  signingSecret: string;
  timestamp: string;
}

export function verifySlackSignature(input: VerifySlackSignatureInput): boolean {
  const expected = createSignature(input.signingSecret, input.timestamp, input.body);

  return safeEqual(expected, input.signature);
}

function createSignature(signingSecret: string, timestamp: string, body: string): string {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
