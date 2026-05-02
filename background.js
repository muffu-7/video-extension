const SERVER_URL = "http://127.0.0.1:5055";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "server-request") {
    handleServerRequest(msg)
      .then(() => sendResponse({ done: true }))
      .catch(() => sendResponse({ done: false }));
    return true;
  }
  if (msg.type === "open-options") {
    chrome.runtime.openOptionsPage(() => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true });
    });
    return true;
  }
});

async function handleServerRequest({ endpoint, videoId, body, requestId, messageId, sessionId }) {
  const keyPart = requestId || endpoint.replace(/^\//, "");
  const jobKey = `job_${videoId}_${keyPart}`;

  await chrome.storage.local.set({
    [jobKey]: {
      status: "pending",
      startedAt: Date.now(),
      endpoint,
      requestId: requestId || null,
      messageId: messageId || null,
      sessionId: sessionId || null,
    },
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
        [jobKey]: {
          status: "error",
          error: data.error || "Server error",
          result: data,
          endpoint,
          requestId: requestId || null,
          messageId: messageId || null,
          sessionId: sessionId || null,
        },
      });
      return;
    }

    await chrome.storage.local.set({
      [jobKey]: {
        status: "done",
        result: data,
        endpoint,
        requestId: requestId || null,
        messageId: messageId || null,
        sessionId: sessionId || null,
      },
    });
  } catch (e) {
    await chrome.storage.local.set({
      [jobKey]: {
        status: "error",
        error: "Cannot reach local server. Is it running?",
        endpoint,
        requestId: requestId || null,
        messageId: messageId || null,
        sessionId: sessionId || null,
      },
    });
  }
}
