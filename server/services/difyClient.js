const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";

export async function sendDifyChatMessage({ message, conversationId = "", user }) {
  const apiKey = process.env.DIFY_API_KEY;
  const difyBaseUrl = (process.env.DIFY_BASE_URL || DEFAULT_DIFY_BASE_URL).replace(/\/+$/, "");

  if (!apiKey) {
    const error = new Error("DIFY_API_KEY is missing. Create .env from .env.example and restart the server.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(`${difyBaseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: {},
      query: String(message),
      response_mode: "blocking",
      conversation_id: String(conversationId || ""),
      user: String(user)
    })
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Dify API request failed.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}
