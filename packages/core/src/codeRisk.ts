export type CodeRiskLevel = "low" | "medium" | "high";

export interface CodeChangeRiskInput {
  changedFiles: string[];
  deletedFiles?: string[];
  diffText?: string;
}

export interface CodeChangeRisk {
  level: CodeRiskLevel;
  reasons: string[];
}

const documentationPatterns = [/^README\.md$/i, /^docs\//i, /\.md$/i];
const authPatterns = [/(^|\/)(auth|authorization|session|jwt|oauth)(\/|\.|-|_)/i];
const ciPatterns = [/^\.github\/workflows\//i, /(^|\/)(ci|workflow|pipeline)\.(ya?ml)$/i];
const dependencyPatterns = [/^package-lock\.json$/i, /^pnpm-lock\.yaml$/i, /^yarn\.lock$/i];
const secretPatterns = [/(^|\/)\.env/i, /(secret|credential|private-key|private_key)/i];
const testPatterns = [/(\.|\/)(test|spec)\.[jt]sx?$/i, /(^|\/)__tests__\//i];

export function classifyCodeChangeRisk(input: CodeChangeRiskInput): CodeChangeRisk {
  const changedFiles = normalizeFiles(input.changedFiles);
  const deletedFiles = normalizeFiles(input.deletedFiles ?? []);
  const reasons = collectRiskReasons(changedFiles, deletedFiles, input.diffText ?? "");

  if (hasHighRiskReason(reasons)) {
    return { level: "high", reasons };
  }

  if (hasMediumRiskReason(reasons)) {
    return { level: "medium", reasons };
  }

  if (changedFiles.length > 0 && changedFiles.every(isDocumentationFile)) {
    return { level: "low", reasons: ["Only documentation files changed."] };
  }

  return { level: "medium", reasons: ["Source files changed."] };
}

function collectRiskReasons(changedFiles: string[], deletedFiles: string[], diffText: string): string[] {
  const reasons = new Set<string>();

  if (changedFiles.some(matchesAny(authPatterns))) {
    reasons.add("Authentication or authorization code changed.");
  }

  if (changedFiles.some(matchesAny(ciPatterns))) {
    reasons.add("CI or repository automation changed.");
  }

  if (changedFiles.some(matchesAny(secretPatterns))) {
    reasons.add("Secret-like file changed.");
  }

  if (changedFiles.some(matchesAny(dependencyPatterns))) {
    reasons.add("Dependency lockfile changed.");
  }

  if (deletedFiles.some(matchesAny(testPatterns))) {
    reasons.add("Test file deleted.");
  }

  if (containsSecretSignal(diffText)) {
    reasons.add("Diff contains secret-like text.");
  }

  return [...reasons];
}

function normalizeFiles(files: string[]): string[] {
  return files.map((file) => file.trim()).filter(Boolean);
}

function matchesAny(patterns: RegExp[]): (file: string) => boolean {
  return (file) => patterns.some((pattern) => pattern.test(file));
}

function isDocumentationFile(file: string): boolean {
  return documentationPatterns.some((pattern) => pattern.test(file));
}

function hasHighRiskReason(reasons: string[]): boolean {
  return reasons.some((reason) =>
    [
      "Authentication or authorization code changed.",
      "CI or repository automation changed.",
      "Secret-like file changed.",
      "Test file deleted.",
      "Diff contains secret-like text.",
    ].includes(reason),
  );
}

function hasMediumRiskReason(reasons: string[]): boolean {
  return reasons.includes("Dependency lockfile changed.");
}

function containsSecretSignal(diffText: string): boolean {
  return /\b(secret|token|password|private key|credential)\b/i.test(diffText);
}

