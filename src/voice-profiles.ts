import type { ForgeResult } from "@/compiler/schemas";

export type SpeechStyleId =
  | "neutral"
  | "calm"
  | "mysterious"
  | "suspicious"
  | "tense"
  | "urgent"
  | "excited"
  | "sad"
  | "angry"
  | "whisper";

export type VoiceProfileId = "fr_feminine_warm" | "fr_masculine_warm" | "en_feminine_warm" | "en_masculine_warm";

export type PersonaSpec = ForgeResult["package"]["personas"][number];
export type AssetPrompt = ForgeResult["package"]["assetPrompts"][number];

export interface SpeechStylePreset {
  id: SpeechStyleId;
  label: string;
  delivery: string;
  pace: "slow" | "medium" | "fast";
  energy: "low" | "medium" | "high";
}

export interface VoiceProfilePreset {
  id: VoiceProfileId;
  label: string;
  language: "fr" | "en";
  voiceIdEnv: "GRADIUM_FR_VOICE_ID" | "GRADIUM_EN_VOICE_ID";
  direction: string;
}

export interface PersonaVoiceProfile {
  personaId: string;
  displayName: string;
  language: "fr" | "en";
  profileId: VoiceProfileId;
  voiceIdEnv: VoiceProfilePreset["voiceIdEnv"];
  styleId: SpeechStyleId;
  delivery: string;
  prompt: string;
  sampleLines: string[];
  assetPromptId?: string;
}

export const SPEECH_STYLE_PRESETS: Record<SpeechStyleId, SpeechStylePreset> = {
  neutral: {
    id: "neutral",
    label: "Neutral narrator",
    delivery: "clear, balanced, conversational",
    pace: "medium",
    energy: "medium"
  },
  calm: {
    id: "calm",
    label: "Calm guide",
    delivery: "warm, slow, reassuring",
    pace: "slow",
    energy: "low"
  },
  mysterious: {
    id: "mysterious",
    label: "Mysterious character",
    delivery: "quiet, suggestive, with suspense",
    pace: "slow",
    energy: "medium"
  },
  suspicious: {
    id: "suspicious",
    label: "Suspicious witness",
    delivery: "careful, hesitant, slightly tense",
    pace: "medium",
    energy: "medium"
  },
  tense: {
    id: "tense",
    label: "Tense table lead",
    delivery: "focused, clipped, suspenseful",
    pace: "medium",
    energy: "high"
  },
  urgent: {
    id: "urgent",
    label: "Urgent announcer",
    delivery: "direct, fast, decisive",
    pace: "fast",
    energy: "high"
  },
  excited: {
    id: "excited",
    label: "Excited host",
    delivery: "bright, upbeat, playful",
    pace: "fast",
    energy: "high"
  },
  sad: {
    id: "sad",
    label: "Sad witness",
    delivery: "soft, reflective, restrained",
    pace: "slow",
    energy: "low"
  },
  angry: {
    id: "angry",
    label: "Angry rival",
    delivery: "firm, intense, controlled",
    pace: "medium",
    energy: "high"
  },
  whisper: {
    id: "whisper",
    label: "Whispered secret",
    delivery: "very soft, confidential, close-mic",
    pace: "slow",
    energy: "low"
  }
};

export const VOICE_PROFILE_PRESETS: Record<VoiceProfileId, VoiceProfilePreset> = {
  fr_feminine_warm: {
    id: "fr_feminine_warm",
    label: "FR feminine warm",
    language: "fr",
    voiceIdEnv: "GRADIUM_FR_VOICE_ID",
    direction: "voix française chaleureuse, expressive, claire"
  },
  fr_masculine_warm: {
    id: "fr_masculine_warm",
    label: "FR masculine warm",
    language: "fr",
    voiceIdEnv: "GRADIUM_FR_VOICE_ID",
    direction: "voix française posée, chaude, lisible"
  },
  en_feminine_warm: {
    id: "en_feminine_warm",
    label: "EN feminine warm",
    language: "en",
    voiceIdEnv: "GRADIUM_EN_VOICE_ID",
    direction: "warm English voice, expressive, clear"
  },
  en_masculine_warm: {
    id: "en_masculine_warm",
    label: "EN masculine warm",
    language: "en",
    voiceIdEnv: "GRADIUM_EN_VOICE_ID",
    direction: "grounded English voice, warm, readable"
  }
};

