// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders blocked code-change audit evidence", () => {
    render(
      <App
        initialAuditEvents={[
          {
            action: "branches.push_direct",
            changedFiles: ["src/auth/session.ts"],
            decision: "block",
            id: "audit_1",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Authentication or authorization code changed."],
            timestamp: "2026-06-21T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("block")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("audit_1")).toBeTruthy();
    expect(screen.getByText("2026-06-21T00:00:00.000Z")).toBeTruthy();
    expect(screen.getByText("src/auth/session.ts")).toBeTruthy();
    expect(screen.getByText("Authentication or authorization code changed.")).toBeTruthy();
  });
});
