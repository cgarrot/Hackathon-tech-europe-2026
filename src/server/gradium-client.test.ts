import { afterEach, describe, expect, it, vi } from "vitest";
import { GradiumConfigError, resolveGradiumConfig, synthesizeSpeech, synthesizeSpeechStream, transcribeAudio, transcribeAudioStream } from "./gradium-client";

const originalEnv = process.env;

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.GRADIUM_API_KEY;
  delete process.env.GRADIUM_BASE_URL;
  delete process.env.GRADIUM_FR_VOICE_ID;
  delete process.env.GRADIUM_EN_VOICE_ID;
  delete process.env.GRADIUM_DEFAULT_VOICE_ID;
  delete process.env.GRADIUM_LANGUAGE;
  delete process.env.GRADIUM_TIMEOUT_MS;
}

describe("gradium-client", () => {
  afterEach(() => {
    resetEnv();
    vi.unstubAllGlobals();
  });

  it("requires a server-side Gradium API key", () => {
    expect(() => resolveGradiumConfig()).toThrow(GradiumConfigError);
  });

  it("posts TTS requests with server-side auth and voice env mapping", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_BASE_URL = "https://gradium.example/api/";
    process.env.GRADIUM_FR_VOICE_ID = "voice-fr";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("audio-bytes", { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", fetchMock);

    const speech = await synthesizeSpeech({ text: "Bonjour Mireille", language: "fr" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(fetchMock).toHaveBeenCalledWith("https://gradium.example/api/post/speech/tts", expect.objectContaining({ method: "POST" }));
    expect(init?.headers).toMatchObject({ "x-api-key": "test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "Bonjour Mireille",
      voice_id: "voice-fr",
      output_format: "wav",
      only_audio: true
    });
    expect(speech.contentType).toBe("audio/wav");
    expect(speech.voiceId).toBe("voice-fr");
  });

  it("uses GRADIUM_DEFAULT_VOICE_ID when no language-specific voice is configured", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_BASE_URL = "https://gradium.example/api/";
    process.env.GRADIUM_DEFAULT_VOICE_ID = "YTpq7expH9539ERJ";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("audio-bytes", { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", fetchMock);

    const speech = await synthesizeSpeech({ text: "Bonjour" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(JSON.parse(String(init?.body))).toMatchObject({ voice_id: "YTpq7expH9539ERJ" });
    expect(speech.voiceId).toBe("YTpq7expH9539ERJ");
  });

  it("streams TTS audio bytes without buffering the upstream response first", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_DEFAULT_VOICE_ID = "voice-default";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("audio-stream", { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", fetchMock);

    const speech = await synthesizeSpeechStream({ text: "Bonjour" });
    const streamedText = await new Response(speech.body).text();

    expect(streamedText).toBe("audio-stream");
    expect(speech.voiceId).toBe("voice-default");
    expect(speech.contentType).toBe("audio/wav");
  });

  it("parses Gradium STT ndjson transcripts", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_BASE_URL = "https://gradium.example/api";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"type":"final","text":"Je soupçonne le village."}\n'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeAudio(new ArrayBuffer(4), "audio/wav");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
      href: "https://gradium.example/api/post/speech/asr?input_format=wav"
    }), expect.objectContaining({ method: "POST" }));
    expect(init?.headers).toMatchObject({ "x-api-key": "test-key", "Content-Type": "audio/wav" });
    expect(result.text).toBe("Je soupçonne le village.");
    expect(result.eventCount).toBe(1);
  });

  it("normalizes MediaRecorder Ogg content type parameters for STT", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_BASE_URL = "https://gradium.example/api";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"type":"text","text":"Bonjour."}\n'));
    vi.stubGlobal("fetch", fetchMock);

    await transcribeAudio(new ArrayBuffer(4), "audio/ogg;codecs=opus");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
      href: "https://gradium.example/api/post/speech/asr?input_format=opus"
    }), expect.objectContaining({ method: "POST" }));
    expect(init?.headers).toMatchObject({ "Content-Type": "audio/ogg" });
  });

  it("streams Gradium STT ndjson responses", async () => {
    process.env.GRADIUM_API_KEY = "test-key";
    process.env.GRADIUM_BASE_URL = "https://gradium.example/api";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"type":"text","text":"Streaming."}\n', {
      headers: { "content-type": "application/x-ndjson" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeAudioStream(new ArrayBuffer(4), "audio/ogg;codecs=opus");
    const streamedText = await new Response(result.body).text();

    expect(result.inputFormat).toBe("opus");
    expect(result.contentType).toBe("application/x-ndjson");
    expect(streamedText).toBe('{"type":"text","text":"Streaming."}\n');
  });
});
