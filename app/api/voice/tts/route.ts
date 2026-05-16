import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GradiumApiError, GradiumConfigError, synthesizeSpeechStream } from "@/server/gradium-client";
import {
  checkVoiceRateLimit,
  readClientIdentifier,
  releaseVoiceRequestSlot,
  tryAcquireVoiceRequestSlot,
  voiceRateLimitHeaders
} from "@/server/request-guards";
import { stripAllowedEmotionTags } from "@/voice-emotion-tags";

export const runtime = "nodejs";

const TtsRequestSchema = z
  .object({
    text: z.string().min(1).max(1200),
    voiceId: z.string().min(1).max(160).optional(),
    personaId: z.string().min(1).max(160).optional(),
    speechStyle: z.string().min(1).max(400).optional(),
    language: z.string().min(2).max(16).optional(),
    outputFormat: z.enum([
      "wav",
      "pcm",
      "opus",
      "ulaw_8000",
      "mulaw_8000",
      "alaw_8000",
      "pcm_8000",
      "pcm_16000",
      "pcm_22050",
      "pcm_24000",
      "pcm_44100",
      "pcm_48000"
    ]).default("wav")
  })
  .strict();

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

export async function POST(request: NextRequest) {
  const rateLimit = checkVoiceRateLimit(readClientIdentifier(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limit_exceeded",
        details: { retryAfterSeconds: rateLimit.retryAfterSeconds }
      },
      { status: 429, headers: voiceRateLimitHeaders(rateLimit) }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("malformed_json", 400);
  }

  const parsedBody = TtsRequestSchema.safeParse(payload);
  if (!parsedBody.success) {
    return jsonError("request_validation_error", 400, parsedBody.error.issues);
  }

  if (!tryAcquireVoiceRequestSlot()) {
    return jsonError("too_many_concurrent_voice_requests", 429, {
      hint: "Another Gradium voice request is already running. Retry in a few seconds."
    });
  }

  try {
    const body = parsedBody.data;
    const preparedText = stripAllowedEmotionTags(body.text);
    const speech = await synthesizeSpeechStream({
      text: preparedText.speechText,
      voiceId: body.voiceId,
      language: body.language,
      outputFormat: body.outputFormat
    });

    return new NextResponse(speech.body, {
      status: 200,
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "no-store",
        "X-GameForge-Voice-Id": speech.voiceId,
        "X-GameForge-Audio-Format": speech.outputFormat,
        ...(preparedText.emotionTags.length > 0
          ? { "X-GameForge-Emotion-Tags": preparedText.emotionTags.join(",") }
          : {})
      }
    });
  } catch (error) {
    if (error instanceof GradiumConfigError) {
      return jsonError(error.code, 503);
    }

    if (error instanceof GradiumApiError) {
      return jsonError(error.code, error.status, error.details);
    }

    console.error("GameForge Gradium TTS route failed.", error);
    return jsonError("gradium_tts_route_failed", 502);
  } finally {
    releaseVoiceRequestSlot();
  }
}
