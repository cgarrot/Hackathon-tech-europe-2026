import type { NextRequest } from "next/server";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 8;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 2;
const DEFAULT_VOICE_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_MAX_CONCURRENT_VOICE_REQUESTS = 4;
const MAX_TRACKED_CLIENTS = 1_000;

type RateLimitBucket = {
  windowStart: number;
  count: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const forgeRateLimitBuckets = new Map<string, RateLimitBucket>();
const voiceRateLimitBuckets = new Map<string, RateLimitBucket>();
let activeForgeRequests = 0;
let activeVoiceRequests = 0;

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;

  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function cleanOldBuckets(buckets: Map<string, RateLimitBucket>, now: number, windowMs: number) {
  if (buckets.size <= MAX_TRACKED_CLIENTS) {
    return;
  }

  for (const [clientId, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(clientId);
    }
  }
}

function checkRateLimit(
  buckets: Map<string, RateLimitBucket>,
  clientId: string,
  windowEnvName: string,
  limitEnvName: string,
  fallbackWindowMs: number,
  fallbackLimit: number,
  now: number
): RateLimitResult {
  const windowMs = readPositiveInteger(windowEnvName, fallbackWindowMs);
  const limit = readPositiveInteger(limitEnvName, fallbackLimit);
  const existingBucket = buckets.get(clientId);
  const bucket = !existingBucket || now - existingBucket.windowStart >= windowMs
    ? { windowStart: now, count: 0 }
    : existingBucket;

  bucket.count += 1;
  buckets.set(clientId, bucket);
  cleanOldBuckets(buckets, now, windowMs);

  const resetAt = bucket.windowStart + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const remaining = Math.max(0, limit - bucket.count);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds
  };
}

export function readClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "local-client";
}

export function checkForgeRateLimit(clientId: string, now = Date.now()): RateLimitResult {
  return checkRateLimit(
    forgeRateLimitBuckets,
    clientId,
    "GAMEFORGE_RATE_LIMIT_WINDOW_MS",
    "GAMEFORGE_RATE_LIMIT_MAX_REQUESTS",
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    now
  );
}

export function checkVoiceRateLimit(clientId: string, now = Date.now()): RateLimitResult {
  return checkRateLimit(
    voiceRateLimitBuckets,
    clientId,
    "GAMEFORGE_VOICE_RATE_LIMIT_WINDOW_MS",
    "GAMEFORGE_VOICE_RATE_LIMIT_MAX_REQUESTS",
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_VOICE_RATE_LIMIT_MAX_REQUESTS,
    now
  );
}

export function forgeRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
  };
}

export const voiceRateLimitHeaders = forgeRateLimitHeaders;

export function tryAcquireForgeRequestSlot() {
  const maxConcurrentRequests = readPositiveInteger("GAMEFORGE_MAX_CONCURRENT_REQUESTS", DEFAULT_MAX_CONCURRENT_REQUESTS);

  if (activeForgeRequests >= maxConcurrentRequests) {
    return false;
  }

  activeForgeRequests += 1;
  return true;
}

export function releaseForgeRequestSlot() {
  activeForgeRequests = Math.max(0, activeForgeRequests - 1);
}

export function tryAcquireVoiceRequestSlot() {
  const maxConcurrentRequests = readPositiveInteger("GAMEFORGE_MAX_CONCURRENT_VOICE_REQUESTS", DEFAULT_MAX_CONCURRENT_VOICE_REQUESTS);

  if (activeVoiceRequests >= maxConcurrentRequests) {
    return false;
  }

  activeVoiceRequests += 1;
  return true;
}

export function releaseVoiceRequestSlot() {
  activeVoiceRequests = Math.max(0, activeVoiceRequests - 1);
}

export function resetForgeRequestGuardsForTests() {
  forgeRateLimitBuckets.clear();
  voiceRateLimitBuckets.clear();
  activeForgeRequests = 0;
  activeVoiceRequests = 0;
}
