import { createHash } from "node:crypto";
import type { CodeRiskLevel, DecisionOutcome } from "./types";

export interface CreateAuditEventInput {
  action: string;
  changedFiles: string[];
  decision: DecisionOutcome;
  id: string;
  payload?: unknown;
  previousHash: string;
  repository: string;
  requestId: string;
  riskLevel: CodeRiskLevel;
  riskReasons: string[];
  timestamp: string;
}

export interface AuditEvent extends CreateAuditEventInput {
  hash: string;
  payload?: unknown;
}

const sensitiveKeyPattern = /token|secret|password|privatekey|private_key|credential/i;

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  const event = {
    ...input,
    payload: input.payload === undefined ? undefined : redactValue(input.payload),
  };
  const hash = hashEvent(event);

  return {
    ...event,
    hash,
  };
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactValue(item),
    ]),
  );
}

function hashEvent(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

