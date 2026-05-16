import { NextRequest, NextResponse } from "next/server";
import { compileWithLlmProvider } from "@/compiler/openai-compiler";
import { resolveLlmProvider } from "@/compiler/llm-provider";
import type { RealLlmProvider } from "@/compiler/llm-provider";
import { ForgeRequestSchema, ForgeResultSchema } from "@/compiler/schemas";
import { validateForgeResult } from "@/compiler/validators";
import {
  checkForgeRateLimit,
  forgeRateLimitHeaders,
  readClientIdentifier,
  releaseForgeRequestSlot,
  tryAcquireForgeRequestSlot
} from "@/server/request-guards";
import { z } from "zod";

export const runtime = "nodejs";

type ForgeMode = RealLlmProvider;

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError("malformed_json", 400);
    }

    const parsedBody = ForgeRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return jsonError("request_validation_error", 400, parsedBody.error.issues);
    }

    const body = parsedBody.data;
    const rateLimit = checkForgeRateLimit(readClientIdentifier(request));
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limit_exceeded",
          details: { retryAfterSeconds: rateLimit.retryAfterSeconds }
        },
        { status: 429, headers: forgeRateLimitHeaders(rateLimit) }
      );
    }

    const requestedProvider = body.provider === "auto" ? undefined : body.provider;
    const providerResolution = resolveLlmProvider(requestedProvider);

    if (providerResolution.type === "error") {
      return jsonError(providerResolution.message, 503, {
        hint: "Set LLM_PROVIDER=pioneer with PIONEER_API_KEY for Kimi, LLM_PROVIDER=openai with OPENAI_API_KEY, or LLM_PROVIDER=ollama with OLLAMA_API_KEY + OLLAMA_BASE_URL. GameForge app runtime requires a real provider."
      });
    }

    if (!tryAcquireForgeRequestSlot()) {
      return jsonError("too_many_concurrent_requests", 429, {
        hint: "Another GameForge compilation is already running. Retry in a few seconds."
      });
    }

    const mode: ForgeMode = providerResolution.config.provider;
    const result = await compileWithLlmProvider(body.prompt, providerResolution.config)
      .finally(() => releaseForgeRequestSlot());

    const parsedResult = ForgeResultSchema.parse(result);
    const invariantIssues = validateForgeResult(parsedResult);

    if (invariantIssues.length > 0) {
      return jsonError("compiler_invariant_failed", 422, invariantIssues);
    }

    return NextResponse.json({ ok: true, mode, warnings: [], result: parsedResult });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("compiler_schema_validation_failed", 502, error.issues);
    }

    console.error("GameForge provider route failed.", error);
    return jsonError("llm_provider_error", 502);
  }
}
