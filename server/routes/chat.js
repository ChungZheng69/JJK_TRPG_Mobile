import { Router } from "express";
import { sendDifyChatMessage } from "../services/difyClient.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const { message, conversation_id = "", user, inputs = {} } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message input cannot be empty." });
  }

  if (!user || !String(user).trim()) {
    return res.status(400).json({ error: "Stable user id is required." });
  }

  const finalDifyInputs = buildFinalDifyInputs(req.body || {});
  console.log("BACKEND_FINAL_DIFY_INPUTS", finalDifyInputs);

  try {
    const payload = await sendDifyChatMessage({
      message: String(message).trim(),
      conversationId: String(conversation_id || ""),
      user: String(user),
      inputs: finalDifyInputs
    });
    const answerText = payload.answer || payload.data?.answer || payload.message || "";
    console.log("DIFY_RAW_RESPONSE", payload._rawSseResponse || payload);
    console.log("DIFY_ANSWER_TEXT", answerText);
    console.log("DIFY_ANSWER_HAS_OUTCOME_MARKER", String(answerText).includes("【OUTCOME_LLM_ACTIVE】"));
    const responsePayload = { ...payload };
    delete responsePayload._rawSseResponse;
    delete responsePayload.finalOutputAnswer;
    return res.json(responsePayload);
  } catch (error) {
    const status = error.status || 502;
    const diagnostics = error.difyDiagnostics || {};
    console.error("Dify API request failed", {
      status: diagnostics.status ?? status,
      responseBody: diagnostics.responseBody ?? formatErrorDetails(error.details || error.message || error),
      endpointUrl: diagnostics.endpointUrl ?? "unknown",
      hasDifyApiKey: diagnostics.hasApiKey ?? Boolean(process.env.DIFY_API_KEY),
      conversationId: diagnostics.conversationId ?? String(conversation_id || ""),
      user: diagnostics.user ?? String(user || "")
    });

    if (status === 502 || status === 504) {
      return res.status(status).json({
        error: "Dify API temporarily unavailable",
        status,
        suggestion: "Dify API 暂时中断，请稍后重试。"
      });
    }

    return res.status(status).json({
      error: "Dify API request failed",
      status,
      details: formatErrorDetails(error.details || error.message || error),
      suggestion: error.suggestion || "Check DIFY_API_KEY / DIFY_BASE_URL / Dify model quota"
    });
  }
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildFinalDifyInputs(body) {
  const nestedInputs = isPlainObject(body.inputs) ? body.inputs : {};
  const topLevelInputs = {};
  for (const key of DIFY_INPUT_KEYS) {
    if (body[key] !== undefined) topLevelInputs[key] = body[key];
  }
  return {
    ...nestedInputs,
    ...topLevelInputs
  };
}

const DIFY_INPUT_KEYS = [
  "Current_HP",
  "Current_MP",
  "Attributes",
  "Inventory",
  "Active_Flag",
  "current_Objective",
  "Gojo_Affinity",
  "Nanami_Affinity",
  "sukuna_fingers",
  "character_config_text",
  "player_action",
  "previous_scene_context",
  "frontend_game_state_json",
  "state_updates_json"
];

function formatErrorDetails(details) {
  if (details instanceof Error) return details.message;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch (_error) {
    return String(details);
  }
}
