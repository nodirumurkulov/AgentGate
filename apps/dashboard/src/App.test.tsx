// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DashboardAuditEvent } from "./api";

const liveAuditEvent: DashboardAuditEvent = {
  action: "pull_requests.create",
  changedFiles: ["README.md"],
  decision: "allow",
  id: "audit_live",
  repository: "nodirumurkulov/AgentGate",
  riskLevel: "low",
  riskReasons: ["Documentation-only change."],
  timestamp: "2026-06-26T00:00:00.000Z",
};

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("summarizes rejected approval callback events", () => {
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
          {
            action: "slack.approval.invalid_token",
            changedFiles: ["src/auth/session.ts"],
            decision: "block",
            id: "audit_invalid",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Invalid approval callback token."],
            timestamp: "2026-06-25T00:01:00.000Z",
          },
          {
            action: "slack.approval.replayed",
            changedFiles: ["src/auth/session.ts"],
            decision: "block",
            id: "audit_replayed",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Approval callback was already decided."],
            timestamp: "2026-06-25T00:02:00.000Z",
          },
          {
            action: "slack.approval.approved",
            changedFiles: ["src/auth/session.ts"],
            decision: "allow",
            id: "audit_approved",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Approval granted by reviewer."],
            timestamp: "2026-06-25T00:03:00.000Z",
          },
          {
            action: "slack.approval.denied",
            changedFiles: ["src/auth/session.ts"],
            decision: "block",
            id: "audit_denied",
            repository: "nodirumurkulov/AgentGate",
            riskLevel: "high",
            riskReasons: ["Approval denied by reviewer."],
            timestamp: "2026-06-25T00:04:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Approved callbacks")).toBeTruthy();
    expect(screen.getByText("Denied callbacks")).toBeTruthy();
    expect(screen.getByText("Expired approvals")).toBeTruthy();
    expect(screen.getByText("Invalid tokens")).toBeTruthy();
    expect(screen.getByText("Replayed callbacks")).toBeTruthy();
    expect(screen.getByText("slack.approval.approved")).toBeTruthy();
    expect(screen.getByText("slack.approval.denied")).toBeTruthy();
    expect(screen.getByText("slack.approval.expired")).toBeTruthy();
    expect(screen.getByText("slack.approval.invalid_token")).toBeTruthy();
    expect(screen.getByText("slack.approval.replayed")).toBeTruthy();
    expect(screen.getByText("Approval granted by reviewer.")).toBeTruthy();
    expect(screen.getByText("Approval denied by reviewer.")).toBeTruthy();
    expect(screen.getByText("Approval callback token expired.")).toBeTruthy();
    expect(screen.getByText("Invalid approval callback token.")).toBeTruthy();
    expect(screen.getByText("Approval callback was already decided.")).toBeTruthy();
  });

  it("polls audit events after initial render", async () => {
    vi.useFakeTimers();
    const loadAuditEvents = vi.fn().mockResolvedValue([liveAuditEvent]);

    render(<App loadAuditEvents={loadAuditEvents} pollIntervalMs={1000} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("audit_live")).toBeTruthy();
    expect(loadAuditEvents).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(loadAuditEvents).toHaveBeenCalledTimes(2);
  });
});
