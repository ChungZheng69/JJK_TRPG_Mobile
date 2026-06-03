export async function uploadCloudSave(payload) {
  const response = await fetch("/api/cloud-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseCloudSaveResponse(response);
}

export async function loadCloudSave(saveCode) {
  const response = await fetch(`/api/cloud-save/${encodeURIComponent(saveCode)}`);
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
