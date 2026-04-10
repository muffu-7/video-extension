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

  // Visual Analysis elements
  const vaRangeMin = document.getElementById("va-range-min");
  const vaRangeMax = document.getElementById("va-range-max");
  const vaRangeFill = document.getElementById("va-range-fill");
  const vaRangeStartLabel = document.getElementById("va-range-start-label");
  const vaRangeEndLabel = document.getElementById("va-range-end-label");
  const vaFullVideoBtn = document.getElementById("va-full-video-btn");
  const vaIntervalSlider = document.getElementById("va-interval");
  const vaIntervalLabel = document.getElementById("va-interval-label");
  const vaDedupToggle = document.getElementById("va-dedup-toggle");
  const vaQuestion = document.getElementById("va-question");
  const vaCaptureBtn = document.getElementById("va-capture-btn");
  const vaProgressEl = document.getElementById("va-progress");
  const vaProgressFill = document.getElementById("va-progress-fill");
  const vaProgressText = document.getElementById("va-progress-text");
  const vaWarning = document.getElementById("va-warning");
  const vaOutputBox = document.getElementById("va-output-box");
  const tokenUsageEl = document.getElementById("token-usage");
  const vaTokenUsageEl = document.getElementById("va-token-usage");
  const askSearchToggle = document.getElementById("ask-search-toggle");
  const vaSearchToggle = document.getElementById("va-search-toggle");
  const speakBtn = document.getElementById("speak-btn");
  const vaSpeakBtn = document.getElementById("va-speak-btn");

  let currentVideoId = null;
  let videoDuration = 0;
  let captureAborted = false;

  function formatTokenCount(n) {
    if (n == null) return "—";
    return n.toLocaleString();
  }

  function calculateCost(usage) {
    if (!usage) return null;
    const input = usage.input_tokens || 0;
    const cached = usage.cached_input_tokens || 0;
    const output = usage.output_tokens || 0;
    const freshInput = input - cached;
    const TIER_BOUNDARY = 272000;
    const isHighTier = input > TIER_BOUNDARY;

    const inputPrice = isHighTier ? 5.0 : 2.5;
    const outputPrice = isHighTier ? 22.5 : 15.0;
    const cachePrice = isHighTier ? 0.5 : 0.25;

    const cost =
      (freshInput / 1_000_000) * inputPrice +
      (cached / 1_000_000) * cachePrice +
      (output / 1_000_000) * outputPrice;
    return cost;
  }

  function showTokenUsage(el, usage) {
    if (!usage || (!usage.input_tokens && !usage.output_tokens)) {
      el.hidden = true;
      return;
    }
    const input = usage.input_tokens || 0;
    const cached = usage.cached_input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cost = calculateCost(usage);

    let html = `<span class="token-label">In:</span> <span class="token-value">${formatTokenCount(input)}</span>`;
    if (cached > 0) {
      html += ` <span class="token-label">(cached: ${formatTokenCount(cached)})</span>`;
    }
    html += ` <span class="token-label">Out:</span> <span class="token-value">${formatTokenCount(output)}</span>`;
    if (cost != null) {
      html += ` <span class="token-label">Cost:</span> <span class="token-value token-cost">$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>`;
    }

    el.innerHTML = html;
    el.hidden = false;
  }

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

  function showOutput(text, className, persist, usage) {
    outputBox.hidden = false;
    outputBox.textContent = text;
    outputBox.className = `output-box ${className || ""}`;
    if (persist !== false && currentVideoId && className !== "loading") {
      chrome.storage.local.set({
        [outputKey(currentVideoId)]: { text, className: className || "", usage: usage || null },
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
        if (saved.usage) {
          showTokenUsage(tokenUsageEl, saved.usage);
        }
        updateSpeakBtnVisibility(speakBtn, outputBox);
      }
    });
  }

  // --- Text-to-speech ---

  function toggleSpeak(btn, textEl) {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      btn.textContent = "\u{1F50A}";
      btn.classList.remove("speaking");
      return;
    }
    const text = textEl.textContent;
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.includes("Google")
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      btn.textContent = "\u23F9";
      btn.classList.add("speaking");
    };
    utterance.onend = () => {
      btn.textContent = "\u{1F50A}";
      btn.classList.remove("speaking");
    };
    utterance.onerror = () => {
      btn.textContent = "\u{1F50A}";
      btn.classList.remove("speaking");
    };

    speechSynthesis.speak(utterance);
  }

  function updateSpeakBtnVisibility(btn, textEl) {
    btn.hidden = textEl.hidden || !textEl.textContent ||
      textEl.classList.contains("loading") || textEl.classList.contains("error");
  }

  speakBtn.addEventListener("click", () => toggleSpeak(speakBtn, outputBox));
  vaSpeakBtn.addEventListener("click", () => toggleSpeak(vaSpeakBtn, vaOutputBox));

  const origShowOutput = showOutput;
  showOutput = function (text, className, persist, usage) {
    speechSynthesis.cancel();
    speakBtn.textContent = "\u{1F50A}";
    speakBtn.classList.remove("speaking");
    origShowOutput(text, className, persist, usage);
    updateSpeakBtnVisibility(speakBtn, outputBox);
  };

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

  // --- Service worker job helpers ---

  function jobKey(videoId, endpoint) {
    return `job_${videoId}_${endpoint.replace(/^\//, "")}`;
  }

  function startJob(endpoint, body) {
    chrome.runtime.sendMessage({
      type: "server-request",
      endpoint,
      videoId: currentVideoId,
      body,
    }, () => {
      void chrome.runtime.lastError;
    });
  }

  function handleJobResult(endpoint, job) {
    if (endpoint === "/ask") {
      if (job.status === "done") {
        const data = job.result;
        showOutput(data.answer || "No answer returned.", "", true, data.usage);
        showTokenUsage(tokenUsageEl, data.usage);
      } else {
        showOutput(job.error, "error");
      }
      askBtn.disabled = false;
    } else if (endpoint === "/summary") {
      if (job.status === "done") {
        const data = job.result;
        showOutput(data.summary || "No response returned.", "", true, data.usage);
        showTokenUsage(tokenUsageEl, data.usage);
      } else {
        showOutput(job.error, "error");
      }
      insightBtns.forEach((b) => (b.disabled = false));
    } else if (endpoint === "/generate-segments") {
      if (job.status === "done") {
        const data = job.result;
        if (data.extensionInput) {
          segmentsInput.value = data.extensionInput;
          generateStatusEl.textContent = "Segments generated \u2014 hit Save to apply.";
        } else {
          generateStatusEl.textContent = "LLM returned no segments. Try again.";
          generateStatusEl.className = "generate-status error";
        }
        showTokenUsage(tokenUsageEl, data.usage);
      } else {
        generateStatusEl.textContent = job.error;
        generateStatusEl.className = "generate-status error";
      }
      generateBtn.disabled = false;
    } else if (endpoint === "/visual-analyze") {
      vaProgressEl.hidden = true;
      vaCaptureBtn.disabled = false;
      vaCaptureBtn.textContent = "Capture & Analyze";
      if (job.status === "done") {
        const data = job.result;
        vaOutputBox.hidden = false;
        vaOutputBox.textContent = data.answer || data.summary || "No response returned.";
        vaOutputBox.className = "output-box";
        showTokenUsage(vaTokenUsageEl, data.usage);
        if (currentVideoId) {
          chrome.storage.local.set({
            [`va_output_${currentVideoId}`]: {
              text: vaOutputBox.textContent,
              className: "",
              usage: data.usage || null,
            },
          });
        }
      } else {
        vaOutputBox.hidden = false;
        vaOutputBox.textContent = job.error;
        vaOutputBox.className = "output-box error";
      }
      updateSpeakBtnVisibility(vaSpeakBtn, vaOutputBox);
    }
  }

  const JOB_ENDPOINTS = ["/ask", "/summary", "/generate-segments", "/visual-analyze"];

  function restoreJobs() {
    if (!currentVideoId) return;
    const keys = JOB_ENDPOINTS.map((e) => jobKey(currentVideoId, e));

    chrome.storage.local.get(keys, (result) => {
      for (const endpoint of JOB_ENDPOINTS) {
        const key = jobKey(currentVideoId, endpoint);
        const job = result[key];
        if (!job) continue;

        if (job.status === "pending") {
          if (endpoint === "/ask") {
            showOutput("Thinking...", "loading");
            askBtn.disabled = true;
          } else if (endpoint === "/summary") {
            showOutput("Thinking...", "loading");
            insightBtns.forEach((b) => (b.disabled = true));
          } else if (endpoint === "/generate-segments") {
            generateStatusEl.hidden = false;
            generateStatusEl.textContent = "Generating segments...";
            generateStatusEl.className = "generate-status";
            generateBtn.disabled = true;
          } else if (endpoint === "/visual-analyze") {
            vaProgressEl.hidden = false;
            vaProgressFill.style.width = "80%";
            vaProgressText.textContent = "Waiting for LLM response...";
            vaCaptureBtn.disabled = true;
            vaCaptureBtn.textContent = "Analyzing...";
          }
        } else if (job.status === "done" || job.status === "error") {
          handleJobResult(endpoint, job);
          chrome.storage.local.remove(key);
        }
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !currentVideoId) return;
    for (const endpoint of JOB_ENDPOINTS) {
      const key = jobKey(currentVideoId, endpoint);
      if (changes[key] && changes[key].newValue) {
        const job = changes[key].newValue;
        if (job.status === "done" || job.status === "error") {
          handleJobResult(endpoint, job);
          chrome.storage.local.remove(key);
        }
      }
    }
  });

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
    initVaSlider(resp.duration || 0, resp.currentTime || 0);

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
    restoreVaOutput();
    restoreJobs();
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

  generateBtn.addEventListener("click", () => {
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

    startJob("/generate-segments", body);
  });

  // --- Video insights (summary buttons) ---

  insightBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentVideoId) return;
      showOutput("Thinking...", "loading");
      insightBtns.forEach((b) => (b.disabled = true));

      const win = getWindowTimes();
      startJob("/summary", {
        videoId: currentVideoId,
        type: btn.dataset.type,
        startTime: win.startTime,
        endTime: win.endTime,
      });
    });
  });

  // --- Ask about the video ---

  askBtn.addEventListener("click", () => {
    const question = askInput.value.trim();
    if (!question || !currentVideoId) return;

    showOutput("Thinking...", "loading");
    askBtn.disabled = true;

    const win = getWindowTimes();
    startJob("/ask", {
      videoId: currentVideoId,
      question,
      startTime: win.startTime,
      endTime: win.endTime,
      webSearch: askSearchToggle.checked,
    });
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

  // --- Tab switching ---

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  // --- Visual Analysis slider ---

  function updateVaSliderUI() {
    const min = Number(vaRangeMin.value);
    const max = Number(vaRangeMax.value);
    const total = Number(vaRangeMin.max) || 1;
    const pctLeft = (min / total) * 100;
    const pctRight = (max / total) * 100;
    vaRangeFill.style.left = pctLeft + "%";
    vaRangeFill.style.width = (pctRight - pctLeft) + "%";
    vaRangeStartLabel.value = formatSliderTime(min);
    vaRangeEndLabel.value = formatSliderTime(max);
  }

  function initVaSlider(duration, currentTime) {
    const dur = Math.floor(duration) || 600;
    vaRangeMin.min = 0;
    vaRangeMin.max = dur;
    vaRangeMax.min = 0;
    vaRangeMax.max = dur;
    const windowStart = Math.max(0, Math.floor(currentTime) - 30);
    const windowEnd = Math.min(dur, Math.floor(currentTime) + 30);
    vaRangeMin.value = windowStart;
    vaRangeMax.value = windowEnd;
    updateVaSliderUI();
  }

  vaRangeMin.addEventListener("input", () => {
    if (Number(vaRangeMin.value) >= Number(vaRangeMax.value)) {
      vaRangeMin.value = Number(vaRangeMax.value) - 1;
    }
    updateVaSliderUI();
  });

  vaRangeMax.addEventListener("input", () => {
    if (Number(vaRangeMax.value) <= Number(vaRangeMin.value)) {
      vaRangeMax.value = Number(vaRangeMin.value) + 1;
    }
    updateVaSliderUI();
  });

  vaFullVideoBtn.addEventListener("click", () => {
    vaRangeMin.value = 0;
    vaRangeMax.value = videoDuration || 600;
    updateVaSliderUI();
  });

  function vaApplyTimeInput(inputEl, isStart) {
    const seconds = parseTime(inputEl.value);
    if (isNaN(seconds) || seconds < 0) {
      updateVaSliderUI();
      return;
    }
    const dur = Number(vaRangeMin.max) || 600;
    const clamped = Math.max(0, Math.min(dur, Math.round(seconds)));
    if (isStart) {
      vaRangeMin.value = Math.min(clamped, Number(vaRangeMax.value) - 1);
    } else {
      vaRangeMax.value = Math.max(clamped, Number(vaRangeMin.value) + 1);
    }
    updateVaSliderUI();
  }

  vaRangeStartLabel.addEventListener("change", () => vaApplyTimeInput(vaRangeStartLabel, true));
  vaRangeEndLabel.addEventListener("change", () => vaApplyTimeInput(vaRangeEndLabel, false));
  vaRangeStartLabel.addEventListener("keydown", (e) => { if (e.key === "Enter") vaRangeStartLabel.blur(); });
  vaRangeEndLabel.addEventListener("keydown", (e) => { if (e.key === "Enter") vaRangeEndLabel.blur(); });

  // --- Interval slider ---

  function updateIntervalLabel() {
    const val = Number(vaIntervalSlider.value);
    vaIntervalLabel.textContent = `1 frame / ${val}s`;
  }

  vaIntervalSlider.addEventListener("input", updateIntervalLabel);
  updateIntervalLabel();

  // --- Screenshot capture helper ---

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
    });
  }

  // --- Visual Analysis: Capture & Analyze ---

  vaCaptureBtn.addEventListener("click", async () => {
    if (!currentVideoId) return;

    const startTime = Number(vaRangeMin.value);
    const endTime = Number(vaRangeMax.value);
    const interval = Number(vaIntervalSlider.value);
    const deduplicate = vaDedupToggle.checked;
    const question = vaQuestion.value.trim();

    if (endTime <= startTime) {
      vaOutputBox.hidden = false;
      vaOutputBox.textContent = "End time must be after start time.";
      vaOutputBox.className = "output-box error";
      return;
    }

    const totalFrames = Math.floor((endTime - startTime) / interval) + 1;
    if (totalFrames > 300) {
      vaOutputBox.hidden = false;
      vaOutputBox.textContent = "Window too large. Reduce the time range or increase the interval.";
      vaOutputBox.className = "output-box error";
      return;
    }

    captureAborted = false;
    vaCaptureBtn.disabled = true;
    vaCaptureBtn.textContent = "Capturing...";
    vaWarning.hidden = false;
    vaProgressEl.hidden = false;
    vaProgressFill.style.width = "0%";
    vaProgressText.textContent = `Preparing capture (${totalFrames} frames)...`;
    vaOutputBox.hidden = true;

    try {
      const prepResp = await sendToContent({ type: "prepare-capture" });
      if (!prepResp || !prepResp.ok) {
        throw new Error(prepResp?.error || "Could not access the video player.");
      }

      const videoRect = prepResp.rect;
      const savedTime = prepResp.savedTime;
      const frames = [];

      for (let i = 0; i < totalFrames; i++) {
        if (captureAborted) break;

        const t = startTime + i * interval;
        if (t > endTime) break;

        vaProgressText.textContent = `Capturing frame ${i + 1} / ${totalFrames} (${formatSliderTime(t)})...`;
        vaProgressFill.style.width = ((i + 1) / totalFrames * 70) + "%";

        const seekResp = await sendToContent({ type: "seek-to", time: t });
        if (!seekResp || !seekResp.ok) {
          throw new Error("Seek failed at " + formatSliderTime(t));
        }

        await new Promise((r) => setTimeout(r, 400));

        const dataUrl = await captureVisibleTab();
        frames.push({ timestamp: t, dataUrl });

        await new Promise((r) => setTimeout(r, 300));
      }

      await sendToContent({
        type: "finish-capture",
        restoreTime: savedTime,
        wasPlaying: true,
      });

      vaWarning.hidden = true;

      if (frames.length === 0) {
        throw new Error("No frames were captured.");
      }

      vaProgressText.textContent = `Sending ${frames.length} frames for analysis... you can close this popup.`;
      vaProgressFill.style.width = "80%";

      startJob("/visual-analyze", {
        videoId: currentVideoId,
        frames: frames.map((f) => ({ timestamp: f.timestamp, dataUrl: f.dataUrl })),
        videoRect,
        startTime,
        endTime,
        deduplicate,
        question: question || null,
        webSearch: vaSearchToggle.checked,
      });
    } catch (e) {
      vaOutputBox.hidden = false;
      vaOutputBox.textContent = e.message || "Capture failed.";
      vaOutputBox.className = "output-box error";
      vaWarning.hidden = true;

      await sendToContent({ type: "finish-capture", restoreTime: 0, wasPlaying: true }).catch(() => {});
      vaCaptureBtn.disabled = false;
      vaCaptureBtn.textContent = "Capture & Analyze";
    }
  });

  // --- Restore visual analysis output ---

  function restoreVaOutput() {
    if (!currentVideoId) return;
    chrome.storage.local.get(`va_output_${currentVideoId}`, (result) => {
      const saved = result[`va_output_${currentVideoId}`];
      if (saved && saved.text) {
        vaOutputBox.hidden = false;
        vaOutputBox.textContent = saved.text;
        vaOutputBox.className = `output-box ${saved.className || ""}`;
        if (saved.usage) {
          showTokenUsage(vaTokenUsageEl, saved.usage);
        }
        updateSpeakBtnVisibility(vaSpeakBtn, vaOutputBox);
      }
    });
  }

  // --- Clear all saved data ---

  const clearDataBtn = document.getElementById("clear-data-btn");
  let clearPending = false;

  clearDataBtn.addEventListener("click", () => {
    if (!clearPending) {
      clearPending = true;
      clearDataBtn.textContent = "Are you sure? Click again to confirm";
      clearDataBtn.classList.add("confirm");
      setTimeout(() => {
        clearPending = false;
        clearDataBtn.textContent = "Clear all saved data";
        clearDataBtn.classList.remove("confirm");
      }, 3000);
      return;
    }

    chrome.storage.local.clear(() => {
      clearPending = false;
      clearDataBtn.textContent = "Cleared!";
      clearDataBtn.classList.remove("confirm");

      segmentsInput.value = "";
      enabledToggle.checked = false;
      outputBox.hidden = true;
      outputBox.textContent = "";
      tokenUsageEl.hidden = true;
      vaOutputBox.hidden = true;
      vaOutputBox.textContent = "";
      vaTokenUsageEl.hidden = true;
      generateStatusEl.hidden = true;
      generateBtn.disabled = false;
      askBtn.disabled = false;
      insightBtns.forEach((b) => (b.disabled = false));
      updateStatus(null);

      setTimeout(() => {
        clearDataBtn.textContent = "Clear all saved data";
      }, 2000);
    });
  });

  init();
})();
