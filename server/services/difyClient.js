const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";
const DIFY_ERROR_SUGGESTION = "Check DIFY_API_KEY / DIFY_BASE_URL / Dify model quota";
const RETRYABLE_DIFY_STATUSES = new Set([502, 504]);
const DIFY_RETRY_DELAY_MS = 2000;

export async function sendDifyChatMessage({ message, conversationId = "", user, inputs = {} }) {
  const apiKey = process.env.DIFY_API_KEY;
  const difyBaseUrl = (process.env.DIFY_BASE_URL || DEFAULT_DIFY_BASE_URL).replace(/\/+$/, "");
  const endpointUrl = `${difyBaseUrl}/chat-messages`;
  const hasApiKey = Boolean(apiKey);
  const requestContext = {
    endpointUrl,
    hasApiKey,
    conversationId: String(conversationId || ""),
    user: String(user || "")
  };

  if (!apiKey) {
    throw createDifyError({
      status: 500,
      details: "DIFY_API_KEY is missing. Create .env from .env.example and restart the server.",
      responseBody: "DIFY_API_KEY is missing.",
      requestContext
    });
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await sendDifyChatMessageAttempt({
        apiKey,
        endpointUrl,
        message,
        conversationId,
        user,
        inputs,
        requestContext
      });
    } catch (error) {
      if (attempt === 0 && isRetryableDifyError(error)) {
        console.warn("Retrying Dify API request after temporary upstream failure", {
          status: error.status,
          endpointUrl,
          conversationId: requestContext.conversationId,
          user: requestContext.user,
          retryDelayMs: DIFY_RETRY_DELAY_MS
        });
        await delay(DIFY_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
}

async function sendDifyChatMessageAttempt({
  apiKey,
  endpointUrl,
  message,
  conversationId,
  user,
  inputs,
  requestContext
}) {
  let response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        inputs: isPlainObject(inputs) ? inputs : {},
        query: String(message),
        response_mode: "streaming",
        conversation_id: String(conversationId || ""),
        user: String(user)
      })
    });
  } catch (error) {
    throw createDifyError({
      status: 502,
      details: error instanceof Error ? error.message : String(error),
      responseBody: error instanceof Error ? error.message : String(error),
      requestContext
    });
  }

  if (!response.ok) {
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      payload = { raw: text };
    }

    throw createDifyError({
      status: response.status,
      details: payload?.message || payload?.error || text || "Dify API request failed.",
      responseBody: text || JSON.stringify(payload),
      requestContext
    });
  }

  return collectDifyStreamingResponse(response, requestContext);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRetryableDifyError(error) {
  return RETRYABLE_DIFY_STATUSES.has(Number(error?.status));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectDifyStreamingResponse(response, requestContext) {
  if (!response.body) {
    throw createDifyError({
      status: 502,
      details: "Dify streaming response did not include a readable body.",
      responseBody: "",
      requestContext
    });
  }

  const decoder = new TextDecoder();
  const collected = {
    event: "message",
    answer: "",
    finalOutputAnswer: "",
    conversation_id: requestContext.conversationId,
    message_id: "",
    task_id: "",
    metadata: undefined,
    streaming: true,
    _rawSseResponse: ""
  };
  let buffer = "";
  let rawEventsForError = "";

  try {
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      const result = drainSseBuffer(buffer, collected, rawEventsForError, requestContext);
      buffer = result.buffer;
      rawEventsForError = result.rawEventsForError;
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const result = drainSseBuffer(`${buffer}\n\n`, collected, rawEventsForError, requestContext);
      buffer = result.buffer;
      rawEventsForError = result.rawEventsForError;
    }
  } catch (error) {
    if (error?.difyDiagnostics) throw error;
    throw createDifyError({
      status: error.status || 502,
      details: error instanceof Error ? error.message : String(error),
      responseBody: rawEventsForError || (error instanceof Error ? error.message : String(error)),
      requestContext
    });
  }

  if (!collected.answer && !collected.conversation_id) {
    throw createDifyError({
      status: 502,
      details: "Dify streaming response ended without answer or conversation id.",
      responseBody: rawEventsForError,
      requestContext
    });
  }

  if (collected.finalOutputAnswer) {
    collected.answer = collected.finalOutputAnswer;
  }

  return Object.fromEntries(
    Object.entries(collected).filter(([, value]) => value !== undefined && value !== "")
  );
}

function drainSseBuffer(buffer, collected, rawEventsForError, requestContext) {
  let nextBuffer = buffer;
  let nextRawEventsForError = rawEventsForError;
  let boundary = nextBuffer.indexOf("\n\n");
  while (boundary >= 0) {
    const block = nextBuffer.slice(0, boundary);
    nextBuffer = nextBuffer.slice(boundary + 2);
    if (block.trim()) {
      nextRawEventsForError += `${block}\n\n`;
      collected._rawSseResponse += `${block}\n\n`;
      applySseBlock(block, collected, requestContext);
    }
    boundary = nextBuffer.indexOf("\n\n");
  }
  return { buffer: nextBuffer, rawEventsForError: nextRawEventsForError };
}

function applySseBlock(block, collected, requestContext) {
  const dataLines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (!dataLines.length) return;

  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") return;

  let payload;
  try {
    payload = JSON.parse(data);
  } catch (_error) {
    return;
  }

  if (payload.event === "error") {
    throw createDifyError({
      status: payload.status || 502,
      details: payload.message || payload.code || "Dify streaming error.",
      responseBody: data,
      requestContext
    });
  }

  if (payload.conversation_id) collected.conversation_id = payload.conversation_id;
  if (payload.message_id) collected.message_id = payload.message_id;
  if (payload.id && !collected.message_id) collected.message_id = payload.id;
  if (payload.task_id) collected.task_id = payload.task_id;
  if (payload.metadata) collected.metadata = payload.metadata;

  if (isAnswerEvent(payload.event) && typeof payload.answer === "string") {
    collected.answer += payload.answer;
  } else if (payload.event === "text_chunk" && typeof payload.data?.text === "string") {
    collected.answer += payload.data.text;
  } else if (payload.event === "message_replace" && typeof payload.answer === "string") {
    collected.answer = payload.answer;
  }

  const finalOutputAnswer = extractFinalOutputAnswer(payload);
  if (finalOutputAnswer) {
    collected.finalOutputAnswer = finalOutputAnswer;
  }
}

function isAnswerEvent(eventName) {
  return !eventName || eventName === "message" || eventName === "agent_message";
}

function extractFinalOutputAnswer(payload) {
  const outputs = payload?.data?.outputs || payload?.outputs || payload?.metadata?.outputs;
  if (!outputs || typeof outputs !== "object") return "";
  const candidates = [
    outputs.answer,
    outputs.LLM_TEXT,
    outputs.llm_text,
    outputs.final_answer,
    outputs.final_player_visible_text,
    outputs.narration,
    outputs.text
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return found ? String(found) : "";
}

function createDifyError({ status, details, responseBody, requestContext }) {
  const error = new Error("Dify API request failed");
  error.status = status;
  error.details = details;
  error.suggestion = DIFY_ERROR_SUGGESTION;
  error.difyDiagnostics = {
    status,
    responseBody,
    endpointUrl: requestContext.endpointUrl,
    hasApiKey: requestContext.hasApiKey,
    conversationId: requestContext.conversationId,
    user: requestContext.user
  };
  return error;
}
