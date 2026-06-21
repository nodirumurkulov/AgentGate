import { describe, expect, it } from "vitest";
import { classifyCodeChangeRisk } from "./codeRisk";

describe("classifyCodeChangeRisk", () => {
  it("classifies README-only changes as low risk", () => {
    const risk = classifyCodeChangeRisk({
      changedFiles: ["README.md"],
    });

    expect(risk.level).toBe("low");
    expect(risk.reasons).toContain("Only documentation files changed.");
  });

  it("classifies auth changes as high risk", () => {
    const risk = classifyCodeChangeRisk({
      changedFiles: ["src/auth/session.ts"],
    });

    expect(risk.level).toBe("high");
    expect(risk.reasons).toContain("Authentication or authorization code changed.");
  });

  it("classifies CI workflow changes as high risk", () => {
    const risk = classifyCodeChangeRisk({
      changedFiles: [".github/workflows/ci.yml"],
    });

    expect(risk.level).toBe("high");
    expect(risk.reasons).toContain("CI or repository automation changed.");
  });

  it("classifies package lock changes as medium risk", () => {
    const risk = classifyCodeChangeRisk({
      changedFiles: ["package-lock.json"],
    });

    expect(risk.level).toBe("medium");
    expect(risk.reasons).toContain("Dependency lockfile changed.");
  });

  it("classifies deleted tests as high risk", () => {
    const risk = classifyCodeChangeRisk({
      changedFiles: [],
      deletedFiles: ["packages/core/src/index.test.ts"],
    });

    expect(risk.level).toBe("high");
    expect(risk.reasons).toContain("Test file deleted.");
  });
});

