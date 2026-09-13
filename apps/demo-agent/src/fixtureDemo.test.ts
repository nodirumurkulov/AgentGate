import { afterEach, describe, expect, it, vi } from "vitest";
import * as scenarios from "./scenario";
import { runFixtureDemo } from "./fixtureDemo";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fixture demo", () => {
  it("runs all three decisions and audit records without using live settings or network", async () => {
    vi.stubEnv("AGENTGATE_ADAPTER_MODE", "real");
    vi.stubEnv("AGENTGATE_STORE_PATH", "/must-not-write-agentgate-demo.json");
    vi.stubEnv("AGENTGATE_BASE_URL", "https://must-not-contact.invalid");
    const fetcher = vi.fn(() => {
      throw new Error("Network is forbidden in the fixture demo.");
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await runFixtureDemo();

    expect(result.scenarios).toEqual([
      {
        name: "docs-only PR creation",
        statusCode: 200,
        outcome: "allow",
        execution: "fixture",
        approval: "none",
      },
      {
        name: "auth-code PR update",
        statusCode: 202,
        outcome: "approval_required",
        execution: "none",
        approval: "pending",
      },
      {
        name: "direct branch push",
        statusCode: 403,
        outcome: "block",
        execution: "none",
        approval: "none",
      },
    ]);
    expect(result.auditDecisions).toEqual(["allow", "approval_required", "block"]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await runFixtureDemo()).toEqual(result);
  });

  it("rejects an unexpected decision instead of printing a successful demo", async () => {
    const inputs = scenarios.buildCodeChangeScenarios();
    inputs[0]!.request.action = "branches.push_direct";
    vi.spyOn(scenarios, "buildCodeChangeScenarios").mockReturnValue(inputs);

    await expect(runFixtureDemo()).rejects.toThrow(/docs-only PR creation/);
  });
});
