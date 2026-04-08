(function () {
  const segmentsInput = document.getElementById("segments-input");
  const saveBtn = document.getElementById("save-btn");
  const enabledToggle = document.getElementById("enabled-toggle");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const noVideoEl = document.getElementById("no-video");
  const mainControls = document.getElementById("main-controls");

  let currentVideoId = null;

  function storageKey(videoId) {
    return `segments_${videoId}`;
  }

  // --- Time parsing ---

  function parseTime(str) {
    str = str.trim();
    if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);

    const parts = str.split(":").map(Number);
    if (parts.some(isNaN)) return NaN;

    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return NaN;
  }

  function parseSegments(raw) {
    const segments = [];
    const pieces = raw.split(",").map((s) => s.trim()).filter(Boolean);

    for (const piece of pieces) {
      const [startStr, endStr] = piece.split("-").map((s) => s.trim());
      if (!startStr || !endStr) {
        return { error: `Invalid segment: "${piece}". Use format start-end.` };
      }
      const start = parseTime(startStr);
      const end = parseTime(endStr);
      if (isNaN(start) || isNaN(end)) {
        return { error: `Cannot parse time in "${piece}".` };
      }
      if (start >= end) {
        return { error: `Start must be before end in "${piece}".` };
      }
      segments.push({ start, end });
    }

    if (segments.length === 0) {
      return { error: "Enter at least one segment." };
    }
    return { segments };
  }

  function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // --- Status display ---

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function updateStatus(data) {
    if (!data || !data.segments || data.segments.length === 0) {
      statusEl.textContent = "No segments saved.";
      return;
    }
    const n = data.segments.length;
    const label = n === 1 ? "1 segment" : `${n} segments`;
    if (data.enabled) {
      statusEl.textContent = `Looping ${label}`;
    } else {
      statusEl.textContent = `${label} saved \u2014 disabled`;
    }
  }

  // --- Messaging helpers ---

  function sendToContent(message) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return resolve(null);
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(response);
        });
      });
    });
  }

  // --- Init ---

  async function init() {
    const resp = await sendToContent({ type: "get-video-id" });

    if (!resp || !resp.videoId) {
      mainControls.hidden = true;
      noVideoEl.hidden = false;
      return;
    }

    currentVideoId = resp.videoId;
    noVideoEl.hidden = true;
    mainControls.hidden = false;

    const key = storageKey(currentVideoId);
    chrome.storage.local.get(key, (result) => {
      const data = result[key];
      if (data) {
        segmentsInput.value = data.raw || "";
        enabledToggle.checked = data.enabled !== false;
      }
      updateStatus(data);
    });
  }

  // --- Save ---

  saveBtn.addEventListener("click", () => {
    clearError();
    const raw = segmentsInput.value;
    const result = parseSegments(raw);

    if (result.error) {
      showError(result.error);
      return;
    }

    const key = storageKey(currentVideoId);
    const data = {
      enabled: enabledToggle.checked,
      segments: result.segments,
      raw: raw,
    };

    chrome.storage.local.set({ [key]: data }, () => {
      updateStatus(data);
      sendToContent({ type: "update-segments" });
    });
  });

  // --- Toggle ---

  enabledToggle.addEventListener("change", () => {
    if (!currentVideoId) return;
    clearError();

    const key = storageKey(currentVideoId);
    chrome.storage.local.get(key, (result) => {
      const data = result[key] || {};
      data.enabled = enabledToggle.checked;
      chrome.storage.local.set({ [key]: data }, () => {
        updateStatus(data);
        sendToContent({ type: "toggle", enabled: data.enabled });
      });
    });
  });

  init();
})();