const STYLE_KEYWORDS: Array<{ style: SpeechStyleId; keywords: string[] }> = [
  { style: "whisper", keywords: ["chuchot", "whisper", "secret", "confidentiel"] },
  { style: "urgent", keywords: ["urgent", "rapide", "vite", "press", "decisive"] },
  { style: "excited", keywords: ["drôle", "drole", "fun", "excited", "joueur", "enthousias"] },
  { style: "mysterious", keywords: ["myst", "sombre", "enig", "suspen", "occult"] },
  { style: "suspicious", keywords: ["suspect", "prud", "méfi", "mefi", "analyt"] },
  { style: "tense", keywords: ["tendu", "tense", "stress", "menace"] },
  { style: "angry", keywords: ["colère", "colere", "angry", "furieux", "severe"] },
  { style: "sad", keywords: ["triste", "sad", "melanc", "regret"] },
  { style: "calm", keywords: ["calme", "calm", "doux", "warm", "chaleureux", "posé", "pose"] }
];

export function normalizeVoiceLanguage(language: string | undefined): "fr" | "en" {
  return language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function inferSpeechStyleId(value: string): SpeechStyleId {
  const normalized = value.toLowerCase();
  const match = STYLE_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)));
  return match?.style ?? "neutral";
}

export function selectVoiceProfilePreset(persona: PersonaSpec, language: string | undefined, index = 0): VoiceProfilePreset {
  const normalizedLanguage = normalizeVoiceLanguage(language);
  const normalizedPersona = `${persona.displayName} ${persona.speechStyle}`.toLowerCase();
  const masculineHint = /masculin|homme|male|monsieur|socrate|nietzsche/.test(normalizedPersona) || index % 2 === 1;

  if (normalizedLanguage === "en") {
    return VOICE_PROFILE_PRESETS[masculineHint ? "en_masculine_warm" : "en_feminine_warm"];
  }

  return VOICE_PROFILE_PRESETS[masculineHint ? "fr_masculine_warm" : "fr_feminine_warm"];
}

export function buildPersonaVoicePrompt(persona: PersonaSpec, theme: string, language: string | undefined, index = 0) {
  const profile = selectVoiceProfilePreset(persona, language, index);
  const style = SPEECH_STYLE_PRESETS[inferSpeechStyleId(persona.speechStyle)];

  return [
    `Voice direction for ${persona.displayName}.`,
    `Language: ${profile.language}.`,
    `Base profile: ${profile.label} (${profile.direction}).`,
    `Delivery: ${style.delivery}; pace ${style.pace}; energy ${style.energy}.`,
    `Character style: ${persona.speechStyle}.`,
    `Theme: ${theme}.`,
    `Backstory: ${persona.publicBackstory}.`,
    "Use a fictional game persona only; do not imitate a real living person."
  ].join(" ");
}

export function buildPersonaVoiceProfile(
  persona: PersonaSpec,
  options: { language?: string; theme: string; index?: number; assetPrompts?: AssetPrompt[] }
): PersonaVoiceProfile {
  const profile = selectVoiceProfilePreset(persona, options.language, options.index ?? 0);
  const style = SPEECH_STYLE_PRESETS[inferSpeechStyleId(persona.speechStyle)];
  const assetPrompt = options.assetPrompts?.find((asset) => asset.kind === "voice" && asset.usage.includes(persona.displayName));

  return {
    personaId: persona.id,
    displayName: persona.displayName,
    language: profile.language,
    profileId: profile.id,
    voiceIdEnv: profile.voiceIdEnv,
    styleId: style.id,
    delivery: style.delivery,
    prompt: assetPrompt?.prompt ?? buildPersonaVoicePrompt(persona, options.theme, options.language, options.index),
    sampleLines: persona.sampleLines,
    assetPromptId: assetPrompt?.id
  };
}
