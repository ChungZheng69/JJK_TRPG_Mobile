import { Router } from "express";
import { runGameTurn } from "../../game/engine.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  console.log("API_CHAT_ROUTE_HIT");
  const {
    message,
    gameState = {},
    chatHistory = [],
    sessionSummary = "",
    saveCode = "",
    selectedSkillId = "",
    userApiKey = ""
  } = req.body || {};
  const userApiKeyOverride = String(userApiKey || "").trim();
  const normalizedSessionSummary = normalizeSessionSummary(sessionSummary || gameState?.sessionSummary || "");
  const receivedChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

  console.log("USER_API_KEY_PRESENT", Boolean(userApiKeyOverride));
  console.log("SESSION_SUMMARY_RECEIVED_LENGTH", normalizedSessionSummary.length);
  console.log("CHAT_HISTORY_RECEIVED_LENGTH", receivedChatHistory.length);
  console.log("TURN_COUNT_RECEIVED", countPlayerTurns(receivedChatHistory));

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message input cannot be empty." });
  }

  try {
    const result = await runGameTurn({
      message: String(message).trim(),
      gameState,
      chatHistory: receivedChatHistory,
      sessionSummary: normalizedSessionSummary,
      saveCode,
      selectedSkillId,
      userApiKey: userApiKeyOverride
    });
    const updatedSessionSummary = normalizeSessionSummary(result.updatedSessionSummary || normalizedSessionSummary);
    const responsePayload = {
      ...result,
      gameState: {
        ...(result.gameState || {}),
        sessionSummary: updatedSessionSummary
      },
      updatedSessionSummary
    };
    console.log("RESPONSE_COMBAT_ENEMY_STATUS", responsePayload.gameState.combat?.enemies?.map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      status: enemy.status
    })));
    console.log("RETURNING_UPDATED_SESSION_SUMMARY_LENGTH", updatedSessionSummary.length);
    return res.json(responsePayload);
  } catch (error) {
    if (error?.code === "GEMINI_API_KEY_REQUIRED") {
      return res.status(error.status || 401).json({
        ok: false,
        error: "GEMINI_API_KEY_REQUIRED",
        status: error.status || 401,
        suggestion: "Please enter your Google AI Studio Gemini API key in API Key Settings."
      });
    }
    if (error?.code === "GEMINI_API_KEY_INVALID_OR_FAILED") {
      return res.status(error.status || 502).json({
        ok: false,
        error: "GEMINI_API_KEY_INVALID_OR_FAILED",
        status: error.status || 502,
        suggestion: "Please check your Gemini API key or quota."
      });
    }
    console.error("LOCAL_GAME_ENGINE_ERROR", {
      message: error?.message || String(error),
      status: error?.status || 500
    });
    return res.status(error?.status || 500).json({
      error: "Local game engine request failed",
      status: error?.status || 500,
      details: error?.message || String(error)
    });
  }
});

function normalizeSessionSummary(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text === "Unknown" ? "" : text;
}

function countPlayerTurns(chatHistory) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((entry) => {
      const role = String(entry?.role || "").trim().toLowerCase();
      return role === "player" || role === "user";
    })
    .length;
}
