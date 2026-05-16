import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ForgeResultSchema } from "@/compiler/schemas";
import { validateForgeResult } from "@/compiler/validators";
import { FalVisualApiError, FalVisualConfigError, generateVisualSetWithFal } from "@/server/fal-visuals";

export const runtime = "nodejs";

const GenerateVisualsRequestSchema = z
  .object({
    forgeResult: ForgeResultSchema,
    maxAssets: z.number().int().min(1).max(4).default(4)
  })
  .strict();

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("malformed_json", 400);
  }

  const parsedBody = GenerateVisualsRequestSchema.safeParse(payload);
  if (!parsedBody.success) {
    return jsonError("request_validation_error", 400, parsedBody.error.issues);
  }

  const invariantIssues = validateForgeResult(parsedBody.data.forgeResult);
  if (invariantIssues.length > 0) {
    return jsonError("compiler_invariant_failed", 422, invariantIssues);
  }

  try {
    const visualSet = await generateVisualSetWithFal(parsedBody.data.forgeResult, parsedBody.data.maxAssets);
    return NextResponse.json({ ok: true, visualSet });
  } catch (error) {
    if (error instanceof FalVisualConfigError) {
      return jsonError(error.code, 503);
    }

    if (error instanceof FalVisualApiError) {
      return jsonError(error.code, 502, error.details);
    }

    console.error("GameForge fal visual generation failed.", error);
    return jsonError("fal_visual_route_failed", 502);
  }
}
