import { createHmac, timingSafeEqual } from "node:crypto";

interface VerifyGitHubSignatureInput {
  body: string;
  signature: string;
  webhookSecret: string;
}

export function verifyGitHubSignature(input: VerifyGitHubSignatureInput): boolean {
  const expected = `sha256=${createHmac("sha256", input.webhookSecret)
    .update(input.body)
    .digest("hex")}`;

  return safeEqual(expected, input.signature);
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
