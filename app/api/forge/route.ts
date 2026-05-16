import { NextRequest, NextResponse } from "next/server";
import { compileWithLlmProvider } from "@/compiler/openai-compiler";
import type { CompilerProgressEvent } from "@/compiler/openai-compiler";
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
type ForgeStreamEvent =
  | { type: "progress"; progress: CompilerProgressEvent }
  | { type: "result"; ok: true; mode: ForgeMode; warnings: string[]; result: unknown }
  | { type: "error"; ok: false; error: string; details?: unknown };

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

function forgeStreamResponse(params: {
  prompt: string;
  mode: ForgeMode;
  config: Parameters<typeof compileWithLlmProvider>[1];
}) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ForgeStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const result = await compileWithLlmProvider(params.prompt, params.config, {
            onProgress: (progress) => send({ type: "progress", progress })
          });
          const parsedResult = ForgeResultSchema.parse(result);
          const invariantIssues = validateForgeResult(parsedResult);

          if (invariantIssues.length > 0) {
            send({ type: "error", ok: false, error: "compiler_invariant_failed", details: invariantIssues });
            return;
          }

          send({ type: "result", ok: true, mode: params.mode, warnings: [], result: parsedResult });
        } catch (error) {
          if (error instanceof z.ZodError) {
            send({ type: "error", ok: false, error: "compiler_schema_validation_failed", details: error.issues });
            return;
          }

          console.error("GameForge provider stream failed.", error);
          send({ type: "error", ok: false, error: "llm_provider_error" });
        } finally {
          releaseForgeRequestSlot();
          controller.close();
        }
      })();
    }
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store"
    }
  });
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
        hint: "Set LLM_PROVIDER=openai with OPENAI_API_KEY, or LLM_PROVIDER=ollama with OLLAMA_API_KEY + OLLAMA_BASE_URL. Pioneer is disabled in this runtime."
      });
    }

    if (!tryAcquireForgeRequestSlot()) {
      return jsonError("too_many_concurrent_requests", 429, {
        hint: "Another GameForge compilation is already running. Retry in a few seconds."
      });
    }

    const mode: ForgeMode = providerResolution.config.provider;
    if (request.nextUrl.searchParams.get("stream") === "1") {
      return forgeStreamResponse({
        prompt: body.prompt,
        mode,
        config: providerResolution.config
      });
    }

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
