import { describe, expect, it } from "vitest";
import { extractCompactBracketTags, isAllowedEmotionTag, stripAllowedEmotionTags } from "./voice-emotion-tags";

describe("voice emotion tags", () => {
  it("extracts compact bracket tags for validator checks", () => {
    expect(extractCompactBracketTags("[warm] Bonjour [unknown] [two words]")).toEqual(["[warm]", "[unknown]"]);
  });

  it("checks the shared allowlist", () => {
    expect(isAllowedEmotionTag("[surprise]")).toBe(true);
    expect(isAllowedEmotionTag("[happy]")).toBe(false);
  });

  it("strips allowed tags before sending text to speech", () => {
    expect(stripAllowedEmotionTags("[urgent] Viens ici ! [warm] On reste ensemble.")).toEqual({
      speechText: "Viens ici! On reste ensemble.",
      emotionTags: ["[urgent]", "[warm]"]
    });
  });
});
