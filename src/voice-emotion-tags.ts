export const ALLOWED_EMOTION_TAGS = [
  "[calm]",
  "[warm]",
  "[tense]",
  "[surprise]",
  "[whisper]",
  "[urgent]",
  "[skeptical]",
  "[angry]"
] as const;

const ALLOWED_EMOTION_TAG_SET = new Set<string>(ALLOWED_EMOTION_TAGS);
const ALLOWED_EMOTION_TAG_PATTERN = /\[(calm|warm|tense|surprise|whisper|urgent|skeptical|angry)\]/g;

export function isAllowedEmotionTag(tag: string) {
  return ALLOWED_EMOTION_TAG_SET.has(tag);
}

export function extractCompactBracketTags(line: string): string[] {
  const tags: string[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const start = line.indexOf("[", cursor);
    if (start === -1) {
      return tags;
    }

    const end = line.indexOf("]", start + 1);
    if (end === -1) {
      return tags;
    }

    const inner = line.slice(start + 1, end);
    if (inner.length > 0 && inner.length <= 40 && !/\s/.test(inner)) {
      tags.push(line.slice(start, end + 1));
    }

    cursor = end + 1;
  }

  return tags;
}

export function stripAllowedEmotionTags(text: string) {
  const emotionTags: string[] = [];
  const speechText = text
    .replace(ALLOWED_EMOTION_TAG_PATTERN, (tag) => {
      emotionTags.push(tag);
      return " ";
    })
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    speechText,
    emotionTags: [...new Set(emotionTags)]
  };
}
