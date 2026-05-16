import { afterEach, describe, expect, it } from "vitest";
import {
  checkForgeRateLimit,
  checkVoiceRateLimit,
  forgeRateLimitHeaders,
  releaseForgeRequestSlot,
  releaseVoiceRequestSlot,
  resetForgeRequestGuardsForTests,
  tryAcquireForgeRequestSlot,
  tryAcquireVoiceRequestSlot
} from "./request-guards";

const originalEnv = process.env;

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.GAMEFORGE_RATE_LIMIT_WINDOW_MS;
  delete process.env.GAMEFORGE_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.GAMEFORGE_MAX_CONCURRENT_REQUESTS;
  delete process.env.GAMEFORGE_VOICE_RATE_LIMIT_WINDOW_MS;
  delete process.env.GAMEFORGE_VOICE_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.GAMEFORGE_MAX_CONCURRENT_VOICE_REQUESTS;
}

describe("request guards", () => {
  afterEach(() => {
    resetEnv();
    resetForgeRequestGuardsForTests();
  });

  it("limits repeated forge requests per client and exposes retry headers", () => {
    process.env.GAMEFORGE_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.GAMEFORGE_RATE_LIMIT_MAX_REQUESTS = "2";

    expect(checkForgeRateLimit("client-a", 1_000).allowed).toBe(true);
    expect(checkForgeRateLimit("client-a", 1_100).allowed).toBe(true);
    const blocked = checkForgeRateLimit("client-a", 1_200);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(forgeRateLimitHeaders(blocked)).toMatchObject({
      "Retry-After": "1",
      "X-RateLimit-Limit": "2",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "2"
    });
  });

  it("resets rate limits after the configured window", () => {
    process.env.GAMEFORGE_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.GAMEFORGE_RATE_LIMIT_MAX_REQUESTS = "1";

    expect(checkForgeRateLimit("client-a", 1_000).allowed).toBe(true);
    expect(checkForgeRateLimit("client-a", 1_100).allowed).toBe(false);
    expect(checkForgeRateLimit("client-a", 2_000).allowed).toBe(true);
  });

  it("caps concurrent forge requests", () => {
    process.env.GAMEFORGE_MAX_CONCURRENT_REQUESTS = "1";

    expect(tryAcquireForgeRequestSlot()).toBe(true);
    expect(tryAcquireForgeRequestSlot()).toBe(false);

    releaseForgeRequestSlot();
    expect(tryAcquireForgeRequestSlot()).toBe(true);
  });

  it("limits voice requests separately from forge requests", () => {
    process.env.GAMEFORGE_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.GAMEFORGE_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.GAMEFORGE_VOICE_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.GAMEFORGE_VOICE_RATE_LIMIT_MAX_REQUESTS = "2";

    expect(checkForgeRateLimit("client-a", 1_000).allowed).toBe(true);
    expect(checkForgeRateLimit("client-a", 1_100).allowed).toBe(false);
    expect(checkVoiceRateLimit("client-a", 1_100).allowed).toBe(true);
    expect(checkVoiceRateLimit("client-a", 1_200).allowed).toBe(true);
    expect(checkVoiceRateLimit("client-a", 1_300).allowed).toBe(false);
  });

  it("caps concurrent voice requests separately", () => {
    process.env.GAMEFORGE_MAX_CONCURRENT_VOICE_REQUESTS = "1";

    expect(tryAcquireVoiceRequestSlot()).toBe(true);
    expect(tryAcquireVoiceRequestSlot()).toBe(false);

    releaseVoiceRequestSlot();
    expect(tryAcquireVoiceRequestSlot()).toBe(true);
  });
});
