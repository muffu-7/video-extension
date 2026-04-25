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
  const segmentsTotalEl = document.getElementById("segments-total");
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
  const ttsToolbar = document.getElementById("tts-toolbar");
  const ttsControls = document.getElementById("tts-controls");
  const ttsStatus = document.getElementById("tts-status");
  const ttsPlayPause = document.getElementById("tts-play-pause");
  const ttsRetry = document.getElementById("tts-retry");
  const ttsSeek = document.getElementById("tts-seek");
  const ttsTime = document.getElementById("tts-time");
  const ttsProvider = document.getElementById("tts-provider");
  const ttsSpeed = document.getElementById("tts-speed");
  const vaTtsToolbar = document.getElementById("va-tts-toolbar");
  const vaTtsControls = document.getElementById("va-tts-controls");
  const vaTtsStatus = document.getElementById("va-tts-status");
  const vaTtsPlayPause = document.getElementById("va-tts-play-pause");
  const vaTtsRetry = document.getElementById("va-tts-retry");
  const vaTtsSeek = document.getElementById("va-tts-seek");
  const vaTtsTime = document.getElementById("va-tts-time");
  const vaTtsProvider = document.getElementById("va-tts-provider");
  const vaTtsSpeed = document.getElementById("va-tts-speed");
  const shortsToggle = document.getElementById("shorts-toggle");
  const shortsPageStatus = document.getElementById("shorts-page-status");
  const shortcutsEnabledToggle = document.getElementById("shortcuts-enabled-toggle");
  const shortcutsIgnoreInputsToggle = document.getElementById("shortcuts-ignore-inputs-toggle");
  const shortcutsOverlayToggle = document.getElementById("shortcuts-overlay-toggle");
  const shortcutsSummary = document.getElementById("shortcuts-summary");
  const openShortcutsOptionsBtn = document.getElementById("open-shortcuts-options");
  const SHORTCUTS_STORAGE_KEY = (self.VSC_SHORTCUTS && self.VSC_SHORTCUTS.STORAGE_KEY) || "custom_shortcuts";

  let currentVideoId = null;
  let videoDuration = 0;
  let captureAborted = false;
  let currentIsShortsPage = false;
  let currentTtsAudio = null;
  let currentTtsButton = null;
  let currentTtsAbort = null;
  let currentTtsUi = null;
  let currentTtsJobId = null;
  let currentTtsPollTimer = null;
  let currentTtsObjectUrl = null;
  let currentTtsKind = null;
  let currentTtsChunkUrls = [];
  let currentTtsChunkDurations = [];
  let currentTtsPlayingChunk = 0;
  let currentTtsSeekMode = "final";
  let currentChromeUtterance = null;
  let currentChromeText = "";
  let currentChromeStartedAt = 0;
  let currentChromeElapsed = 0;
  let currentChromeTimer = null;
  const stoppedChromeUtterances = new WeakSet();
  let currentTtsMode = "gemini";
  const SERVER_URL = "http://127.0.0.1:5055";
  const SHORTS_AUTO_SCROLL_KEY = "shorts_auto_scroll";

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

  function updateShortsUi() {
    shortsToggle.disabled = !currentIsShortsPage;
    if (currentIsShortsPage) {
      shortsPageStatus.textContent = "Current page: YouTube Short";
      shortsPageStatus.className = "shorts-status active";
    } else {
      shortsPageStatus.textContent = "Open a YouTube Short to enable this toggle.";
      shortsPageStatus.className = "shorts-status";
    }
  }

  function restoreShortsSettings() {
    chrome.storage.local.get(SHORTS_AUTO_SCROLL_KEY, (result) => {
      shortsToggle.checked = result[SHORTS_AUTO_SCROLL_KEY] === true;
      updateShortsUi();
    });
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

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${m}:${pad(sec)}`;
  }

  function updateSegmentsTotal(rawOverride) {
    if (!segmentsTotalEl) return;
    const raw = (rawOverride !== undefined ? rawOverride : segmentsInput.value).trim();
    if (!raw) {
      segmentsTotalEl.hidden = true;
      segmentsTotalEl.textContent = "";
      segmentsTotalEl.className = "segments-total";
      return;
    }
    const result = parseSegments(raw);
    if (result.error) {
      segmentsTotalEl.hidden = false;
      segmentsTotalEl.className = "segments-total error";
      segmentsTotalEl.textContent = "Invalid segments";
      return;
    }
    const total = result.segments.reduce((acc, s) => acc + (s.end - s.start), 0);
    const count = result.segments.length;
    segmentsTotalEl.hidden = false;
    segmentsTotalEl.className = "segments-total";
    segmentsTotalEl.textContent = `Total: ${formatDuration(total)} (${count} segment${count === 1 ? "" : "s"})`;
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

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function getTtsUi(btn) {
    if (btn === vaSpeakBtn) {
      return {
        toolbar: vaTtsToolbar,
        controls: vaTtsControls,
        status: vaTtsStatus,
        playPause: vaTtsPlayPause,
        retry: vaTtsRetry,
        seek: vaTtsSeek,
        time: vaTtsTime,
        provider: vaTtsProvider,
        speed: vaTtsSpeed,
      };
    }
    return {
      toolbar: ttsToolbar,
      controls: ttsControls,
      status: ttsStatus,
      playPause: ttsPlayPause,
      retry: ttsRetry,
      seek: ttsSeek,
      time: ttsTime,
      provider: ttsProvider,
      speed: ttsSpeed,
    };
  }

  function getTtsKind(btn) {
    return btn === vaSpeakBtn ? "visual" : "transcript";
  }

  function getTtsButton(kind) {
    return kind === "visual" ? vaSpeakBtn : speakBtn;
  }

  function getTtsTextEl(kind) {
    return kind === "visual" ? vaOutputBox : outputBox;
  }

  function ttsJobStorageKey(kind) {
    return currentVideoId ? `tts_job_${currentVideoId}_${kind}` : null;
  }

  function saveTtsJob(kind, jobId) {
    const key = ttsJobStorageKey(kind);
    if (!key) return;
    chrome.storage.local.set({ [key]: { jobId, kind, savedAt: Date.now() } });
  }

  function clearSavedTtsJob(kind) {
    const key = ttsJobStorageKey(kind);
    if (!key) return;
    chrome.storage.local.remove(key);
  }

  function setTtsStatus(ui, text, className) {
    ui.controls.hidden = false;
    ui.status.textContent = text || "";
    ui.status.className = `tts-status ${className || ""}`;
  }

  function ttsJobMessage(job) {
    if (!job) return "Preparing speech...";
    const total = job.chunksTotal || 0;
    const done = job.chunksDone || 0;
    if (job.status === "queued") return total ? `Queued ${total} speech chunk${total === 1 ? "" : "s"}...` : "Queued...";
    if (job.status === "rate_limited") {
      return job.message || "Rate limited. Retry manually when quota is available.";
    }
    if (job.status === "running" || job.status === "cancelling") {
      const base = job.message || "Generating speech";
      return total ? `${base} (${done}/${total} done)` : base;
    }
    if (job.status === "done") return "Speech ready.";
    if (job.status === "cancelled") return "Speech generation cancelled.";
    if (job.status === "error") return job.error?.message || "Speech generation failed.";
    return job.message || "Preparing speech...";
  }

  function revokeTtsUrls() {
    if (currentTtsObjectUrl) {
      URL.revokeObjectURL(currentTtsObjectUrl);
      currentTtsObjectUrl = null;
    }
    currentTtsChunkUrls.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    currentTtsChunkUrls = [];
  }

  function generatedAudioDuration() {
    return currentTtsChunkDurations.reduce((sum, duration, index) => {
      return currentTtsChunkUrls[index] ? sum + (duration || 0) : sum;
    }, 0);
  }

  function chunkStartTime(chunkIndex) {
    let total = 0;
    for (let i = 0; i < chunkIndex; i++) {
      total += currentTtsChunkDurations[i] || 0;
    }
    return total;
  }

  function resetSpeakButton(btn) {
    if (!btn) return;
    btn.textContent = "Read aloud";
    btn.disabled = false;
    btn.classList.remove("speaking", "loading");
  }

  function setTtsControlMode(ui, mode) {
    if (!ui) return;
    ui.controls.classList.toggle("local-mode", mode === "local");
    ui.seek.hidden = mode === "local";
    ui.time.hidden = mode === "local";
  }

  function chromeTtsApproxDuration(text, rate) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words ? (words / (165 * (rate || 1))) * 60 : 0;
  }

  function updateChromeTtsControls() {
    if (!currentTtsUi || currentTtsMode !== "chrome") return;
    const rate = Number(currentTtsUi.speed.value) || 1;
    const duration = chromeTtsApproxDuration(currentChromeText, rate);
    const current = speechSynthesis.paused
      ? currentChromeElapsed
      : currentChromeElapsed + ((Date.now() - currentChromeStartedAt) / 1000);

    currentTtsUi.seek.max = String(duration || 0);
    currentTtsUi.seek.value = String(Math.min(current, duration) || 0);
    currentTtsUi.seek.disabled = true;
    currentTtsUi.time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
    currentTtsUi.playPause.textContent = speechSynthesis.paused ? "Play" : "Pause";
    if (currentTtsButton) {
      currentTtsButton.textContent = "Stop";
    }
  }

  function stopChromeTts() {
    if (currentChromeTimer) {
      clearInterval(currentChromeTimer);
      currentChromeTimer = null;
    }
    if (currentChromeUtterance) {
      stoppedChromeUtterances.add(currentChromeUtterance);
    }
    if (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused) {
      speechSynthesis.cancel();
    }
    currentChromeUtterance = null;
    currentChromeText = "";
    currentChromeStartedAt = 0;
    currentChromeElapsed = 0;
  }

  function chooseChromeVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google"))
      || voices.find((v) => v.lang.startsWith("en"))
      || voices[0]
      || null;
  }

  function startChromeTts(text, btn, ui, reason) {
    if (currentTtsMode === "chrome" && currentChromeText === text &&
      (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused)) {
      return;
    }
    stopChromeTts();
    currentTtsMode = "chrome";
    currentTtsButton = btn;
    currentTtsUi = ui;
    currentChromeText = text;
    currentChromeElapsed = 0;
    currentChromeStartedAt = Date.now();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number(ui.speed.value) || 1;
    const voice = chooseChromeVoice();
    if (voice) utterance.voice = voice;
    currentChromeUtterance = utterance;

    setTtsControlMode(ui, "local");
    ui.controls.hidden = true;
    ui.playPause.disabled = true;
    ui.seek.disabled = true;
    btn.title = reason || "Using Chrome's built-in speech. Click Stop to end playback, then Read aloud to restart.";

    utterance.onstart = () => {
      btn.textContent = "Stop";
      btn.classList.remove("loading");
      btn.classList.add("speaking");
      currentChromeStartedAt = Date.now();
      updateChromeTtsControls();
    };
    utterance.onend = () => {
      btn.classList.remove("speaking");
      resetSpeakButton(btn);
      btn.title = "Read aloud";
      if (currentChromeTimer) {
        clearInterval(currentChromeTimer);
        currentChromeTimer = null;
      }
    };
    utterance.onerror = (event) => {
      if (stoppedChromeUtterances.has(utterance) || event.error === "canceled" || event.error === "interrupted") {
        btn.classList.remove("speaking");
        resetSpeakButton(btn);
        btn.title = "Read aloud";
        if (currentChromeTimer) {
          clearInterval(currentChromeTimer);
          currentChromeTimer = null;
        }
        return;
      }
      btn.classList.remove("speaking");
      ui.controls.hidden = false;
      setTtsStatus(ui, "Chrome speech playback failed.", "error");
      resetSpeakButton(btn);
      if (currentChromeTimer) {
        clearInterval(currentChromeTimer);
        currentChromeTimer = null;
      }
    };

    currentChromeTimer = setInterval(updateChromeTtsControls, 500);
    speechSynthesis.speak(utterance);
  }

  function resetTtsControls(ui, hide) {
    if (!ui) return;
    ui.playPause.textContent = "Play";
    ui.playPause.disabled = true;
    ui.retry.hidden = true;
    ui.seek.value = "0";
    ui.seek.max = "0";
    ui.seek.disabled = true;
    ui.time.textContent = "0:00 / 0:00";
    ui.status.textContent = "";
    ui.status.className = "tts-status";
    setTtsControlMode(ui, ui.provider.value);
    if (hide) ui.controls.hidden = true;
  }

  function syncTtsControls(audio, ui) {
    setTtsControlMode(ui, "gemini");
    const duration = currentTtsSeekMode === "chunks"
      ? generatedAudioDuration()
      : (Number.isFinite(audio.duration) ? audio.duration : 0);
    const current = currentTtsSeekMode === "chunks"
      ? chunkStartTime(currentTtsPlayingChunk) + (audio.currentTime || 0)
      : (audio.currentTime || 0);
    ui.seek.max = String(duration || 0);
    ui.seek.value = String(current || 0);
    ui.seek.disabled = !duration;
    ui.time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
    ui.playPause.textContent = audio.paused ? "Play" : "Pause";
  }

  function switchTtsProvider(ui) {
    if (!ui || currentTtsUi !== ui) {
      setTtsControlMode(ui, ui.provider.value);
      return;
    }

    if (currentTtsMode === "chrome") {
      stopChromeTts();
      resetSpeakButton(currentTtsButton);
    } else if (currentTtsAudio) {
      currentTtsAudio.pause();
      resetSpeakButton(currentTtsButton);
    }

    setTtsControlMode(ui, ui.provider.value);
    if (ui.provider.value === "local") {
      ui.controls.hidden = true;
      ui.retry.hidden = !currentTtsJobId;
      resetSpeakButton(currentTtsButton);
    } else if (currentTtsAudio) {
      ui.controls.hidden = false;
      ui.playPause.disabled = false;
      syncTtsControls(currentTtsAudio, ui);
      setTtsStatus(ui, "Gemini TTS selected.");
    } else {
      resetTtsControls(ui, true);
    }
  }

  function stopGeminiTts(hideControls) {
    stopChromeTts();
    if (currentTtsPollTimer) {
      clearTimeout(currentTtsPollTimer);
      currentTtsPollTimer = null;
    }
    if (currentTtsAbort) {
      currentTtsAbort.abort();
      currentTtsAbort = null;
    }
    if (currentTtsJobId) {
      fetch(`${SERVER_URL}/tts-job/${currentTtsJobId}`, { method: "DELETE" }).catch(() => {});
      if (currentTtsKind) clearSavedTtsJob(currentTtsKind);
      currentTtsJobId = null;
    }
    if (currentTtsAudio) {
      currentTtsAudio.pause();
      currentTtsAudio.currentTime = 0;
      currentTtsAudio = null;
    }
    revokeTtsUrls();
    currentTtsChunkDurations = [];
    currentTtsPlayingChunk = 0;
    currentTtsSeekMode = "final";
    resetSpeakButton(currentTtsButton);
    resetTtsControls(currentTtsUi, hideControls);
    currentTtsButton = null;
    currentTtsUi = null;
    currentTtsKind = null;
    currentTtsMode = "gemini";
  }

  async function playCurrentTts() {
    if (currentTtsMode === "chrome") {
      if (speechSynthesis.paused) {
        currentChromeStartedAt = Date.now();
        speechSynthesis.resume();
        currentTtsButton?.classList.add("speaking");
        if (currentTtsButton) currentTtsButton.textContent = "Stop";
        updateChromeTtsControls();
      }
      return;
    }
    if (!currentTtsAudio || !currentTtsUi) return;
    try {
      currentTtsAudio.playbackRate = Number(currentTtsUi.speed.value) || 1;
      await currentTtsAudio.play();
      currentTtsButton?.classList.add("speaking");
      syncTtsControls(currentTtsAudio, currentTtsUi);
    } catch (e) {
      setTtsStatus(currentTtsUi, e.message || "Could not play generated speech.", "error");
    }
  }

  async function playTtsChunk(index, btn, ui, autoplay) {
    const url = currentTtsChunkUrls[index];
    if (!url) return false;

    if (currentTtsAudio) {
      currentTtsAudio.pause();
      currentTtsAudio = null;
    }

    currentTtsSeekMode = "chunks";
    currentTtsPlayingChunk = index;
    const audio = new Audio(url);
    audio.playbackRate = Number(ui.speed.value) || 1;
    currentTtsAudio = audio;

    audio.onloadedmetadata = () => syncTtsControls(audio, ui);
    audio.ontimeupdate = () => syncTtsControls(audio, ui);
    audio.onplay = () => {
      btn.classList.add("speaking");
      btn.textContent = "Pause";
      syncTtsControls(audio, ui);
    };
    audio.onpause = () => {
      btn.classList.remove("speaking");
      btn.textContent = "Resume";
      syncTtsControls(audio, ui);
    };
    audio.onended = async () => {
      btn.classList.remove("speaking");
      btn.textContent = "Read aloud";
      const nextIndex = index + 1;
      if (currentTtsChunkUrls[nextIndex]) {
        await playTtsChunk(nextIndex, btn, ui, true);
      } else if (currentTtsJobId) {
        setTtsStatus(ui, "Waiting for the next speech chunk...");
      } else {
        syncTtsControls(audio, ui);
      }
    };
    audio.onerror = () => setTtsStatus(ui, "Could not play generated speech chunk.", "error");

    if (autoplay) await playCurrentTts();
    else syncTtsControls(audio, ui);
    return true;
  }

  async function loadTtsChunk(jobId, index, btn, ui, autoplayFirstChunk) {
    if (currentTtsChunkUrls[index - 1]) return;
    const resp = await fetch(`${SERVER_URL}/tts-job/${jobId}/chunk/${index}/audio`);
    if (!resp.ok) return;
    const blob = await resp.blob();
    currentTtsChunkUrls[index - 1] = URL.createObjectURL(blob);

    if (!currentTtsAudio && autoplayFirstChunk && index === 1) {
      await playTtsChunk(0, btn, ui, true);
    } else if (currentTtsSeekMode === "chunks" && currentTtsAudio) {
      syncTtsControls(currentTtsAudio, ui);
    }
  }

  async function loadCompletedTtsAudio(job, btn, ui, autoplay = true) {
    const resumeTime = currentTtsAudio && currentTtsSeekMode === "chunks"
      ? chunkStartTime(currentTtsPlayingChunk) + (currentTtsAudio.currentTime || 0)
      : 0;
    const shouldKeepPlaying = currentTtsAudio && !currentTtsAudio.paused;

    const audioResp = await fetch(`${SERVER_URL}/tts-job/${job.jobId}/audio`);
    if (!audioResp.ok) {
      const data = await audioResp.json().catch(() => ({}));
      throw new Error(data.error || "TTS audio was not ready.");
    }

    const audioBlob = await audioResp.blob();
    stopChromeTts();
    if (currentTtsAudio) currentTtsAudio.pause();
    revokeTtsUrls();
    currentTtsObjectUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(currentTtsObjectUrl);
    audio.playbackRate = Number(ui.speed.value) || 1;
    currentTtsAudio = audio;
    currentTtsJobId = null;
    currentTtsAbort = null;
    currentTtsSeekMode = "final";
    currentTtsMode = "gemini";
    setTtsControlMode(ui, "gemini");
    btn.textContent = "Pause";
    btn.classList.remove("loading");

    ui.playPause.disabled = false;
    ui.seek.disabled = false;
    setTtsStatus(ui, job.truncated ? "Speech ready. Text was truncated to the configured TTS limit." : "Speech ready.");

    audio.onloadedmetadata = () => {
      if (resumeTime && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(resumeTime, audio.duration);
      }
      syncTtsControls(audio, ui);
    };
    audio.ontimeupdate = () => syncTtsControls(audio, ui);
    audio.onplay = () => {
      btn.classList.add("speaking");
      btn.textContent = "Pause";
      syncTtsControls(audio, ui);
    };
    audio.onpause = () => {
      btn.classList.remove("speaking");
      btn.textContent = "Resume";
      syncTtsControls(audio, ui);
    };
    audio.onended = () => {
      btn.classList.remove("speaking");
      btn.textContent = "Read aloud";
      syncTtsControls(audio, ui);
    };
    audio.onerror = () => setTtsStatus(ui, "Could not play generated speech.", "error");

    if (autoplay && (shouldKeepPlaying || !resumeTime)) await playCurrentTts();
  }

  async function pollTtsJob(jobId, btn, ui) {
    try {
      const resp = await fetch(`${SERVER_URL}/tts-job/${jobId}`);
      const job = await resp.json();
      if (!resp.ok) throw new Error(job.error || "TTS job failed");
      if (currentTtsJobId !== jobId) return;

      setTtsStatus(ui, ttsJobMessage(job), job.status === "error" ? "error" : "");
      currentTtsChunkDurations = (job.chunkTimings || [])
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((timing) => timing.audioSeconds || 0);
      for (const chunkIndex of job.chunkAudioReady || []) {
        await loadTtsChunk(jobId, chunkIndex, btn, ui, true);
      }

      if (job.status === "done") {
        currentTtsPollTimer = null;
        await loadCompletedTtsAudio(job, btn, ui);
        return;
      }

      if (job.status === "error") {
        btn.textContent = "Retry failed";
        btn.classList.remove("loading");
        ui.retry.hidden = false;
        currentTtsJobId = jobId;
        currentTtsAbort = null;
        if (job.error?.type === "rate_limited") {
          ui.retry.hidden = false;
          btn.title = "Gemini TTS is rate limited. Retry manually later or switch Engine to Local browser.";
          setTtsStatus(ui, `${job.error.message} Retry manually later, or switch Engine to Local browser and click Read aloud.`, "error");
        }
        if (currentTtsMode !== "chrome") setTimeout(() => resetSpeakButton(btn), 1500);
        return;
      }

      if (job.status === "cancelled") {
        resetTtsControls(ui, true);
        resetSpeakButton(btn);
        currentTtsJobId = null;
        currentTtsAbort = null;
        currentTtsButton = null;
        currentTtsUi = null;
        return;
      }

      currentTtsPollTimer = setTimeout(() => pollTtsJob(jobId, btn, ui), 1000);
    } catch (e) {
      btn.textContent = "Retry failed";
      btn.classList.remove("loading");
      setTtsStatus(ui, e.message || "Could not check TTS progress.", "error");
      currentTtsJobId = null;
      currentTtsAbort = null;
      currentTtsButton = null;
      currentTtsUi = null;
      setTimeout(() => resetSpeakButton(btn), 1500);
    }
  }

  async function toggleSpeak(btn, textEl) {
    const ui = getTtsUi(btn);
    const kind = getTtsKind(btn);
    const text = textEl.textContent;
    if (!text) return;

    if (currentTtsMode === "chrome" && currentTtsButton === btn && ui.provider.value === "local") {
      if (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused) {
        stopChromeTts();
        resetSpeakButton(btn);
        btn.title = "Read aloud";
      } else {
        startChromeTts(text, btn, ui, "Using Chrome's built-in speech. Click Stop to end playback, then Read aloud to restart.");
      }
      return;
    }

    if (ui.provider.value === "local") {
      if (currentTtsAbort || currentTtsPollTimer) {
        stopGeminiTts(false);
      } else {
        stopChromeTts();
        revokeTtsUrls();
        if (currentTtsAudio) {
          currentTtsAudio.pause();
          currentTtsAudio = null;
        }
      }
      currentTtsButton = btn;
      currentTtsUi = ui;
      currentTtsKind = kind;
      resetTtsControls(ui, false);
      startChromeTts(text, btn, ui, "Using Chrome's built-in speech. Click Stop to end playback, then Read aloud to restart.");
      if (currentTtsJobId) ui.retry.hidden = false;
      return;
    }

    if (currentTtsButton === btn && (currentTtsAbort || currentTtsJobId)) {
      stopGeminiTts(true);
      return;
    }

    if (currentTtsAudio && currentTtsButton === btn) {
      if (currentTtsAudio.paused) {
        await playCurrentTts();
      } else {
        currentTtsAudio.pause();
        btn.classList.remove("speaking");
        btn.textContent = "Resume";
        syncTtsControls(currentTtsAudio, getTtsUi(btn));
      }
      return;
    }

    stopGeminiTts(true);
    btn.textContent = "Generating...";
    btn.classList.add("loading");
    currentTtsButton = btn;
    currentTtsUi = ui;
    currentTtsKind = kind;
    currentTtsAbort = new AbortController();
    currentTtsChunkDurations = [];
    currentTtsPlayingChunk = 0;
    currentTtsSeekMode = "final";
    revokeTtsUrls();
    resetTtsControls(ui, false);
    setTtsStatus(ui, "Generating speech with Gemini TTS... click the speaker again to cancel.");

    try {
      const resp = await fetch(`${SERVER_URL}/tts-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: currentTtsAbort.signal,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Gemini TTS failed");
      }
      currentTtsAbort = null;
      currentTtsJobId = data.jobId;
      saveTtsJob(kind, data.jobId);
      setTtsStatus(ui, ttsJobMessage(data));
      currentTtsPollTimer = setTimeout(() => pollTtsJob(data.jobId, btn, ui), 500);
    } catch (e) {
      if (e.name === "AbortError") {
        resetTtsControls(ui, true);
        resetSpeakButton(btn);
      } else {
        btn.title = e.message || "Gemini TTS failed";
        btn.textContent = "Retry failed";
        setTtsStatus(ui, e.message || "Gemini TTS failed.", "error");
        setTimeout(() => resetSpeakButton(btn), 1500);
      }
      currentTtsAbort = null;
      currentTtsButton = null;
      currentTtsUi = null;
    }
  }

  function updateSpeakBtnVisibility(btn, textEl) {
    const hidden = textEl.hidden || !textEl.textContent ||
      textEl.classList.contains("loading") || textEl.classList.contains("error");
    const ui = getTtsUi(btn);
    btn.hidden = hidden;
    ui.toolbar.hidden = hidden;
  }

  speakBtn.addEventListener("click", () => toggleSpeak(speakBtn, outputBox));
  vaSpeakBtn.addEventListener("click", () => toggleSpeak(vaSpeakBtn, vaOutputBox));

  const origShowOutput = showOutput;
  showOutput = function (text, className, persist, usage) {
    stopGeminiTts(true);
    origShowOutput(text, className, persist, usage);
    updateSpeakBtnVisibility(speakBtn, outputBox);
  };

  function bindTtsControls(ui) {
    ui.playPause.addEventListener("click", () => {
      if (currentTtsMode === "chrome" && currentTtsUi === ui) {
        if (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused) {
          stopChromeTts();
          resetSpeakButton(currentTtsButton);
        }
        return;
      }
      if (!currentTtsAudio || currentTtsUi !== ui) return;
      if (currentTtsAudio.paused) {
        playCurrentTts();
      } else {
        currentTtsAudio.pause();
      }
    });

    ui.seek.addEventListener("input", () => {
      if (!currentTtsAudio || currentTtsUi !== ui) return;
      const target = Number(ui.seek.value) || 0;
      if (currentTtsSeekMode === "chunks") {
        let offset = 0;
        for (let i = 0; i < currentTtsChunkUrls.length; i++) {
          const duration = currentTtsChunkDurations[i] || 0;
          if (!currentTtsChunkUrls[i]) break;
          if (target <= offset + duration || i === currentTtsChunkUrls.length - 1) {
            const wasPlaying = !currentTtsAudio.paused;
            playTtsChunk(i, currentTtsButton, ui, false).then(() => {
              if (currentTtsAudio) {
                currentTtsAudio.currentTime = Math.max(0, target - offset);
                if (wasPlaying) playCurrentTts();
                else syncTtsControls(currentTtsAudio, ui);
              }
            });
            return;
          }
          offset += duration;
        }
      } else {
        currentTtsAudio.currentTime = target;
      }
      syncTtsControls(currentTtsAudio, ui);
    });

    ui.speed.addEventListener("change", () => {
      if (currentTtsMode === "chrome" && currentTtsUi === ui && currentChromeText) {
        const text = currentChromeText;
        const btn = currentTtsButton;
        stopChromeTts();
        if (btn) startChromeTts(text, btn, ui, "Restarted Chrome speech at the new speed. Click Stop to end playback.");
        return;
      }
      if (!currentTtsAudio || currentTtsUi !== ui) return;
      currentTtsAudio.playbackRate = Number(ui.speed.value) || 1;
    });

    ui.provider.addEventListener("change", () => {
      switchTtsProvider(ui);
    });

    ui.retry.addEventListener("click", async () => {
      if (!currentTtsJobId || currentTtsUi !== ui || !currentTtsButton) return;
      try {
        stopChromeTts();
        currentTtsMode = "gemini";
        ui.retry.hidden = true;
        currentTtsButton.textContent = "Generating...";
        currentTtsButton.classList.add("loading");
        setTtsStatus(ui, "Retrying failed speech job...");
        const resp = await fetch(`${SERVER_URL}/tts-job/${currentTtsJobId}/retry`, { method: "POST" });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Could not retry TTS job");
        setTtsStatus(ui, ttsJobMessage(data));
        currentTtsPollTimer = setTimeout(() => pollTtsJob(currentTtsJobId, currentTtsButton, ui), 500);
      } catch (e) {
        setTtsStatus(ui, e.message || "Could not retry TTS job.", "error");
        ui.retry.hidden = false;
      }
    });
  }

  bindTtsControls(getTtsUi(speakBtn));
  bindTtsControls(getTtsUi(vaSpeakBtn));

  async function restoreTtsJob(kind) {
    const key = ttsJobStorageKey(kind);
    if (!key) return;
    chrome.storage.local.get(key, async (result) => {
      const saved = result[key];
      if (!saved || !saved.jobId) return;

      const btn = getTtsButton(kind);
      const ui = getTtsUi(btn);
      try {
        const resp = await fetch(`${SERVER_URL}/tts-job/${saved.jobId}`);
        const job = await resp.json();
        if (!resp.ok) {
          clearSavedTtsJob(kind);
          return;
        }

        currentTtsJobId = job.jobId;
        currentTtsKind = kind;
        currentTtsButton = btn;
        currentTtsUi = ui;
        currentTtsChunkDurations = (job.chunkTimings || [])
          .sort((a, b) => a.chunkIndex - b.chunkIndex)
          .map((timing) => timing.audioSeconds || 0);
        btn.hidden = false;
        ui.toolbar.hidden = false;
        btn.textContent = job.status === "done" ? "Read aloud" : "Generating...";
        btn.classList.toggle("loading", job.status !== "done" && job.status !== "error");
        resetTtsControls(ui, false);
        setTtsStatus(ui, ttsJobMessage(job), job.status === "error" ? "error" : "");

        for (const chunkIndex of job.chunkAudioReady || []) {
          await loadTtsChunk(job.jobId, chunkIndex, btn, ui, false);
        }

        if (job.status === "done") {
          await loadCompletedTtsAudio(job, btn, ui, false);
        } else if (job.status === "error") {
          ui.retry.hidden = false;
        } else {
          currentTtsPollTimer = setTimeout(() => pollTtsJob(job.jobId, btn, ui), 500);
        }
      } catch (e) {
        clearSavedTtsJob(kind);
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
          if (data.totalFormatted && segmentsTotalEl) {
            segmentsTotalEl.hidden = false;
            segmentsTotalEl.className = "segments-total";
            const count = data.extensionInput.split(",").filter((p) => p.trim()).length;
            segmentsTotalEl.textContent = `Total: ${data.totalFormatted} (${count} segment${count === 1 ? "" : "s"})`;
          } else {
            updateSegmentsTotal();
          }
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
      stopGeminiTts(true);
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
    currentIsShortsPage = resp.isShorts === true;
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
      updateSegmentsTotal();
    });

    restoreOutput();
    restoreVaOutput();
    restoreTtsJob("transcript");
    restoreTtsJob("visual");
    restoreJobs();
    restoreShortsSettings();
  }

  segmentsInput.addEventListener("input", () => updateSegmentsTotal());

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

  shortsToggle.addEventListener("change", () => {
    chrome.storage.local.set({ [SHORTS_AUTO_SCROLL_KEY]: shortsToggle.checked });
  });

  // --- Shortcuts tab ---

  function applyShortcutsSettingsToUi(settings) {
    const defs = self.VSC_SHORTCUTS;
    const norm = defs ? defs.normalizeSettings(settings) : (settings || {});
    shortcutsEnabledToggle.checked = norm.enabled !== false;
    shortcutsIgnoreInputsToggle.checked = norm.ignoreInInputs !== false;
    shortcutsOverlayToggle.checked = norm.showSpeedOverlay !== false;
    const count = Array.isArray(norm.bindings) ? norm.bindings.length : 0;
    if (count === 0) {
      shortcutsSummary.textContent = "No shortcuts configured yet.";
    } else {
      shortcutsSummary.textContent = `${count} shortcut${count === 1 ? "" : "s"} configured.`;
    }
  }

  function loadShortcutsSettings() {
    chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (result) => {
      applyShortcutsSettingsToUi(result[SHORTCUTS_STORAGE_KEY]);
    });
  }

  function updateShortcutsSetting(patch) {
    chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (result) => {
      const defs = self.VSC_SHORTCUTS;
      const current = defs
        ? defs.normalizeSettings(result[SHORTCUTS_STORAGE_KEY])
        : Object.assign({}, result[SHORTCUTS_STORAGE_KEY] || {});
      const next = Object.assign({}, current, patch);
      chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: next });
    });
  }

  shortcutsEnabledToggle.addEventListener("change", () => {
    updateShortcutsSetting({ enabled: shortcutsEnabledToggle.checked });
  });

  shortcutsIgnoreInputsToggle.addEventListener("change", () => {
    updateShortcutsSetting({ ignoreInInputs: shortcutsIgnoreInputsToggle.checked });
  });

  shortcutsOverlayToggle.addEventListener("change", () => {
    updateShortcutsSetting({ showSpeedOverlay: shortcutsOverlayToggle.checked });
  });

  openShortcutsOptionsBtn.addEventListener("click", () => {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
    }
    window.close();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SHORTCUTS_STORAGE_KEY]) {
      applyShortcutsSettingsToUi(changes[SHORTCUTS_STORAGE_KEY].newValue);
    }
  });

  loadShortcutsSettings();

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
      updateSegmentsTotal();
      enabledToggle.checked = false;
      outputBox.hidden = true;
      outputBox.textContent = "";
      tokenUsageEl.hidden = true;
      vaOutputBox.hidden = true;
      vaOutputBox.textContent = "";
      vaTokenUsageEl.hidden = true;
      shortsToggle.checked = false;
      updateShortsUi();
      applyShortcutsSettingsToUi(null);
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
