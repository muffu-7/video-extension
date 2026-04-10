const SERVER_URL = "http://127.0.0.1:5055";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "server-request") {
    handleServerRequest(msg)
      .then(() => sendResponse({ done: true }))
      .catch(() => sendResponse({ done: false }));
    return true;
  }
});

async function handleServerRequest({ endpoint, videoId, body }) {
  const jobKey = `job_${videoId}_${endpoint.replace(/^\//, "")}`;

  await chrome.storage.local.set({
    [jobKey]: { status: "pending", startedAt: Date.now() },
  });

  try {
    const resp = await fetch(`${SERVER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      await chrome.storage.local.set({
        [jobKey]: { status: "error", error: data.error || "Server error" },
      });
      return;
    }

    await chrome.storage.local.set({
      [jobKey]: { status: "done", result: data },
    });
  } catch (e) {
    await chrome.storage.local.set({
      [jobKey]: { status: "error", error: "Cannot reach local server. Is it running?" },
    });
  }
}
