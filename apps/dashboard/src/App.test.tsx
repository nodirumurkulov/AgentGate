// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { DashboardAuditEvent } from "./api";

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

  it("renders newest audit decisions first", () => {
    const olderEvent: DashboardAuditEvent = {
      action: "pull_requests.update",
      changedFiles: ["README.md"],
      decision: "allow",
      id: "audit_old",
      repository: "nodirumurkulov/AgentGate",
      riskLevel: "low",
      riskReasons: ["Documentation-only change."],
      timestamp: "2026-06-20T00:00:00.000Z",
    };
    const newerEvent: DashboardAuditEvent = {
      ...olderEvent,
      changedFiles: ["src/auth/session.ts"],
      decision: "approval_required",
      id: "audit_new",
      riskLevel: "high",
      riskReasons: ["Authentication or authorization code changed."],
      timestamp: "2026-06-22T00:00:00.000Z",
    };

    render(<App initialAuditEvents={[olderEvent, newerEvent]} />);

    const newerAuditId = screen.getByText("audit_new");
    const olderAuditId = screen.getByText("audit_old");

    expect(newerAuditId.compareDocumentPosition(olderAuditId) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("summarizes expired approval callback events", () => {
    render(
      <App
        initialAuditEvents={[
          {
            action: "slack.approval.expired",
            changedFiles: ["src/auth/session.ts"],
            decision: "block",
            id: "audit_expired",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Approval callback token expired."],
            timestamp: "2026-06-25T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Expired approvals")).toBeTruthy();
    expect(screen.getByText("slack.approval.expired")).toBeTruthy();
    expect(screen.getByText("Approval callback token expired.")).toBeTruthy();
  });
});
