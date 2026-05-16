import { NextRequest, NextResponse } from "next/server";
import { ForgeResultSchema } from "@/compiler/schemas";
import { validateForgeResult } from "@/compiler/validators";
import { createStoredVoiceGameSession } from "@/game-session/session-store";
import {
  checkGameSessionRateLimit,
  gameSessionRateLimitHeaders,
  readClientIdentifier,
  releaseGameSessionRequestSlot,
  tryAcquireGameSessionRequestSlot
} from "@/server/request-guards";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_START_BODY_BYTES = 512 * 1024;

const StartGameSessionRequestSchema = z
  .object({
    forgeResult: ForgeResultSchema
  })
  .strict();

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

function bodyTooLarge(request: NextRequest, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export async function POST(request: NextRequest) {
  const rateLimit = checkGameSessionRateLimit(readClientIdentifier(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limit_exceeded",
        details: { retryAfterSeconds: rateLimit.retryAfterSeconds }
      },
      { status: 429, headers: gameSessionRateLimitHeaders(rateLimit) }
    );
  }

  if (bodyTooLarge(request, MAX_START_BODY_BYTES)) {
    return jsonError("request_too_large", 413, { maxBytes: MAX_START_BODY_BYTES });
  }

  if (!tryAcquireGameSessionRequestSlot()) {
    return jsonError("too_many_concurrent_session_requests", 429, {
      hint: "Another game session request is already running. Retry in a few seconds."
    });
  }

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError("malformed_json", 400);
    }

    const parsedBody = StartGameSessionRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return jsonError("request_validation_error", 400, parsedBody.error.issues);
    }

    const invariantIssues = validateForgeResult(parsedBody.data.forgeResult);
    if (invariantIssues.length > 0) {
      return jsonError("compiler_invariant_failed", 422, invariantIssues);
    }

    const session = createStoredVoiceGameSession(parsedBody.data.forgeResult);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("voice_session_validation_failed", 500, error.issues);
    }

    console.error("GameForge voice session start failed.", error);
    return jsonError("voice_session_start_failed", 500);
  } finally {
    releaseGameSessionRequestSlot();
  }
}
