import { describe, expect, it } from "vitest";
import type { ForgeResult } from "./schemas";
import { validateForgeResult } from "./validators";
import { validForgeResult } from "../test/forge-fixture";

describe("validateForgeResult", () => {
  it("accepts a valid werewolf package", () => {
    expect(validateForgeResult(validForgeResult)).toEqual([]);
  });

  it("rejects unsafe generated file paths", () => {
    const unsafeResult: ForgeResult = {
      ...validForgeResult,
      package: {
        ...validForgeResult.package,
        codeStubs: [
          {
            ...validForgeResult.package.codeStubs[0],
            path: "../escape.ts"
          }
        ]
      }
    };

    expect(validateForgeResult(unsafeResult)).toContain("invalid_generated_file_path");
  });

  it("rejects unsupported persona emotion tags in spoken lines", () => {
    const unsupportedTagResult: ForgeResult = {
      ...validForgeResult,
      package: {
        ...validForgeResult.package,
        personas: [
          {
            ...validForgeResult.package.personas[0],
            sampleLines: ["[dramatic] Je sais qui ment ce soir."]
          }
        ]
      }
    };

    expect(validateForgeResult(unsupportedTagResult)).toContain("unsupported_persona_emotion_tag");
  });
});
