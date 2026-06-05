export async function uploadCloudSave(payload) {
  console.log("CLOUD_UPLOAD_REQUEST_URL", "/api/cloud-save");
  const response = await fetch("/api/cloud-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log("CLOUD_UPLOAD_RESPONSE_STATUS", response.status);

  const responsePayload = await response.json().catch(() => ({}));
  console.log("CLOUD_UPLOAD_RESPONSE_PAYLOAD", responsePayload);

  if (!response.ok) {
    const error = new Error(responsePayload.error || "Cloud save request failed");
    error.status = response.status;
    error.payload = responsePayload;
    throw error;
  }

  return responsePayload;
}

export async function loadCloudSave(saveCode) {
  const response = await fetch(`/api/cloud-save/${encodeURIComponent(saveCode)}`);
  const responsePayload = await parseCloudSaveResponse(response);
  console.log("CLOUD_LOAD_RESPONSE_KEYS", Object.keys(responsePayload || {}));
  if (responsePayload?.ok === false) {
    throw new Error(responsePayload.error || "Cloud save load failed.");
  }
  const rawSaveData =
    responsePayload?.saveData ||
    responsePayload?.data ||
    responsePayload?.save ||
    (responsePayload?.gameState || responsePayload?.chatHistory || responsePayload?.sessionSummary ? responsePayload : null);
  console.log("CLOUD_LOAD_SAVE_DATA_FOUND", Boolean(rawSaveData));
  return {
    ...responsePayload,
    saveData: rawSaveData
  };
}

export async function deleteCloudSave(saveCode) {
  const response = await fetch(`/api/cloud-save/${encodeURIComponent(saveCode)}`, {
    method: "DELETE"
  });
  return parseCloudSaveResponse(response);
}

export function normalizeSaveCode(value) {
  return String(value || "").trim();
}

export function isValidSaveCode(saveCode) {
  return /^[A-Za-z0-9_-]{1,40}$/.test(saveCode);
}

async function parseCloudSaveResponse(response) {
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { details: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.error || "Cloud save request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
