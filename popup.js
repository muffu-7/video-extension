(function () {
  const segmentsInput = document.getElementById("segments-input");
  const saveBtn = document.getElementById("save-btn");
  const enabledToggle = document.getElementById("enabled-toggle");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const noVideoEl = document.getElementById("no-video");
  const mainControls = document.getElementById("main-controls");
  const generateBtn = document.getElementById("generate-btn");
  const maxMinutesInput = document.getElementById("max-minutes");
  const instructionsInput = document.getElementById("instructions");
  const generateStatusEl = document.getElementById("generate-status");
  const askInput = document.getElementById("ask-input");
  const askBtn = document.getElementById("ask-btn");
  const outputBox = document.getElementById("output-box");
  const insightBtns = document.querySelectorAll(".insight-btn");
  const rangeMin = document.getElementById("range-min");
  const rangeMax = document.getElementById("range-max");
  const rangeFill = document.getElementById("range-fill");
  const rangeStartLabel = document.getElementById("range-start-label");
  const rangeEndLabel = document.getElementById("range-end-label");
  const fullVideoBtn = document.getElementById("full-video-btn");

  const SERVER_URL = "http://127.0.0.1:5055";

  let currentVideoId = null;
  let videoDuration = 0;

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

  // --- Status / error display ---

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

  // --- Slider helpers ---

  function formatSliderTime(seconds) {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function updateSliderUI() {
    const min = Number(rangeMin.value);
    const max = Number(rangeMax.value);
    const total = Number(rangeMin.max) || 1;
    const pctLeft = (min / total) * 100;
    const pctRight = (max / total) * 100;
    rangeFill.style.left = pctLeft + "%";
    rangeFill.style.width = (pctRight - pctLeft) + "%";
    rangeStartLabel.value = formatSliderTime(min);
    rangeEndLabel.value = formatSliderTime(max);
  }

  function initSlider(duration, currentTime) {
    videoDuration = Math.floor(duration) || 0;
    if (videoDuration <= 0) {
      videoDuration = 600;
    }
    rangeMin.min = 0;
    rangeMin.max = videoDuration;
    rangeMax.min = 0;
    rangeMax.max = videoDuration;

    const windowStart = Math.max(0, Math.floor(currentTime) - 120);
    const windowEnd = Math.min(videoDuration, Math.floor(currentTime) + 120);
    rangeMin.value = windowStart;
    rangeMax.value = windowEnd;
    updateSliderUI();
  }

  function getWindowTimes() {
    return {
      startTime: Number(rangeMin.value),
      endTime: Number(rangeMax.value),
    };
  }

  rangeMin.addEventListener("input", () => {
    if (Number(rangeMin.value) >= Number(rangeMax.value)) {
      rangeMin.value = Number(rangeMax.value) - 1;
    }
    updateSliderUI();
  });

  rangeMax.addEventListener("input", () => {
    if (Number(rangeMax.value) <= Number(rangeMin.value)) {
      rangeMax.value = Number(rangeMin.value) + 1;
    }
    updateSliderUI();
  });

  fullVideoBtn.addEventListener("click", () => {
    rangeMin.value = 0;
    rangeMax.value = videoDuration;
    updateSliderUI();
  });

  function applyTimeInput(inputEl, targetRange, isStart) {
    const seconds = parseTime(inputEl.value);
    if (isNaN(seconds) || seconds < 0) {
      updateSliderUI();
      return;
    }
    const clamped = Math.max(0, Math.min(videoDuration, Math.round(seconds)));
    if (isStart) {
      rangeMin.value = Math.min(clamped, Number(rangeMax.value) - 1);
    } else {
      rangeMax.value = Math.max(clamped, Number(rangeMin.value) + 1);
    }
    updateSliderUI();
  }

  rangeStartLabel.addEventListener("change", () => {
    applyTimeInput(rangeStartLabel, rangeMin, true);
  });

  rangeEndLabel.addEventListener("change", () => {
    applyTimeInput(rangeEndLabel, rangeMax, false);
  });

  rangeStartLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { rangeStartLabel.blur(); }
  });

  rangeEndLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { rangeEndLabel.blur(); }
  });

  // --- Output box helpers ---

  function outputKey(videoId) {
    return `output_${videoId}`;
  }

  function showOutput(text, className, persist) {
    outputBox.hidden = false;
    outputBox.textContent = text;
    outputBox.className = `output-box ${className || ""}`;
    if (persist !== false && currentVideoId && className !== "loading") {
      chrome.storage.local.set({
        [outputKey(currentVideoId)]: { text, className: className || "" },
      });
    }
  }

  function restoreOutput() {
    if (!currentVideoId) return;
    chrome.storage.local.get(outputKey(currentVideoId), (result) => {
      const saved = result[outputKey(currentVideoId)];
      if (saved && saved.text) {
        outputBox.hidden = false;
        outputBox.textContent = saved.text;
        outputBox.className = `output-box ${saved.className || ""}`;
      }
    });
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

    initSlider(resp.duration || 0, resp.currentTime || 0);

    const key = storageKey(currentVideoId);
    chrome.storage.local.get(key, (result) => {
      const data = result[key];
      if (data) {
        segmentsInput.value = data.raw || "";
        enabledToggle.checked = data.enabled !== false;
      }
      updateStatus(data);
    });

    restoreOutput();
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

  // --- Generate segments ---

  generateBtn.addEventListener("click", async () => {
    if (!currentVideoId) return;
    clearError();
    generateStatusEl.hidden = false;
    generateStatusEl.textContent = "Fetching transcript & generating segments...";
    generateStatusEl.className = "generate-status";
    generateBtn.disabled = true;

    const maxMin = maxMinutesInput.value ? parseInt(maxMinutesInput.value, 10) : null;
    const instructions = instructionsInput.value.trim();
    const body = { videoId: currentVideoId };
    if (maxMin && maxMin > 0) body.maxMinutes = maxMin;
    if (instructions) body.instructions = instructions;

    try {
      const resp = await fetch(`${SERVER_URL}/generate-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        generateStatusEl.textContent = data.error || "Server error";
        generateStatusEl.className = "generate-status error";
        return;
      }

      if (data.extensionInput) {
        segmentsInput.value = data.extensionInput;
        generateStatusEl.textContent = "Segments generated \u2014 hit Save to apply.";
      } else {
        generateStatusEl.textContent = "LLM returned no segments. Try again.";
        generateStatusEl.className = "generate-status error";
      }
    } catch (e) {
      generateStatusEl.textContent = "Cannot reach local server. Is it running?";
      generateStatusEl.className = "generate-status error";
    } finally {
      generateBtn.disabled = false;
    }
  });

  // --- Video insights (summary buttons) ---

  insightBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!currentVideoId) return;

      const summaryType = btn.dataset.type;
      showOutput("Thinking...", "loading");
      insightBtns.forEach((b) => (b.disabled = true));

      try {
        const win = getWindowTimes();
        const resp = await fetch(`${SERVER_URL}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: currentVideoId,
            type: summaryType,
            startTime: win.startTime,
            endTime: win.endTime,
          }),
        });
        const data = await resp.json();

        if (!resp.ok) {
          showOutput(data.error || "Server error", "error");
          return;
        }

        showOutput(data.summary || "No response returned.", "");
      } catch (e) {
        showOutput("Cannot reach local server. Is it running?", "error");
      } finally {
        insightBtns.forEach((b) => (b.disabled = false));
      }
    });
  });

  // --- Ask about the video ---

  askBtn.addEventListener("click", async () => {
    const question = askInput.value.trim();
    if (!question || !currentVideoId) return;

    showOutput("Thinking...", "loading");
    askBtn.disabled = true;

    try {
      const win = getWindowTimes();
      const resp = await fetch(`${SERVER_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: currentVideoId,
          question,
          startTime: win.startTime,
          endTime: win.endTime,
        }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        showOutput(data.error || "Server error", "error");
        return;
      }

      showOutput(data.answer || "No answer returned.", "");
    } catch (e) {
      showOutput("Cannot reach local server. Is it running?", "error");
    } finally {
      askBtn.disabled = false;
    }
  });

  askInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") askBtn.click();
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
