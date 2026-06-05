import { getGameState, repairInvalidOutgoingGameState } from "../state/gameState.js";
import { saveGameState } from "../utils/storage.js";

export function buildGamePayloadFromState(gameState = getGameState(), message = "", chatHistory = [], saveCode = "") {
  const repairedState = repairInvalidOutgoingGameState(gameState);
  saveGameState(repairedState);
  const sessionSummary = String(repairedState.sessionSummary || "");
  console.log("FRONTEND_SEND_SESSION_SUMMARY_LENGTH", sessionSummary.length);
  return {
    message,
    gameState: repairedState,
    sessionSummary,
    chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
    saveCode: String(saveCode || "").trim()
  };
}

export async function sendChatMessage(payload) {
  const body = normalizeChatPayload(payload);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responsePayload.error || "API request failed.");
    error.status = responsePayload.status || response.status;
    error.details = responsePayload.details || "";
    error.suggestion = responsePayload.suggestion || "";
    throw error;
  }
  return responsePayload;
}

function normalizeChatPayload(payload = {}) {
  return payload;
}

export function formatApiError(error) {
  if (error?.message === "GEMINI_API_KEY_REQUIRED") {
    return error.suggestion || "Please enter your Google AI Studio Gemini API key in API Key Settings.";
  }
  if (error?.message === "GEMINI_API_KEY_INVALID_OR_FAILED") {
    return error.suggestion || "Please check your Gemini API key or quota.";
  }
  const reason = error?.message || "API request failed";
  const status = error?.status ? `Status ${error.status}` : "Status unknown";
  const details = error?.details ? `Reason: ${error.details}` : `Reason: ${reason}`;
  const suggestion = error?.suggestion ? `Suggestion: ${error.suggestion}` : "";
  return [`${reason} (${status})`, details, suggestion].filter(Boolean).join("\n");
}
