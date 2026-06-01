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
    return res.status(error.status || 502).json({
      error: error.message || "Unable to reach Dify API.",
      details: error.details || String(error)
    });
  }
});
