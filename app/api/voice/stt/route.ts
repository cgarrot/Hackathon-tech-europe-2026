import { NextRequest, NextResponse } from "next/server";
import { GradiumApiError, GradiumConfigError, transcribeAudio, transcribeAudioStream } from "@/server/gradium-client";
import {
  checkVoiceRateLimit,
  readClientIdentifier,
  releaseVoiceRequestSlot,
  tryAcquireVoiceRequestSlot,
  voiceRateLimitHeaders
} from "@/server/request-guards";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

type AudioPayload = { audio: ArrayBuffer; contentType: string } | { error: "missing_audio_file" };

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

async function readAudioPayload(request: NextRequest): Promise<AudioPayload> {
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof Blob)) {
      return { error: "missing_audio_file" as const };
    }

    return {
      audio: await audio.arrayBuffer(),
      contentType: audio.type || "audio/webm"
    };
  }

  return {
    audio: await request.arrayBuffer(),
    contentType
  };
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

  if (!tryAcquireVoiceRequestSlot()) {
    return jsonError("too_many_concurrent_voice_requests", 429, {
      hint: "Another Gradium voice request is already running. Retry in a few seconds."
    });
  }

  try {
    const payload = await readAudioPayload(request);
    if ("error" in payload) {
      return jsonError(payload.error, 400);
    }

    if (payload.audio.byteLength === 0) {
      return jsonError("empty_audio", 400);
    }

    if (payload.audio.byteLength > MAX_AUDIO_BYTES) {
      return jsonError("audio_too_large", 413, { maxBytes: MAX_AUDIO_BYTES });
    }

    if (request.nextUrl.searchParams.get("stream") === "1") {
      const transcriptionStream = await transcribeAudioStream(payload.audio, payload.contentType);
      return new NextResponse(transcriptionStream.body, {
        status: 200,
        headers: {
          "Content-Type": transcriptionStream.contentType,
          "Cache-Control": "no-store",
          "X-GameForge-Input-Format": transcriptionStream.inputFormat ?? "unknown"
        }
      });
    }

    const transcription = await transcribeAudio(payload.audio, payload.contentType);

    return NextResponse.json({
      ok: true,
      transcript: transcription.text,
      eventCount: transcription.eventCount
    });
  } catch (error) {
    if (error instanceof GradiumConfigError) {
      return jsonError(error.code, 503);
    }

    if (error instanceof GradiumApiError) {
      return jsonError(error.code, error.status, error.details);
    }

    console.error("GameForge Gradium STT route failed.", error);
    return jsonError("gradium_stt_route_failed", 502);
  } finally {
    releaseVoiceRequestSlot();
  }
}
