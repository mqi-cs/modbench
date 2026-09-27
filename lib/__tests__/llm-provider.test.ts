import { afterEach, describe, expect, it, vi } from "vitest";
import { llmConfig, modelUsage, parseQuery } from "../llm";

// WS5: the model is a placeholder until a provider is chosen. These prove
// that filling in .env.local is all it takes, for either request shape.
describe("model provider placeholders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is off until a key is set, and off when openai-compatible is incomplete", () => {
    expect(llmConfig({})).toBeNull();
    expect(llmConfig({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "k", LLM_MODEL: "m" })).toBeNull();
    expect(llmConfig({ LLM_PROVIDER: "something-else", LLM_API_KEY: "k" })).toBeNull();
    expect(llmConfig({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5" });
    expect(llmConfig({ LLM_API_KEY: "k", LLM_MODEL: "claude-haiku-4-5" })).toMatchObject({ model: "claude-haiku-4-5" });
  });

  const reply = { budgetMinor: 30000, currency: "GBP", styleTags: ["blue", "made-up-tag"], caseDiameterMm: null, requiresDate: null, requiresGmt: true, freeText: "" };

  it.each([
    ["anthropic", { LLM_API_KEY: "k", LLM_MODEL: "test-model" }, "https://api.anthropic.com/v1/messages",
      { content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 600, output_tokens: 80 } }],
    ["openai-compatible", { LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "k", LLM_MODEL: "test-model", LLM_BASE_URL: "https://llm.example/v1/" }, "https://llm.example/v1/chat/completions",
      { choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 600, completion_tokens: 80 } }],
  ])("%s: parses through the model, filters invented tags, counts tokens", async (_name, env, url, body) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const before = { ...modelUsage };

    const out = await parseQuery("blue GMT under £300");

    expect(fetch.mock.calls[0]![0]).toBe(url);
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string).model).toBe("test-model");
    expect(out.source).toBe("model");
    expect(out.intent).toMatchObject({ styleTags: ["blue"], budgetMinor: 30000, requiresGmt: true });
    expect(out.droppedTags).toEqual(["made-up-tag"]);
    expect(modelUsage.inputTokens - before.inputTokens).toBe(600);
    expect(modelUsage.outputTokens - before.outputTokens).toBe(80);
  });

  it("falls back to keywords when the provider errors", async () => {
    vi.stubEnv("LLM_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const out = await parseQuery("black diver under £200");
    expect(out.source).toBe("keywords");
    expect(out.intent.styleTags).toContain("black");
  });
});
