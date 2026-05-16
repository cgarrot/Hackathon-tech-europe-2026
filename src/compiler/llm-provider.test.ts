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
});
