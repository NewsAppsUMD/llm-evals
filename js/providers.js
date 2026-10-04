// Unified chat interface over Anthropic and OpenAI.
// In local mode (server.py running) every call goes through /api/proxy/<provider>;
// in hosted mode (GitHub Pages) the browser calls the provider directly.

export const PROVIDERS = {
  anthropic: {
    label: "Anthropic (Claude)",
    url: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-5-5",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"],
  },
  openai: {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-6-luna",
    models: ["gpt-6-luna", "gpt-5", "gpt-5-mini"],
  },
};

let localMode = false;

export async function detectLocalMode() {
  try {
    const r = await fetch("api/health", { cache: "no-store" });
    localMode = r.ok && (await r.json()).mode === "local";
  } catch {
    localMode = false;
  }
  return localMode;
}

export function isLocalMode() {
  return localMode;
}

function endpoint(id) {
  return localMode ? `api/proxy/${id}` : PROVIDERS[id].url;
}

/**
 * Send a chat request.
 * @param {object} opts {provider, model, apiKey, system, messages:[{role,content}], maxTokens, json}
 * @returns {Promise<string>} assistant text
 */
export async function chat({ provider, model, apiKey, system, messages, maxTokens = 1024, json = false }) {
  if (!apiKey) throw new Error("Please enter an API key.");
  if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}`);

  let headers = { "content-type": "application/json" };
  let body;

  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    if (!localMode) headers["anthropic-dangerous-direct-browser-access"] = "true";
    body = { model, max_tokens: maxTokens, system, messages };
  } else {
    headers["authorization"] = `Bearer ${apiKey}`;
    body = {
      model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    };
    if (json) body.response_format = { type: "json_object" };
  }

  let res;
  try {
    res = await fetch(endpoint(provider), { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`Network error reaching ${PROVIDERS[provider].label}: ${e.message}`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || text.slice(0, 200);
    throw new Error(`${PROVIDERS[provider].label} error (${res.status}): ${msg}`);
  }

  if (provider === "anthropic") {
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  if (provider === "openai") {
    return data.choices?.[0]?.message?.content ?? "";
  }
  return data.message?.content ?? "";
}
