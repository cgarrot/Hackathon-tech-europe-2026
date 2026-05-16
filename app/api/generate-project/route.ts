import { NextRequest, NextResponse } from "next/server";
import { GenerateProjectRequestSchema, GeneratedProjectSchema } from "@/generator/schemas";
import { buildGeneratedProject } from "@/generator/project-generator";
import { validateForgeResult } from "@/compiler/validators";
import { z } from "zod";

export const runtime = "nodejs";

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

    const parsedBody = GenerateProjectRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return jsonError("request_validation_error", 400, parsedBody.error.issues);
    }

    const invariantIssues = validateForgeResult(parsedBody.data.forgeResult);
    if (invariantIssues.length > 0) {
      return jsonError("compiler_invariant_failed", 422, invariantIssues);
    }

    const project = GeneratedProjectSchema.parse(buildGeneratedProject(parsedBody.data.forgeResult));
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("generated_project_validation_failed", 500, error.issues);
    }

    console.error("GameForge project generation failed.", error);
    return jsonError("project_generation_failed", 500);
  }
}
