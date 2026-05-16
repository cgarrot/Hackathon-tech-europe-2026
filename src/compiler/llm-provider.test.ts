import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveLlmProvider } from "./llm-provider";

const originalEnv = process.env;

function resetProviderEnv() {
  process.env = { ...originalEnv };
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_TIMEOUT_MS;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OLLAMA_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.PIONEER_API_KEY;
  delete process.env.PIONEER_BASE_URL;
  delete process.env.PIONEER_MODEL;
  delete process.env.PIONEER_MAX_TOKENS;
}

describe("resolveLlmProvider", () => {
  beforeEach(() => {
    resetProviderEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("requires a real provider configuration", () => {
    expect(resolveLlmProvider()).toEqual({
      type: "error",
      message: "missing_llm_provider_configuration"
    });
  });

  it("rejects mock as an app runtime provider", () => {
    process.env.LLM_PROVIDER = "mock";

    expect(resolveLlmProvider()).toEqual({
      type: "error",
      message: "invalid_llm_provider"
    });
  });

  it("resolves OpenAI from explicit env", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-test";

    expect(resolveLlmProvider()).toMatchObject({
      type: "configured",
      config: {
        provider: "openai",
        apiKey: "test-openai-key",
        model: "gpt-test",
        strictJsonSchema: true
      }
    });
  });

  it("resolves OpenAI from a request override even when env defaults to Ollama", () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-request";

    expect(resolveLlmProvider("openai")).toMatchObject({
      type: "configured",
      config: {
        provider: "openai",
        apiKey: "test-openai-key",
        model: "gpt-request"
      }
    });
  });

  it("resolves Ollama from explicit env", () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.OLLAMA_API_KEY = "test-ollama-key";
    process.env.OLLAMA_BASE_URL = "https://ollama.com/v1/";
    process.env.OLLAMA_MODEL = "deepseek-test";

    expect(resolveLlmProvider()).toMatchObject({
      type: "configured",
      config: {
        provider: "ollama",
        apiKey: "test-ollama-key",
        baseURL: "https://ollama.com/v1/",
        model: "deepseek-test",
        strictJsonSchema: false
      }
    });
  });

  it("resolves Ollama from a request override even when env defaults to OpenAI", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OLLAMA_API_KEY = "test-ollama-key";
    process.env.OLLAMA_BASE_URL = "https://ollama.com/v1/";
    process.env.OLLAMA_MODEL = "deepseek-request";

    expect(resolveLlmProvider("ollama")).toMatchObject({
      type: "configured",
      config: {
        provider: "ollama",
        apiKey: "test-ollama-key",
        baseURL: "https://ollama.com/v1/",
        model: "deepseek-request"
      }
    });
  });

  it("resolves Pioneer/Kimi from explicit env", () => {
    process.env.LLM_PROVIDER = "pioneer";
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    process.env.PIONEER_MODEL = "moonshotai/Kimi-K2.6";

    expect(resolveLlmProvider()).toMatchObject({
      type: "configured",
      config: {
        provider: "pioneer",
        apiKey: "test-pioneer-key",
        baseURL: "https://api.pioneer.ai/v1",
        model: "moonshotai/Kimi-K2.6",
        strictJsonSchema: false,
        maxOutputTokens: 7000
      }
    });
  });

  it("resolves Pioneer from a request override even when env defaults to OpenAI", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    process.env.PIONEER_BASE_URL = "https://api.pioneer.ai/v1";
    process.env.PIONEER_MODEL = "moonshotai/Kimi-K2.6";
    process.env.PIONEER_MAX_TOKENS = "9000";

    expect(resolveLlmProvider("pioneer")).toMatchObject({
      type: "configured",
      config: {
        provider: "pioneer",
        apiKey: "test-pioneer-key",
        baseURL: "https://api.pioneer.ai/v1",
        model: "moonshotai/Kimi-K2.6",
        maxOutputTokens: 9000
      }
    });
  });

  it("requires Pioneer API key for explicit Pioneer provider", () => {
    process.env.LLM_PROVIDER = "pioneer";

    expect(resolveLlmProvider()).toEqual({
      type: "error",
      message: "missing_pioneer_configuration"
    });
  });
});
