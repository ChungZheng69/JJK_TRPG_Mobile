export async function sendChatMessage({ message, conversationId, user }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      user
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "API request failed.");
    error.status = payload.status || response.status;
    error.details = payload.details || "";
    error.suggestion = payload.suggestion || "";
    throw error;
  }
  return payload;
}

export function formatApiError(error) {
  if (Number(error?.status) === 502 || Number(error?.status) === 504) {
    return "Dify API \u6682\u65f6\u4e2d\u65ad\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
  }

  const reason = error?.message || "API request failed";
  const status = error?.status ? `Status ${error.status}` : "Status unknown";
  const details = error?.details ? `Reason: ${error.details}` : `Reason: ${reason}`;
  const suggestion = error?.suggestion ? `Suggestion: ${error.suggestion}` : "";
  return [`${reason} (${status})`, details, suggestion].filter(Boolean).join("\n");
}
