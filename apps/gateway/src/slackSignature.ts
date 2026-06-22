import { createHmac, timingSafeEqual } from "node:crypto";

interface VerifySlackSignatureInput {
  body: string;
  maxAgeSeconds?: number;
  nowSeconds?: number;
  signature: string;
  signingSecret: string;
  timestamp: string;
}

const defaultMaxAgeSeconds = 300;

export function verifySlackSignature(input: VerifySlackSignatureInput): boolean {
  if (!timestampIsFresh(input)) {
    return false;
  }

  const expected = createSignature(input.signingSecret, input.timestamp, input.body);

  return safeEqual(expected, input.signature);
}

function timestampIsFresh(input: VerifySlackSignatureInput): boolean {
  const timestampSeconds = Number(input.timestamp);

  if (!Number.isInteger(timestampSeconds)) {
    return false;
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = input.maxAgeSeconds ?? defaultMaxAgeSeconds;

  return Math.abs(nowSeconds - timestampSeconds) <= maxAgeSeconds;
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
