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
});
