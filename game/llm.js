import { GoogleGenAI } from "@google/genai";
import { buildMechanicsMessages, buildOutcomePrompt, buildSummaryPrompt } from "./prompts.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export async function callMechanicsLLM({
  userMessage,
  gameState,
  recentHistoryContext = "",
  retrievedLoreContext = "",
  sessionSummary = "",
  selectedSkill = null,
  apiKeyOverride = ""
}) {
  const messages = buildMechanicsMessages({ userMessage, gameState, recentHistoryContext, retrievedLoreContext, sessionSummary, selectedSkill });
  const raw = await callChatCompletion(messages, {
    temperature: 0.2,
    maxTokens: 800,
    responseFormat: { type: "json_object" },
    purpose: "Mechanics LLM",
    apiKeyOverride
  });
  console.log("MECHANICS_LLM_RAW", raw);

  const parsed = parseJsonObject(raw);
  console.log("MECHANICS_JSON_PARSED", parsed);
  return { raw, parsed };
}

export async function callOutcomeLLM({
  userMessage,
  gameStateBefore,
  gameStateAfter,
  mechanics,
  dice,
  combatResult = null,
  recentHistoryContext = "",
  retrievedLoreContext = "",
  sessionSummary = "",
  apiKeyOverride = ""
}) {
  const prompt = buildOutcomePrompt({
    userMessage,
    gameStateBefore,
    gameStateAfter,
    mechanics,
    dice,
    combatResult,
    recentHistoryContext,
    retrievedLoreContext,
    sessionSummary
  });
  console.log("OUTCOME_LLM_PROMPT", prompt);

  const raw = await callChatCompletion([{ role: "system", content: prompt }], {
    temperature: 0.8,
    maxTokens: 1600,
    purpose: "Outcome LLM",
    apiKeyOverride
  });
  console.log("OUTCOME_LLM_RAW", raw);
  return String(raw || "").trim();
}

export async function callSummaryLLM({ oldSummary = "", recentHistoryContext = "", gameState = {}, apiKeyOverride = "" }) {
  const prompt = buildSummaryPrompt({ oldSummary, recentHistoryContext, gameState });
  console.log("SUMMARY_LLM_CALL_START", {
    oldSummaryLength: String(oldSummary || "").length,
    recentHistoryLength: String(recentHistoryContext || "").length
  });

  try {
    const raw = await callChatCompletion([{ role: "system", content: prompt }], {
      temperature: 0.2,
      maxTokens: 900,
      purpose: "Summary LLM",
      apiKeyOverride
    });
    const summary = String(raw || "").trim();
    console.log("SUMMARY_LLM_CALL_SUCCESS", { summaryLength: summary.length });
    console.log("SUMMARY_TEXT_PREVIEW", summary.slice(0, 120));
    return summary;
  } catch (error) {
    console.error("SUMMARY_LLM_CALL_FAILED", error?.message || String(error));
    throw error;
  }
}

async function callChatCompletion(
  messages,
  { temperature = 0.2, maxTokens = 1200, responseFormat = null, purpose = "Mechanics LLM", apiKeyOverride = "" } = {}
) {
  const provider = String(process.env.LLM_PROVIDER || "openrouter").trim().toLowerCase();
  if (provider === "gemini") {
    return callGemini(messages, { temperature, maxTokens, responseFormat, purpose, apiKeyOverride });
  }
  if (provider === "openrouter") {
    return callOpenRouter(messages, { temperature, maxTokens, responseFormat, purpose });
  }
  throw createLlmError(`Unsupported LLM_PROVIDER "${provider}". Set LLM_PROVIDER=openrouter or gemini.`);
}

async function callOpenRouter(messages, { temperature, maxTokens, responseFormat, purpose }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw createLlmError("OPENROUTER_API_KEY is missing. Add it to .env and restart the server.");
  }

  const model = process.env.MODEL_NAME || DEFAULT_OPENROUTER_MODEL;
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_PUBLIC_URL || "http://localhost:3000",
      "X-Title": process.env.APP_NAME || "JJK TRPG Local Engine"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat ? { response_format: responseFormat } : {})
    })
  });

  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    payload = { raw: responseText };
  }

  if (!response.ok) {
    throw createLlmError(payload?.error?.message || payload?.message || `${purpose} request failed.`, response.status, payload);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw createLlmError(`${purpose} response did not include message content.`, 502, payload);
  return String(content).trim();
}

async function callGemini(messages, { temperature, maxTokens, responseFormat, purpose, apiKeyOverride = "" }) {
  const apiKey = String(apiKeyOverride || "").trim()
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw createLlmError(
      "Missing Gemini API key. Please add your Gemini API key in API Key Settings.",
      401,
      {},
      "GEMINI_API_KEY_REQUIRED"
    );
  }

  const model = process.env.MODEL_NAME || DEFAULT_GEMINI_MODEL;
  const prompt = messagesToGeminiPrompt(messages);
  console.log("GEMINI_CALL_START", {
    purpose,
    model,
    temperature,
    maxTokens,
    wantsJson: Boolean(responseFormat)
  });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(responseFormat ? { responseMimeType: "application/json" } : {})
      }
    });
    const text = extractGeminiText(response);
    console.log("GEMINI_CALL_SUCCESS", {
      purpose,
      model,
      textLength: text.length
    });
    return text;
  } catch (error) {
    console.error("GEMINI_CALL_FAILED", {
      purpose,
      model,
      message: error?.message || String(error)
    });
    throw createLlmError(
      `${purpose} Gemini request failed.`,
      error?.status || error?.response?.status || 502,
      sanitizeGeminiError(error),
      "GEMINI_API_KEY_INVALID_OR_FAILED"
    );
  }
}

function sanitizeGeminiError(error) {
  return {
    message: error?.message || String(error),
    status: error?.status || error?.response?.status || null
  };
}

function messagesToGeminiPrompt(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      const role = message?.role ? `${message.role}: ` : "";
      return `${role}${String(message?.content || "")}`;
    })
    .join("\n\n");
}

function extractGeminiText(response) {
  if (typeof response?.text === "function") return String(response.text() || "").trim();
  if (typeof response?.text === "string") return response.text.trim();
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part) => part?.text || "").join("").trim();
  }
  return "";
}

function parseJsonObject(text) {
  const value = String(text || "").trim();
  try {
    const parsed = JSON.parse(value);
    if (isPlainObject(parsed)) return parsed;
  } catch (_error) {
    const candidate = extractFirstJsonObject(value);
    if (candidate) {
      const parsed = JSON.parse(candidate);
      if (isPlainObject(parsed)) return parsed;
    }
  }
  throw createLlmError("Mechanics LLM did not return a JSON object.", 502, { text });
}

function extractFirstJsonObject(text) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createLlmError(message, status = 502, details = {}, code = "") {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  if (code) error.code = code;
  return error;
}
