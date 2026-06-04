import { buildDifyInputsFromGameState, getGameState, repairInvalidOutgoingGameState } from "../state/gameState.js";
import { ensureUserId, getConversationId, saveGameState } from "../utils/storage.js";

export function buildDifyPayloadFromGameState(gameState = getGameState(), message = "") {
  const repairedState = repairInvalidOutgoingGameState(gameState);
  saveGameState(repairedState);
  const inputs = buildDifyInputsFromGameState();
  const frontendGameStateJson = JSON.stringify(repairedState);
  const playerAction = String(message || "");
  const previousSceneContext = String(
    repairedState.sessionSummary && repairedState.sessionSummary !== "Unknown"
      ? repairedState.sessionSummary
      : repairedState.objective || ""
  );
  return {
    message,
    conversation_id: getConversationId(),
    user: ensureUserId(),
    player_action: playerAction,
    previous_scene_context: previousSceneContext,
    frontend_game_state_json: frontendGameStateJson,
    Current_HP: inputs.Current_HP,
    Current_MP: inputs.Current_MP,
    Attributes: inputs.Attributes,
    Inventory: inputs.Inventory,
    Active_Flag: inputs.Active_Flag,
    current_Objective: inputs.current_Objective,
    Gojo_Affinity: inputs.Gojo_Affinity,
    Nanami_Affinity: inputs.Nanami_Affinity,
    sukuna_fingers: inputs.sukuna_fingers,
    state_updates_json: inputs.state_updates_json,
    inputs: {
      ...inputs,
      player_action: playerAction,
      previous_scene_context: previousSceneContext,
      frontend_game_state_json: frontendGameStateJson
    }
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
  if ("conversationId" in payload || "inputs" in payload) {
    return {
      ...payload,
      conversation_id: payload.conversation_id ?? payload.conversationId ?? "",
      user: payload.user ?? ensureUserId(),
      inputs: payload.inputs || {}
    };
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
