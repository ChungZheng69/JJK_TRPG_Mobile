import { Router } from "express";
import { sendDifyChatMessage } from "../services/difyClient.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const { message, conversation_id = "", user } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message input cannot be empty." });
  }

  if (!user || !String(user).trim()) {
    return res.status(400).json({ error: "Stable user id is required." });
  }

  try {
    const payload = await sendDifyChatMessage({
      message: String(message).trim(),
      conversationId: String(conversation_id || ""),
      user: String(user)
    });
    return res.json(payload);
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

function formatErrorDetails(details) {
  if (details instanceof Error) return details.message;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch (_error) {
    return String(details);
  }
}
