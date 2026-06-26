import { describe, expect, it } from "vitest";
import { fetchAuditEvents } from "./api";

describe("fetchAuditEvents", () => {
  it("loads audit events from the gateway audit endpoint", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      calls.push(String(input));

      return Response.json({
        events: [
          {
            action: "pull_requests.create",
            changedFiles: ["README.md"],
            decision: "allow",
            id: "audit_1",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "low",
            riskReasons: ["Documentation-only change."],
            timestamp: "2026-06-26T00:00:00.000Z",
          },
        ],
      });
    };

    const events = await fetchAuditEvents({ fetcher });

    expect(calls).toEqual(["/v1/audit"]);
    expect(events).toEqual([
      {
        action: "pull_requests.create",
        changedFiles: ["README.md"],
        decision: "allow",
        id: "audit_1",
        repository: "nodirumurkulov/AgentGate",
        riskLevel: "low",
        riskReasons: ["Documentation-only change."],
        timestamp: "2026-06-26T00:00:00.000Z",
      },
    ]);
  });
});
