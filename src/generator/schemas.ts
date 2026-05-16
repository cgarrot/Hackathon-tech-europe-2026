import { z } from "zod";
import { ForgeResultSchema } from "@/compiler/schemas";

export const GeneratedFileKindSchema = z.enum(["json", "md", "ts", "tsx", "css", "txt"]);

export const GeneratedProjectFileSchema = z
  .object({
    path: z.string().min(1),
    kind: GeneratedFileKindSchema,
    purpose: z.string().min(1),
    content: z.string().min(1)
  })
  .strict()
  .superRefine((file, ctx) => {
    const normalized = file.path.replaceAll("\\", "/");
    const hasDrivePrefix = /^[a-zA-Z]:\//.test(normalized);
    const allowedExtensions = [".json", ".md", ".ts", ".tsx", ".css", ".txt"];
    const hasAllowedExtension = allowedExtensions.some((extension) => normalized.endsWith(extension));

    if (normalized.includes("../") || normalized.startsWith("/") || hasDrivePrefix) {
      ctx.addIssue({ code: "custom", message: "Generated project paths must be safe relative paths.", path: ["path"] });
    }

    if (!hasAllowedExtension) {
      ctx.addIssue({ code: "custom", message: "Generated project file extension is not allowed.", path: ["path"] });
    }
  });

export const GeneratedProjectSchema = z
  .object({
    projectId: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    sourceGameId: z.string().min(1),
    files: z.array(GeneratedProjectFileSchema).min(1),
    codexReadyPrompt: z.string().min(20),
    safetyNotes: z.array(z.string()).min(1),
    acceptanceChecks: z.array(z.string()).min(1)
  })
  .strict();

export const GenerateProjectRequestSchema = z
  .object({
    forgeResult: ForgeResultSchema
  })
  .strict();

export type GeneratedProject = z.infer<typeof GeneratedProjectSchema>;
export type GeneratedProjectFile = z.infer<typeof GeneratedProjectFileSchema>;
export type GenerateProjectRequest = z.infer<typeof GenerateProjectRequestSchema>;
