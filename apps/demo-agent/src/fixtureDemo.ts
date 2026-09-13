import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AuditEvent } from "@agentgate/core";
import { createGatewayApp } from "../../gateway/src/app";
import { createFixtureAdapters } from "../../gateway/src/adapters/fixtureAdapters";
import { MemoryStore } from "../../gateway/src/stores/memoryStore";
import { buildCodeChangeScenarios, type ScenarioOutcome } from "./scenario";

interface ScenarioSummary {
  name: string;
  statusCode: number;
  outcome: ScenarioOutcome;
  execution: "fixture" | "none";
  approval: "pending" | "none";
}

interface ScenarioResponse {
  decision: { outcome: ScenarioOutcome };
  execution?: { ok: boolean; externalRequestId?: string };
  approval?: { status: string; callbackToken?: string; callbackTokenHash?: string };
}

export async function runFixtureDemo() {
  const fixtures = createFixtureAdapters();
  let executions = 0;
  let notifications = 0;
  const app = createGatewayApp({
    env: {},
    store: new MemoryStore(),
    adapters: {
      github: {
        ...fixtures.github,
        execute: async (request) => {
          executions += 1;
          return fixtures.github.execute(request);
        },
        publishAgentGateStatus: (status) => fixtures.github.publishAgentGateStatus(status),
      },
      slack: {
        ...fixtures.slack,
        notifyApprovalRequired: async (approval) => {
          notifications += 1;
          return fixtures.slack.notifyApprovalRequired(approval);
        },
      },
    },
  });
  const scenarios: ScenarioSummary[] = [];

  try {
    for (const scenario of buildCodeChangeScenarios()) {
      const before = { executions, notifications };
      const response = await app.inject({
        method: "POST",
        url: "/v1/actions/execute",
        payload: scenario.request,
      });
      const body = response.json<ScenarioResponse>();
      assertScenarioResponse(scenario.name, scenario.expectedOutcome, response.statusCode, body);
      assert.equal(
        executions - before.executions,
        scenario.expectedOutcome === "allow" ? 1 : 0,
        `${scenario.name}: GitHub calls`,
      );
      assert.equal(
        notifications - before.notifications,
        scenario.expectedOutcome === "approval_required" ? 1 : 0,
        `${scenario.name}: Slack calls`,
      );
      scenarios.push({
        name: scenario.name,
        statusCode: response.statusCode,
        outcome: body.decision.outcome,
        execution: body.execution ? "fixture" : "none",
        approval: body.approval ? "pending" : "none",
      });
    }
    const audit = await app.inject({ method: "GET", url: "/v1/audit" });
    assert.equal(audit.statusCode, 200, "Audit endpoint must succeed");
    const { events } = audit.json<{ events: AuditEvent[] }>();
    const auditDecisions = events.map((event) => event.decision);
    assert.deepEqual(
      auditDecisions,
      scenarios.map((scenario) => scenario.outcome),
      "Audit decisions must match the scenarios",
    );
    verifyAuditChain(events);
    return { scenarios, auditDecisions };
  } finally {
    await app.close();
  }
}

function assertScenarioResponse(
  name: string,
  expected: ScenarioOutcome,
  status: number,
  body: ScenarioResponse,
): void {
  const expectedStatus = { allow: 200, approval_required: 202, block: 403 }[expected];
  assert.equal(status, expectedStatus, `${name}: HTTP status`);
  assert.equal(body.decision.outcome, expected, `${name}: decision`);
  if (expected === "allow") {
    assert.equal(body.execution?.ok, true, `${name}: fixture execution`);
    assert.match(
      body.execution?.externalRequestId ?? "",
      /^fixture_github_/,
      `${name}: fixture adapter`,
    );
  } else {
    assert.equal(body.execution, undefined, `${name}: must not execute`);
  }
  if (expected === "approval_required") {
    assert.equal(body.approval?.status, "pending", `${name}: approval state`);
    assert.equal(body.approval?.callbackToken, undefined, `${name}: no public callback token`);
    assert.equal(body.approval?.callbackTokenHash, undefined, `${name}: no public token hash`);
  } else {
    assert.equal(body.approval, undefined, `${name}: no approval`);
  }
}

function verifyAuditChain(events: AuditEvent[]): void {
  let previousHash = "genesis";
  for (const { hash, ...event } of events) {
    assert.equal(event.previousHash, previousHash, "Audit chain link");
    assert.equal(
      hash,
      createHash("sha256").update(JSON.stringify(event)).digest("hex"),
      "Audit event hash",
    );
    previousHash = hash;
  }
}
