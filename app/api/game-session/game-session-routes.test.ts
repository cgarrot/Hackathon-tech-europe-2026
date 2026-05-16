import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import type { VoiceGamePublicSession } from "@/game-session/voice-game-engine";
import { resetVoiceGameSessionStoreForTests } from "@/game-session/session-store";
import { resetForgeRequestGuardsForTests } from "@/server/request-guards";
import { validForgeResult } from "@/test/forge-fixture";
import { POST as advanceSession } from "./[sessionId]/advance/route";
import { POST as startSession } from "./start/route";

type SessionSuccessResponse = {
  ok: true;
  session: VoiceGamePublicSession;
};

function fixture() {
  return structuredClone(validForgeResult);
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function oversizedJsonRequest(url: string, body: unknown, contentLength: number) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(contentLength) },
    body: JSON.stringify(body)
  });
}

function expectSessionSuccess(value: unknown): SessionSuccessResponse {
  expect(value).toMatchObject({ ok: true });
  return value as SessionSuccessResponse;
}

describe("game-session API routes", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GAMEFORGE_SESSION_RATE_LIMIT_WINDOW_MS;
    delete process.env.GAMEFORGE_SESSION_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.GAMEFORGE_MAX_CONCURRENT_SESSION_REQUESTS;
    resetVoiceGameSessionStoreForTests();
    resetForgeRequestGuardsForTests();
  });

  it("starts a public voice game session from a ForgeResult", async () => {
    const response = await startSession(jsonRequest("http://localhost/api/game-session/start", { forgeResult: fixture() }));
    const body = expectSessionSuccess(await response.json());

    expect(response.status).toBe(200);
    expect(body.session.title).toBe("Les Ombres du Hameau");
    expect(body.session.events.every((event) => event.visibility === "public")).toBe(true);
    expect(JSON.stringify(body.session)).not.toContain("roleId");
    expect(body.session.ownPlayer?.roleName).toEqual(expect.any(String));
  });

  it("preserves generated persona sample lines and speech style through session start", async () => {
    const result = fixture();
    result.package.personas[0] = {
      ...result.package.personas[0],
      speechStyle: "tendu, chaleureux et précis",
      sampleLines: ["[tense] Je garde les yeux ouverts pendant cette phase."]
    };

    const response = await startSession(jsonRequest("http://localhost/api/game-session/start", { forgeResult: result }));
    const body = expectSessionSuccess(await response.json());
    const personaEvent = body.session.events.find((event) => event.kind === "utterance" && event.speaker.kind === "persona");

    expect(response.status).toBe(200);
    expect(personaEvent?.speaker.speechStyle).toBe("tendu, chaleureux et précis");
    expect(personaEvent?.text).toBe("[tense] Je garde les yeux ouverts pendant cette phase.");
  });

  it("advances an existing session by id", async () => {
    const startResponse = await startSession(jsonRequest("http://localhost/api/game-session/start", { forgeResult: fixture() }));
    const started = expectSessionSuccess(await startResponse.json());

    const advanceResponse = await advanceSession(
      jsonRequest(`http://localhost/api/game-session/${started.session.sessionId}/advance`, {}),
      { params: Promise.resolve({ sessionId: started.session.sessionId }) }
    );
    const advanced = expectSessionSuccess(await advanceResponse.json());

    expect(advanceResponse.status).toBe(200);
    expect(advanced.session.activePhase.id).toBe("night");
    expect(advanced.session.pendingInput?.phaseId).toBe("night");
  });

  it("returns 404 for unknown sessions", async () => {
    const response = await advanceSession(
      jsonRequest("http://localhost/api/game-session/missing/advance", {}),
      { params: Promise.resolve({ sessionId: "missing" }) }
    );
    const body = await response.json() as { ok: false; error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("voice_session_not_found");
  });

  it("rate-limits repeated session starts", async () => {
    process.env.GAMEFORGE_SESSION_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.GAMEFORGE_SESSION_RATE_LIMIT_MAX_REQUESTS = "1";

    const first = await startSession(jsonRequest("http://localhost/api/game-session/start", { forgeResult: fixture() }));
    const second = await startSession(jsonRequest("http://localhost/api/game-session/start", { forgeResult: fixture() }));
    const body = await second.json() as { ok: false; error: string };

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(body.error).toBe("rate_limit_exceeded");
  });

  it("rejects oversized session payloads before parsing", async () => {
    const response = await startSession(oversizedJsonRequest(
      "http://localhost/api/game-session/start",
      { forgeResult: fixture() },
      600 * 1024
    ));
    const body = await response.json() as { ok: false; error: string };

    expect(response.status).toBe(413);
    expect(body.error).toBe("request_too_large");
  });
});
