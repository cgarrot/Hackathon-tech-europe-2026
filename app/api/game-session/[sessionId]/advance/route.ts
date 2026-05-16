import { NextRequest, NextResponse } from "next/server";
import { advanceStoredVoiceGameSession } from "@/game-session/session-store";
import {
  checkGameSessionRateLimit,
  gameSessionRateLimitHeaders,
  readClientIdentifier,
  releaseGameSessionRequestSlot,
  tryAcquireGameSessionRequestSlot
} from "@/server/request-guards";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_ADVANCE_BODY_BYTES = 8 * 1024;

const AdvanceGameSessionRequestSchema = z
  .object({
    transcript: z.string().min(1).max(1200).optional(),
    participantId: z.string().min(1).max(160).optional()
  })
  .strict();

type AdvanceRouteContext = {
  params: Promise<{ sessionId: string }>;
};

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

function bodyTooLarge(request: NextRequest, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export async function POST(request: NextRequest, context: AdvanceRouteContext) {
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

  if (bodyTooLarge(request, MAX_ADVANCE_BODY_BYTES)) {
    return jsonError("request_too_large", 413, { maxBytes: MAX_ADVANCE_BODY_BYTES });
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

    const parsedBody = AdvanceGameSessionRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return jsonError("request_validation_error", 400, parsedBody.error.issues);
    }

    const { sessionId } = await context.params;
    const session = advanceStoredVoiceGameSession(sessionId, parsedBody.data);
    if (!session) {
      return jsonError("voice_session_not_found", 404);
    }

    return NextResponse.json({ ok: true, session });
  } finally {
    releaseGameSessionRequestSlot();
  }
}
