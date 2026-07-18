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
  const chatSessionStatus = document.getElementById("chat-session-status");
  const chatClearBtn = document.getElementById("chat-clear-btn");
  const chatMessagesEl = document.getElementById("chat-messages");
  const chatContextToggle = document.getElementById("chat-context-toggle");
  const chatContextPanel = document.getElementById("chat-context-panel");
  const chatWindowLabel = document.getElementById("chat-window-label");
  const chatProgressEl = document.getElementById("chat-progress");
  const chatProgressFill = document.getElementById("chat-progress-fill");
  const chatProgressText = document.getElementById("chat-progress-text");
  const chatWarning = document.getElementById("chat-warning");
  const chatRangeMin = document.getElementById("chat-range-min");
  const chatRangeMax = document.getElementById("chat-range-max");
  const chatRangeFill = document.getElementById("chat-range-fill");
  const chatRangeStartLabel = document.getElementById("chat-range-start-label");
  const chatRangeEndLabel = document.getElementById("chat-range-end-label");
  const chatFullVideoBtn = document.getElementById("chat-full-video-btn");
  const chatVisualToggle = document.getElementById("chat-visual-toggle");
  const chatVisualOptions = document.getElementById("chat-visual-options");
  const chatIntervalSlider = document.getElementById("chat-interval");
  const chatIntervalLabel = document.getElementById("chat-interval-label");
  const chatDedupToggle = document.getElementById("chat-dedup-toggle");
  const chatSearchToggle = document.getElementById("chat-search-toggle");
  const chatSummaryBtns = document.querySelectorAll(".chat-summary-btn");
  const chatInput = document.getElementById("chat-input");
  const chatSendBtn = document.getElementById("chat-send-btn");
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
  const transcriptTtsUi = {
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
  const visualTtsUi = {
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
  // Per-message chat TTS UI objects are created on the fly by renderChat() and
  // attached as `item.__chatTtsUi`. We don't keep a single global handle for
  // chat — getTtsUi() returns the inline UI for the clicked message instead.
  const shortsToggle = document.getElementById("shorts-toggle");
  const shortsPageStatus = document.getElementById("shorts-page-status");
  const shortcutsEnabledToggle = document.getElementById("shortcuts-enabled-toggle");
  const shortcutsIgnoreInputsToggle = document.getElementById("shortcuts-ignore-inputs-toggle");
  const shortcutsOverlayToggle = document.getElementById("shortcuts-overlay-toggle");
  const shortcutsSummary = document.getElementById("shortcuts-summary");
  const keybindingsEnabledToggle = document.getElementById("keybindings-enabled-toggle");
  const keybindingsIgnoreInputsToggle = document.getElementById("keybindings-ignore-inputs-toggle");
  const keybindingsSummary = document.getElementById("keybindings-summary");
  const openShortcutsOptionsBtn = document.getElementById("open-shortcuts-options");
  const SHORTCUTS_STORAGE_KEY = (self.VSC_SHORTCUTS && self.VSC_SHORTCUTS.STORAGE_KEY) || "custom_shortcuts";
  const KEYBINDINGS_STORAGE_KEY = (self.VSC_KEYBINDINGS && self.VSC_KEYBINDINGS.STORAGE_KEY) || "custom_keybindings";

  let currentVideoId = null;
  let currentChatSession = null;
  let currentChatRequestId = null;
  let currentChatAssistantMessageId = null;
  let chatPending = false;
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
  let currentTtsMessageId = null;
  let currentTtsEventSource = null;
  let currentTtsChunkUrls = [];
  let currentTtsChunkDurations = [];
  let currentTtsPlayingChunk = 0;
  let currentTtsSeekMode = "final";
  let currentTtsWaitingForNextChunk = false;
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

  function updateChatSliderUI() {
    const min = Number(chatRangeMin.value);
    const max = Number(chatRangeMax.value);
    const total = Number(chatRangeMin.max) || 1;
    const pctLeft = (min / total) * 100;
    const pctRight = (max / total) * 100;
    chatRangeFill.style.left = pctLeft + "%";
    chatRangeFill.style.width = (pctRight - pctLeft) + "%";
    chatRangeStartLabel.value = formatSliderTime(min);
    chatRangeEndLabel.value = formatSliderTime(max);
    if (chatWindowLabel) {
      chatWindowLabel.textContent = `${formatSliderTime(min)} – ${formatSliderTime(max)}`;
    }
  }

  function initChatSlider(duration, currentTime) {
    const dur = Math.floor(duration) || 600;
    chatRangeMin.min = 0;
    chatRangeMin.max = dur;
    chatRangeMax.min = 0;
    chatRangeMax.max = dur;
    chatRangeMin.value = Math.max(0, Math.floor(currentTime) - 120);
    chatRangeMax.value = Math.min(dur, Math.floor(currentTime) + 120);
    updateChatSliderUI();
  }

  function chatApplyTimeInput(inputEl, isStart) {
    const seconds = parseTime(inputEl.value);
    if (isNaN(seconds) || seconds < 0) {
      updateChatSliderUI();
      return;
    }
    const dur = Number(chatRangeMin.max) || 600;
    const clamped = Math.max(0, Math.min(dur, Math.round(seconds)));
    if (isStart) {
      chatRangeMin.value = Math.min(clamped, Number(chatRangeMax.value) - 1);
    } else {
      chatRangeMax.value = Math.max(clamped, Number(chatRangeMin.value) + 1);
    }
    updateChatSliderUI();
  }

  chatRangeMin.addEventListener("input", () => {
    if (Number(chatRangeMin.value) >= Number(chatRangeMax.value)) {
      chatRangeMin.value = Number(chatRangeMax.value) - 1;
    }
    updateChatSliderUI();
  });

  chatRangeMax.addEventListener("input", () => {
    if (Number(chatRangeMax.value) <= Number(chatRangeMin.value)) {
      chatRangeMax.value = Number(chatRangeMin.value) + 1;
    }
    updateChatSliderUI();
  });

  chatFullVideoBtn.addEventListener("click", () => {
    chatRangeMin.value = 0;
    chatRangeMax.value = videoDuration || 600;
    updateChatSliderUI();
  });

  chatRangeStartLabel.addEventListener("change", () => chatApplyTimeInput(chatRangeStartLabel, true));
  chatRangeEndLabel.addEventListener("change", () => chatApplyTimeInput(chatRangeEndLabel, false));
  chatRangeStartLabel.addEventListener("keydown", (e) => { if (e.key === "Enter") chatRangeStartLabel.blur(); });
  chatRangeEndLabel.addEventListener("keydown", (e) => { if (e.key === "Enter") chatRangeEndLabel.blur(); });

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

  // --- Persistent chat helpers ---

  function chatStateKey(videoId) {
    return `chat_state_${videoId}`;
  }

  function chatPendingKey(videoId) {
    return `chat_pending_${videoId}`;
  }

  function chatJobKey(videoId, requestId) {
    return `job_${videoId}_${requestId}`;
  }

  function getChatWindowTimes() {
    return {
      startTime: Number(chatRangeMin.value),
      endTime: Number(chatRangeMax.value),
    };
  }

  function setChatStatus(text, opts) {
    const message = (text || "").trim();
    chatSessionStatus.textContent = message;
    chatSessionStatus.hidden = !message;
    chatSessionStatus.classList.toggle("error", !!(opts && opts.error));
  }

  function artifactUrl(artifact) {
    if (!artifact || !artifact.url) return null;
    return `${SERVER_URL}${artifact.url}`;
  }

  function chatContextChips(msg) {
    const context = msg.context || {};
    const chips = [];
    if (context.transcriptStart != null || context.transcriptEnd != null) {
      chips.push(`Transcript ${formatSliderTime(context.transcriptStart || 0)}-${formatSliderTime(context.transcriptEnd || 0)}`);
    }
    if (context.usedVisual) {
      const count = context.frameCount ? ` (${context.frameCount} frames)` : "";
      chips.push(`Visual${count}`);
    }
    if (context.webSearch) chips.push("Web search");
    if (msg.usage && (msg.usage.input_tokens || msg.usage.output_tokens)) {
      chips.push(`In ${formatTokenCount(msg.usage.input_tokens || 0)} / Out ${formatTokenCount(msg.usage.output_tokens || 0)}`);
    }
    return chips;
  }

  // messageId -> rendered DOM node. Lets renderChat() patch existing items in
  // place instead of blowing the whole message list away on every update, so
  // per-message TTS UI state (bound listeners, transport controls, progress
  // bar) survives status transitions and text edits.
  const chatMessageItems = new Map();

  function ensureChatEmptyState(show) {
    let empty = chatMessagesEl.querySelector(":scope > .chat-empty");
    if (show) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "chat-empty";
        const title = document.createElement("div");
        title.className = "chat-empty-title";
        title.textContent = "Chat with this video";
        const hint = document.createElement("div");
        hint.className = "chat-empty-hint";
        hint.textContent = "Ask a question, get a summary of a window, or attach visual frames.";
        empty.appendChild(title);
        empty.appendChild(hint);
        chatMessagesEl.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function bubbleTextFor(msg) {
    const status = msg.status || "done";
    if (status === "pending") return msg.text || "Thinking...";
    if (status === "error") return msg.error || msg.text || "Something went wrong.";
    return msg.text || "";
  }

  function updateChatMessageItem(item, msg) {
    const role = msg.role || "assistant";
    const status = msg.status || "done";
    const nextClass = `chat-message ${role} ${status === "error" ? "error" : ""}`.trim();
    if (item.dataset.messageClass !== nextClass) {
      const playing = item.classList.contains("playing");
      item.className = nextClass + (playing ? " playing" : "");
      item.dataset.messageClass = nextClass;
    }
    if (item.dataset.messageId !== (msg.id || "")) {
      item.dataset.messageId = msg.id || "";
    }

    let bubble = item.querySelector(":scope > .chat-bubble");
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      item.appendChild(bubble);
    }
    const bubbleText = bubbleTextFor(msg);
    if (bubble.textContent !== bubbleText) bubble.textContent = bubbleText;

    const chips = chatContextChips(msg);
    let meta = item.querySelector(":scope > .chat-meta");
    if (chips.length) {
      if (!meta) {
        meta = document.createElement("div");
        meta.className = "chat-meta";
        bubble.after(meta);
      }
      const serialised = chips.join("\u0001");
      if (meta.dataset.chips !== serialised) {
        meta.dataset.chips = serialised;
        meta.innerHTML = "";
        for (const chipText of chips) {
          const chip = document.createElement("span");
          chip.className = "chat-chip";
          chip.textContent = chipText;
          meta.appendChild(chip);
        }
      }
    } else if (meta) {
      meta.remove();
    }

    const artifacts = (msg.artifacts || []).filter((a) => a.type === "collage" && a.url);
    let artifactWrap = item.querySelector(":scope > .chat-artifacts");
    if (artifacts.length) {
      if (!artifactWrap) {
        artifactWrap = document.createElement("div");
        artifactWrap.className = "chat-artifacts";
        (meta || bubble).after(artifactWrap);
      }
      const serialised = artifacts.map((a) => `${a.url}|${a.frameCount || 0}`).join("\u0001");
      if (artifactWrap.dataset.artifacts !== serialised) {
        artifactWrap.dataset.artifacts = serialised;
        artifactWrap.innerHTML = "";
        for (const artifact of artifacts) {
          const img = document.createElement("img");
          img.src = artifactUrl(artifact);
          img.alt = "Persisted visual collage";
          img.title = `${artifact.frameCount || 0} frames`;
          artifactWrap.appendChild(img);
        }
      }
    } else if (artifactWrap) {
      artifactWrap.remove();
    }

    const hasTts = role === "assistant" && status !== "pending" && status !== "error" && !!msg.text;
    const existingTts = item.querySelector(":scope > .chat-message-tts");
    if (hasTts) {
      if (!existingTts) {
        renderChatMessageTts(item, msg);
      } else if (msg.audio && item.__chatTtsUi && currentTtsMessageId !== msg.id) {
        // Avoid overwriting the live TTS button/state for the message the user
        // is actively listening to; the client-side TTS handlers own that UI
        // while generation/playback is in progress.
        hydrateChatMessageAudio(item.__chatTtsUi, msg.audio);
      }
    } else if (existingTts) {
      existingTts.remove();
      delete item.__chatTtsUi;
    }
  }

  function createChatMessageItem(msg) {
    const item = document.createElement("div");
    item.dataset.messageId = msg.id || "";
    updateChatMessageItem(item, msg);
    return item;
  }

  function renderChat() {
    const messages = (currentChatSession && currentChatSession.messages) || [];
    if (messages.length === 0) {
      for (const el of chatMessageItems.values()) el.remove();
      chatMessageItems.clear();
      ensureChatEmptyState(true);
      return;
    }

    ensureChatEmptyState(false);

    const incomingIds = new Set();
    let previousEl = null;
    for (const msg of messages) {
      const id = msg.id;
      if (!id) continue;
      incomingIds.add(id);
      let item = chatMessageItems.get(id);
      if (!item) {
        item = createChatMessageItem(msg);
        chatMessageItems.set(id, item);
      } else {
        updateChatMessageItem(item, msg);
      }
      const expectedNext = previousEl ? previousEl.nextSibling : chatMessagesEl.firstChild;
      if (item !== expectedNext) {
        chatMessagesEl.insertBefore(item, expectedNext);
      }
      previousEl = item;
    }

    for (const [id, el] of chatMessageItems) {
      if (!incomingIds.has(id)) {
        el.remove();
        chatMessageItems.delete(id);
      }
    }

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    if (currentTtsMessageId) {
      const newItem = chatMessageItems.get(currentTtsMessageId);
      if (newItem && newItem.__chatTtsUi) {
        const newUi = newItem.__chatTtsUi;
        currentTtsUi = newUi;
        currentTtsButton = newUi.btn;
        markPlayingBubble(currentTtsMessageId);
        if (currentTtsAudio) syncTtsPlaybackUi(currentTtsAudio, newUi, newUi.btn);
      }
    }
  }

  const LISTEN_BTN_INNER_HTML =
    '<svg class="chat-tts-icon chat-tts-icon-play" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M3 6v4h2.5L9 12.5v-9L5.5 6H3zM11 5.2c1.2.7 2 2 2 2.8s-.8 2.1-2 2.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
    '<svg class="chat-tts-icon chat-tts-icon-stop" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>' +
    '</svg>' +
    '<svg class="chat-tts-icon chat-tts-icon-loading" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>' +
    '<span class="chat-tts-label">Listen</span>';

  function renderChatMessageTts(item, msg) {
    const wrap = document.createElement("div");
    wrap.className = "chat-message-tts";

    const row = document.createElement("div");
    row.className = "chat-message-tts-row";

    const btn = document.createElement("button");
    btn.className = "chat-tts-btn";
    btn.type = "button";
    btn.title = "Read this assistant message aloud";
    btn.dataset.state = "idle";
    btn.innerHTML = LISTEN_BTN_INNER_HTML;

    const engine = document.createElement("select");
    engine.className = "chat-tts-engine";
    engine.innerHTML = '<option value="gemini">Gemini TTS</option><option value="qwen_mlx">Qwen Local TTS</option><option value="local">Local browser</option>';

    row.appendChild(btn);
    row.appendChild(engine);
    wrap.appendChild(row);

    const transport = document.createElement("div");
    transport.className = "chat-tts-transport";
    transport.hidden = true;

    const playPauseBtn = document.createElement("button");
    playPauseBtn.type = "button";
    playPauseBtn.className = "chat-tts-icon-btn chat-tts-play-pause";
    playPauseBtn.disabled = true;
    playPauseBtn.title = "Play / Pause";
    playPauseBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" fill="currentColor"/></svg>';

    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "chat-tts-seek";
    seek.min = "0";
    seek.max = "0";
    seek.step = "0.1";
    seek.value = "0";
    seek.disabled = true;

    const time = document.createElement("span");
    time.className = "chat-tts-time";
    time.textContent = "0:00 / 0:00";

    const speed = document.createElement("select");
    speed.className = "chat-tts-speed";
    speed.innerHTML = [0.75, 1, 1.25, 1.5, 2]
      .map((v) => `<option value="${v}"${v === 1 ? " selected" : ""}>${v}x</option>`).join("");

    transport.appendChild(playPauseBtn);
    transport.appendChild(seek);
    transport.appendChild(time);
    transport.appendChild(speed);
    wrap.appendChild(transport);

    const progress = document.createElement("div");
    progress.className = "chat-tts-progress";
    progress.hidden = true;
    const progressBar = document.createElement("div");
    progressBar.className = "chat-tts-progress-bar";
    const progressFill = document.createElement("div");
    progressFill.className = "chat-tts-progress-fill";
    progressBar.appendChild(progressFill);
    const progressText = document.createElement("span");
    progressText.className = "chat-tts-progress-text";
    progress.appendChild(progressBar);
    progress.appendChild(progressText);
    wrap.appendChild(progress);

    const status = document.createElement("div");
    status.className = "chat-tts-status";
    status.hidden = true;
    wrap.appendChild(status);

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "chat-tts-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.hidden = true;
    wrap.appendChild(retryBtn);
    item.appendChild(wrap);

    const inlineUi = {
      btn,
      engine,
      transport,
      playPause: playPauseBtn,
      seek,
      time,
      speed,
      provider: engine,
      controls: transport,
      status,
      retry: retryBtn,
      progress,
      progressFill,
      progressText,
      bubble: item.querySelector(".chat-bubble"),
      messageId: msg.id,
      toolbar: { hidden: false },
    };
    item.__chatTtsUi = inlineUi;

    btn.addEventListener("click", () => toggleSpeak(btn, inlineUi.bubble));
    engine.addEventListener("change", () => {
      if (currentTtsButton === btn) {
        switchTtsProvider(inlineUi);
      }
    });

    bindTtsControls(inlineUi);

    if (msg.audio) {
      hydrateChatMessageAudio(inlineUi, msg.audio);
    }
  }

  function hydrateChatMessageAudio(ui, audio) {
    if (!audio) return;
    if (audio.status === "queued" || audio.status === "running" || audio.status === "rate_limited") {
      ui.btn.dataset.state = "loading";
      const span = ui.btn.querySelector(".chat-tts-label");
      if (span) span.textContent = "Generating...";
      ui.btn.classList.add("speaking");
      const total = audio.chunksTotal || 0;
      const done = audio.chunksDone || 0;
      if (total) {
        ui.progress.hidden = false;
        ui.progressFill.style.width = `${Math.round((done / total) * 100)}%`;
        ui.progressText.textContent = audio.status === "rate_limited"
          ? `Rate limited at ${done}/${total}`
          : `Generating ${done}/${total} chunks`;
      } else {
        ui.status.hidden = false;
        ui.status.textContent = "Generating speech...";
      }
    } else if (audio.status === "error") {
      ui.btn.dataset.state = "error";
      const span = ui.btn.querySelector(".chat-tts-label");
      if (span) span.textContent = "Retry";
      ui.status.hidden = false;
      ui.status.className = "chat-tts-status error";
      ui.status.textContent = audio.error || "Speech failed.";
    }
  }


  async function loadChatSession(preferCache = true) {
    if (!currentVideoId) return;
    if (preferCache) {
      chrome.storage.local.get(chatStateKey(currentVideoId), (result) => {
        const cached = result[chatStateKey(currentVideoId)];
        if (cached && cached.session) {
          currentChatSession = cached.session;
          renderChat();
        }
      });
    }

    setChatStatus("");
    try {
      const resp = await fetch(`${SERVER_URL}/chat-session?videoId=${encodeURIComponent(currentVideoId)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not load chat session.");
      currentChatSession = data.session;
      chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session: currentChatSession, savedAt: Date.now() } });
      setChatStatus("");
      renderChat();
    } catch (e) {
      setChatStatus(e.message || "Could not reach local server.", { error: true });
    }
  }

  function setChatPending(isPending, label) {
    chatPending = isPending;
    chatSendBtn.disabled = isPending;
    chatSummaryBtns.forEach((btn) => (btn.disabled = isPending));
    chatClearBtn.disabled = isPending;
    if (!isPending) {
      chatProgressEl.hidden = true;
      chatWarning.hidden = true;
      chatProgressFill.style.width = "0%";
      chatProgressText.textContent = "";
      return;
    }
    chatProgressEl.hidden = false;
    chatProgressText.textContent = label || "Working...";
  }

  function appendLocalChatMessage(msg) {
    if (!currentChatSession) {
      currentChatSession = {
        videoId: currentVideoId,
        sessionId: null,
        title: currentVideoId,
        messages: [],
      };
    }
    currentChatSession.messages.push(msg);
    chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session: currentChatSession, savedAt: Date.now() } });
    renderChat();
  }

  function updateLocalChatMessage(id, patch) {
    if (!currentChatSession || !id) return;
    const msg = currentChatSession.messages.find((m) => m.id === id);
    if (msg) Object.assign(msg, patch);
    chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session: currentChatSession, savedAt: Date.now() } });
    renderChat();
  }

  async function captureChatFrames(startTime, endTime, interval) {
    const totalFrames = Math.floor((endTime - startTime) / interval) + 1;
    if (totalFrames > 300) {
      throw new Error("Window too large. Reduce the time range or increase the interval.");
    }
    chatWarning.hidden = false;
    chatProgressEl.hidden = false;
    chatProgressText.textContent = `Preparing capture (${totalFrames} frames)...`;
    chatProgressFill.style.width = "0%";

    const prepResp = await sendToContent({ type: "prepare-capture" });
    if (!prepResp || !prepResp.ok) {
      throw new Error(prepResp?.error || "Could not access the video player.");
    }

    const frames = [];
    try {
      for (let i = 0; i < totalFrames; i++) {
        const t = startTime + i * interval;
        if (t > endTime) break;
        chatProgressText.textContent = `Capturing frame ${i + 1} / ${totalFrames} (${formatSliderTime(t)})...`;
        chatProgressFill.style.width = ((i + 1) / totalFrames * 70) + "%";
        const seekResp = await sendToContent({ type: "seek-to", time: t });
        if (!seekResp || !seekResp.ok) {
          throw new Error("Seek failed at " + formatSliderTime(t));
        }
        await new Promise((r) => setTimeout(r, 400));
        const dataUrl = await captureVisibleTab();
        frames.push({ timestamp: t, dataUrl });
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      await sendToContent({
        type: "finish-capture",
        restoreTime: prepResp.savedTime,
        wasPlaying: !prepResp.wasPaused,
      }).catch(() => {});
      chatWarning.hidden = true;
    }
    if (frames.length === 0) throw new Error("No frames were captured.");
    return { frames, videoRect: prepResp.rect };
  }

  async function sendChatTurn(options = {}) {
    if (!currentVideoId || chatPending) return;
    const mode = options.mode || (chatVisualToggle.checked ? "visual" : "text");
    let question = (options.question || chatInput.value || "").trim();
    if (!question && mode === "visual") {
      question = "Analyze the visual content in this selected window.";
    }
    if (!question && mode !== "summary") return;

    const win = getChatWindowTimes();
    const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const userId = `${requestId}_user`;
    const assistantId = `${requestId}_assistant`;
    const context = {
      transcriptStart: win.startTime,
      transcriptEnd: win.endTime,
      visualStart: win.startTime,
      visualEnd: win.endTime,
      usedVisual: mode === "visual",
      webSearch: chatSearchToggle.checked,
    };

    appendLocalChatMessage({
      id: userId,
      role: "user",
      kind: mode,
      text: question || SUMMARY_CHAT_LABELS[options.summaryType] || "Summarize this window.",
      createdAt: Date.now() / 1000,
      status: "done",
      context,
      artifacts: [],
    });
    appendLocalChatMessage({
      id: assistantId,
      role: "assistant",
      kind: mode,
      text: mode === "visual" ? "Capturing visual frames..." : "Thinking...",
      createdAt: Date.now() / 1000,
      status: "pending",
      context,
      artifacts: [],
    });

    setChatPending(true, mode === "visual" ? "Capturing visual frames..." : "Thinking...");
    chatInput.value = "";
    chatInput.style.height = "auto";

    const body = {
      videoId: currentVideoId,
      sessionId: currentChatSession?.sessionId || null,
      question,
      mode,
      context,
      webSearch: chatSearchToggle.checked,
    };
    if (mode === "summary") {
      body.summaryType = options.summaryType || "detailed";
      body.question = SUMMARY_CHAT_LABELS[body.summaryType] || question;
    }

    currentChatRequestId = requestId;
    currentChatAssistantMessageId = assistantId;

    // Record the pending state BEFORE any long-running work so we can detect a
    // popup that closes mid-capture. `phase` transitions from "capturing" to
    // "awaiting-response" once the server has the request in hand.
    chrome.storage.local.set({
      [chatPendingKey(currentVideoId)]: {
        requestId,
        assistantId,
        sessionId: currentChatSession?.sessionId || null,
        startedAt: Date.now(),
        phase: mode === "visual" ? "capturing" : "awaiting-response",
      },
    });

    try {
      if (mode === "visual") {
        const capture = await captureChatFrames(win.startTime, win.endTime, Number(chatIntervalSlider.value));
        body.frames = capture.frames;
        body.videoRect = capture.videoRect;
        body.deduplicate = chatDedupToggle.checked;
        context.frameCount = capture.frames.length;
        updateLocalChatMessage(assistantId, { text: "Analyzing visual frames...", context });
        chatProgressText.textContent = `Sending ${capture.frames.length} frames for analysis... you can close this popup.`;
        chatProgressFill.style.width = "80%";
        chrome.storage.local.set({
          [chatPendingKey(currentVideoId)]: {
            requestId,
            assistantId,
            sessionId: currentChatSession?.sessionId || null,
            startedAt: Date.now(),
            phase: "awaiting-response",
          },
        });
      }

      chrome.runtime.sendMessage({
        type: "server-request",
        endpoint: "/chat",
        videoId: currentVideoId,
        requestId,
        messageId: assistantId,
        sessionId: currentChatSession?.sessionId || null,
        body,
      }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      setChatPending(false);
      updateLocalChatMessage(assistantId, {
        text: "",
        status: "error",
        error: e.message || "Chat request failed.",
      });
      chrome.storage.local.remove(chatPendingKey(currentVideoId));
    }
  }

  // Keep these in sync with SUMMARY_CHAT_REQUESTS in server.py so the optimistic
  // user bubble shows the same question the model will actually see.
  const SUMMARY_CHAT_LABELS = {
    detailed: "Provide a detailed summary of the selected transcript window.",
    short: "Provide a short 3-5 sentence summary of the selected transcript window.",
    "key-pointers": "Extract the key pointers from the selected transcript window as a concise numbered list.",
  };

  function handleChatJobResult(job) {
    const pendingKey = chatPendingKey(currentVideoId);
    const messageId = job.messageId || currentChatAssistantMessageId;
    setChatPending(false);
    if (job.status === "done") {
      const session = job.result && job.result.session;
      if (session) {
        currentChatSession = session;
        chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session, savedAt: Date.now() } });
        setChatStatus("");
        renderChat();
      } else {
        updateLocalChatMessage(messageId, {
          text: job.result?.answer || "No response returned.",
          status: "done",
          usage: job.result?.usage || null,
        });
      }
    } else {
      const session = job.result && job.result.session;
      if (session) {
        currentChatSession = session;
        chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session, savedAt: Date.now() } });
        renderChat();
      } else {
        updateLocalChatMessage(messageId, {
          text: "",
          status: "error",
          error: job.error || "Chat failed.",
        });
      }
      setChatStatus("Chat request failed.", { error: true });
    }
    chrome.storage.local.remove(pendingKey);
    chrome.storage.local.remove(chatJobKey(currentVideoId, job.requestId || currentChatRequestId));
    currentChatRequestId = null;
    currentChatAssistantMessageId = null;
  }

  function restoreChatPendingJob() {
    if (!currentVideoId) return;
    chrome.storage.local.get(chatPendingKey(currentVideoId), (result) => {
      const pending = result[chatPendingKey(currentVideoId)];
      if (!pending || !pending.requestId) return;
      const ageMs = Date.now() - (pending.startedAt || 0);
      currentChatRequestId = pending.requestId;
      currentChatAssistantMessageId = pending.assistantId;

      // A pending record stuck in the "capturing" phase means the popup was
      // closed mid-frame-capture; there is no server job to wait for, so surface
      // an explicit error and clear the sentinel rather than leaving the user
      // staring at a "Thinking..." bubble forever.
      if (pending.phase === "capturing") {
        setChatPending(false);
        if (pending.assistantId) {
          updateLocalChatMessage(pending.assistantId, {
            text: "",
            status: "error",
            error: "Frame capture was interrupted when the popup closed. Please try again.",
          });
        }
        chrome.storage.local.remove(chatPendingKey(currentVideoId));
        currentChatRequestId = null;
        currentChatAssistantMessageId = null;
        return;
      }

      setChatPending(true, ageMs > 10 * 60 * 1000 ? "Chat request may be stale..." : "Waiting for chat response...");
      chrome.storage.local.get(chatJobKey(currentVideoId, pending.requestId), (jobs) => {
        const job = jobs[chatJobKey(currentVideoId, pending.requestId)];
        if (job && (job.status === "done" || job.status === "error")) {
          handleChatJobResult(job);
        }
      });
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
    if (btn && btn.classList && btn.classList.contains("chat-tts-btn")) {
      const item = btn.closest("[data-message-id]");
      return (item && item.__chatTtsUi) ? item.__chatTtsUi : null;
    }
    return btn === vaSpeakBtn ? visualTtsUi : transcriptTtsUi;
  }

  function isChatTtsUi(ui) {
    return !!(ui && ui.controls && ui.controls.classList && ui.controls.classList.contains("chat-tts-transport"));
  }

  function getTtsKind(btn) {
    if (btn && btn.classList && btn.classList.contains("chat-tts-btn")) return "chat";
    return btn === vaSpeakBtn ? "visual" : "transcript";
  }

  function getTtsButton(kind, messageId) {
    if (kind === "chat") {
      if (!messageId) return null;
      const item = chatMessagesEl.querySelector(`[data-message-id="${messageId}"]`);
      return item ? item.querySelector(".chat-tts-btn") : null;
    }
    return kind === "visual" ? vaSpeakBtn : speakBtn;
  }

  function getTtsTextEl(kind, messageId) {
    if (kind === "chat") {
      if (!messageId) return null;
      const item = chatMessagesEl.querySelector(`[data-message-id="${messageId}"]`);
      return item ? item.querySelector(".chat-bubble") : null;
    }
    return kind === "visual" ? vaOutputBox : outputBox;
  }

  function selectedTtsProvider(ui) {
    return ui && ui.provider ? ui.provider.value : "gemini";
  }

  function generatedTtsLabel(provider) {
    return provider === "qwen_mlx" ? "Qwen Local TTS" : "Gemini TTS";
  }

  function generatedTtsRetryHint(provider) {
    return provider === "qwen_mlx"
      ? "Retry manually later, or switch Engine to Local browser."
      : "Retry manually later, or switch Engine to Local browser.";
  }

  function setProviderSelection(ui, provider) {
    if (!ui || !ui.provider || !provider) return;
    const exists = Array.from(ui.provider.options).some((option) => option.value === provider);
    if (exists) ui.provider.value = provider;
  }

  function ttsJobStorageKey(kind) {
    if (kind === "chat") return null;
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
    if (!ui || !ui.controls || !ui.status) return;
    if (isChatTtsUi(ui)) {
      ui.status.hidden = !text;
      ui.status.textContent = text || "";
      ui.status.className = `chat-tts-status ${className || ""}`;
    } else {
      ui.controls.hidden = false;
      ui.status.textContent = text || "";
      ui.status.className = `tts-status ${className || ""}`;
    }
  }

  function setListenButtonState(btn, state, label) {
    if (!btn || !btn.classList || !btn.classList.contains("chat-tts-btn")) return;
    btn.dataset.state = state || "idle";
    const span = btn.querySelector(".chat-tts-label");
    if (span && label != null) span.textContent = label;
    btn.classList.toggle("speaking", state === "playing" || state === "loading" || state === "paused");
  }

  function markPlayingBubble(messageId) {
    if (!chatMessagesEl) return;
    chatMessagesEl.querySelectorAll(".chat-message.playing").forEach((el) => {
      if (el.dataset.messageId !== messageId) el.classList.remove("playing");
    });
    if (messageId) {
      const item = chatMessagesEl.querySelector(`[data-message-id="${messageId}"]`);
      if (item) item.classList.add("playing");
    }
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
    btn.disabled = false;
    btn.classList.remove("speaking", "loading");
    if (btn.classList.contains("chat-tts-btn")) {
      setListenButtonState(btn, "idle", "Listen");
      return;
    }
    btn.textContent = "Read aloud";
  }

  function setSpeakButtonLabel(btn, text, state) {
    if (!btn) return;
    if (btn.classList.contains("chat-tts-btn")) {
      const span = btn.querySelector(".chat-tts-label");
      if (span) span.textContent = text;
      if (state) btn.dataset.state = state;
      btn.classList.toggle("speaking", state === "playing" || state === "loading" || state === "paused");
      return;
    }
    btn.textContent = text;
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

    if (currentTtsUi.seek) {
      currentTtsUi.seek.max = String(duration || 0);
      currentTtsUi.seek.value = String(Math.min(current, duration) || 0);
      currentTtsUi.seek.disabled = true;
    }
    if (currentTtsUi.time) {
      currentTtsUi.time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
    }
    if (currentTtsUi.playPause) {
      currentTtsUi.playPause.textContent = speechSynthesis.paused ? "Play" : "Pause";
    }
    if (currentTtsButton) {
      setSpeakButtonLabel(currentTtsButton, "Stop", "playing");
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
    if (ui.controls) ui.controls.hidden = true;
    if (ui.playPause) ui.playPause.disabled = true;
    if (ui.seek) ui.seek.disabled = true;
    btn.title = reason || "Using Chrome's built-in speech. Click Stop to end playback, then Read aloud to restart.";

    utterance.onstart = () => {
      setSpeakButtonLabel(btn, "Stop", "playing");
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
      if (ui.controls) ui.controls.hidden = false;
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
    if (!ui || !ui.playPause) return;
    ui.playPause.textContent = "Play";
    ui.playPause.disabled = true;
    if (ui.retry) ui.retry.hidden = true;
    if (ui.seek) {
      ui.seek.value = "0";
      ui.seek.max = "0";
      ui.seek.disabled = true;
    }
    if (ui.time) ui.time.textContent = "0:00 / 0:00";
    if (ui.status) {
      ui.status.textContent = "";
      const isChat = isChatTtsUi(ui);
      ui.status.className = isChat ? "chat-tts-status" : "tts-status";
      ui.status.hidden = isChat;
    }
    if (ui.progress) ui.progress.hidden = true;
    if (ui.progressFill) ui.progressFill.style.width = "0%";
    setTtsControlMode(ui, selectedTtsProvider(ui));
    if (hide && ui.controls) ui.controls.hidden = true;
  }

  function syncTtsControls(audio, ui) {
    if (!ui || !ui.seek) return;
    setTtsControlMode(ui, selectedTtsProvider(ui));
    const duration = currentTtsSeekMode === "chunks"
      ? generatedAudioDuration()
      : (Number.isFinite(audio.duration) ? audio.duration : 0);
    const current = currentTtsSeekMode === "chunks"
      ? chunkStartTime(currentTtsPlayingChunk) + (audio.currentTime || 0)
      : (audio.currentTime || 0);
    ui.seek.max = String(duration || 0);
    ui.seek.value = String(current || 0);
    ui.seek.disabled = !duration;
    if (ui.time) ui.time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
    if (ui.playPause) ui.playPause.textContent = audio.paused ? "Play" : "Pause";
  }

  function syncTtsPlaybackUi(audio, ui, btn) {
    if (!ui) return;
    if (ui.controls) ui.controls.hidden = false;
    if (ui.playPause) ui.playPause.disabled = false;
    syncTtsControls(audio, ui);
    if (!btn) return;
    btn.classList.remove("loading");
    btn.classList.toggle("speaking", !audio.paused);
    if (btn.classList.contains("chat-tts-btn")) {
      if (!audio.paused) setListenButtonState(btn, "playing", "Stop");
      else if (audio.ended || audio.currentTime === 0) setListenButtonState(btn, "idle", "Listen");
      else setListenButtonState(btn, "paused", "Resume");
      return;
    }
    if (!audio.paused) {
      btn.textContent = "Pause";
    } else if (audio.ended || audio.currentTime === 0) {
      btn.textContent = "Play";
    } else {
      btn.textContent = "Resume";
    }
  }

  function switchTtsProvider(ui) {
    if (!ui || currentTtsUi !== ui) {
      setTtsControlMode(ui, selectedTtsProvider(ui));
      return;
    }

    if (currentTtsMode === "chrome") {
      stopChromeTts();
      resetSpeakButton(currentTtsButton);
    } else if (currentTtsAudio) {
      currentTtsAudio.pause();
      resetSpeakButton(currentTtsButton);
    }

    const provider = selectedTtsProvider(ui);
    setTtsControlMode(ui, provider);
    if (provider === "local") {
      if (ui.controls) ui.controls.hidden = true;
      if (ui.retry) ui.retry.hidden = !currentTtsJobId;
      resetSpeakButton(currentTtsButton);
    } else if (currentTtsAudio) {
      if (ui.controls) ui.controls.hidden = false;
      if (ui.playPause) ui.playPause.disabled = false;
      syncTtsPlaybackUi(currentTtsAudio, ui, currentTtsButton);
      setTtsStatus(ui, `${generatedTtsLabel(provider)} selected.`);
    } else {
      resetTtsControls(ui, true);
    }
  }

  function closeTtsEventSource() {
    if (currentTtsEventSource) {
      try { currentTtsEventSource.close(); } catch (_) {}
      currentTtsEventSource = null;
    }
  }

  function stopGeminiTts(hideControls) {
    stopChromeTts();
    closeTtsEventSource();
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
    currentTtsWaitingForNextChunk = false;
    resetSpeakButton(currentTtsButton);
    resetTtsControls(currentTtsUi, hideControls);
    markPlayingBubble(null);
    currentTtsButton = null;
    currentTtsUi = null;
    currentTtsKind = null;
    currentTtsMessageId = null;
    currentTtsMode = "gemini";
  }

  async function playCurrentTts() {
    if (currentTtsMode === "chrome") {
      if (speechSynthesis.paused) {
        currentChromeStartedAt = Date.now();
        speechSynthesis.resume();
        currentTtsButton?.classList.add("speaking");
        if (currentTtsButton) setSpeakButtonLabel(currentTtsButton, "Stop", "playing");
        updateChromeTtsControls();
      }
      return;
    }
    if (!currentTtsAudio || !currentTtsUi) return;
    try {
      if (currentTtsAudio.ended && currentTtsWaitingForNextChunk) {
        currentTtsWaitingForNextChunk = false;
      }
      currentTtsAudio.playbackRate = Number(currentTtsUi.speed.value) || 1;
      await currentTtsAudio.play();
      syncTtsPlaybackUi(currentTtsAudio, currentTtsUi, currentTtsButton);
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
    currentTtsWaitingForNextChunk = false;
    const audio = new Audio(url);
    audio.playbackRate = Number(ui.speed.value) || 1;
    currentTtsAudio = audio;

    audio.onloadedmetadata = () => syncTtsPlaybackUi(audio, ui, btn);
    audio.ontimeupdate = () => syncTtsControls(audio, ui);
    audio.onplay = () => {
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.onpause = () => {
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.onended = async () => {
      const nextIndex = index + 1;
      if (currentTtsChunkUrls[nextIndex]) {
        await playTtsChunk(nextIndex, btn, ui, true);
      } else if (currentTtsJobId) {
        currentTtsWaitingForNextChunk = true;
        syncTtsPlaybackUi(audio, ui, btn);
        setTtsStatus(ui, "Waiting for the next speech chunk...");
      } else {
        syncTtsPlaybackUi(audio, ui, btn);
      }
    };
    audio.onerror = () => setTtsStatus(ui, "Could not play generated speech chunk.", "error");

    if (autoplay) await playCurrentTts();
    else syncTtsPlaybackUi(audio, ui, btn);
    return true;
  }

  async function loadTtsChunk(jobId, index, btn, ui, autoplayFirstChunk) {
    if (currentTtsChunkUrls[index - 1]) return;
    const resp = await fetch(`${SERVER_URL}/tts-job/${jobId}/chunk/${index}/audio`);
    if (!resp.ok) return;
    const blob = await resp.blob();
    currentTtsChunkUrls[index - 1] = URL.createObjectURL(blob);

    if (!currentTtsAudio && index === 1) {
      await playTtsChunk(0, btn, ui, autoplayFirstChunk);
    } else if (currentTtsWaitingForNextChunk && index - 1 === currentTtsPlayingChunk + 1) {
      await playTtsChunk(index - 1, btn, ui, true);
    } else if (currentTtsSeekMode === "chunks" && currentTtsAudio) {
      syncTtsPlaybackUi(currentTtsAudio, ui, btn);
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
    currentTtsWaitingForNextChunk = false;
    currentTtsMode = job.provider || selectedTtsProvider(ui);
    setProviderSelection(ui, currentTtsMode);
    setTtsControlMode(ui, currentTtsMode);

    ui.playPause.disabled = false;
    ui.seek.disabled = false;
    setTtsStatus(ui, job.truncated ? "Speech ready. Text was truncated to the configured TTS limit." : "Speech ready.");

    audio.onloadedmetadata = () => {
      if (resumeTime && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(resumeTime, audio.duration);
      }
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.ontimeupdate = () => syncTtsControls(audio, ui);
    audio.onplay = () => {
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.onpause = () => {
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.onended = () => {
      syncTtsPlaybackUi(audio, ui, btn);
    };
    audio.onerror = () => setTtsStatus(ui, "Could not play generated speech.", "error");

    syncTtsPlaybackUi(audio, ui, btn);
    if (autoplay && (shouldKeepPlaying || !resumeTime)) await playCurrentTts();
  }

  function updateChunkProgressUi(ui, job) {
    if (!ui || !ui.progress) return;
    const total = Number(job.chunksTotal) || 0;
    const done = Number(job.chunksDone) || 0;
    const isActive = job.status === "queued" || job.status === "running" || job.status === "rate_limited";
    if (!total || !isActive) {
      ui.progress.hidden = true;
      return;
    }
    ui.progress.hidden = false;
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    if (ui.progressFill) ui.progressFill.style.width = `${pct}%`;
    if (ui.progressText) {
      const label = job.status === "rate_limited"
        ? `Rate limited at chunk ${job.currentChunk || done}/${total}`
        : `Generating ${done}/${total} chunks`;
      ui.progressText.textContent = label;
    }
  }

  async function applyTtsJobUpdate(job) {
    if (!job || currentTtsJobId !== job.jobId) return false;
    const ui = currentTtsUi;
    const btn = currentTtsButton;
    if (!ui || !btn) return false;

    setTtsStatus(ui, ttsJobMessage(job), job.status === "error" ? "error" : "");
    updateChunkProgressUi(ui, job);
    currentTtsChunkDurations = (job.chunkTimings || [])
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((timing) => timing.audioSeconds || 0);
    for (const chunkIndex of job.chunkAudioReady || []) {
      await loadTtsChunk(job.jobId, chunkIndex, currentTtsButton, currentTtsUi, true);
    }

    if (job.status === "done") {
      if (currentTtsPollTimer) {
        clearTimeout(currentTtsPollTimer);
        currentTtsPollTimer = null;
      }
      closeTtsEventSource();
      if (currentTtsUi && currentTtsUi.progress) currentTtsUi.progress.hidden = true;
      await loadCompletedTtsAudio(job, currentTtsButton, currentTtsUi);
      return true;
    }

    if (job.status === "error") {
      closeTtsEventSource();
      const liveBtn = currentTtsButton;
      const liveUi = currentTtsUi;
      setSpeakButtonLabel(liveBtn, "Retry", "error");
      liveBtn.classList.remove("loading");
      if (liveUi && liveUi.retry) liveUi.retry.hidden = false;
      if (liveUi && liveUi.progress) liveUi.progress.hidden = true;
      currentTtsJobId = job.jobId;
      currentTtsAbort = null;
      if (job.error?.type === "rate_limited") {
        liveBtn.title = "Gemini TTS is rate limited. Retry manually later or switch Engine to Local browser.";
        setTtsStatus(liveUi, `${job.error.message} Retry manually later, or switch Engine to Local browser.`, "error");
      } else if (job.error?.type && job.error.type.startsWith("qwen_")) {
        liveBtn.title = `${generatedTtsLabel(job.provider)} failed. ${generatedTtsRetryHint(job.provider)}`;
      }
      return true;
    }

    if (job.status === "cancelled") {
      closeTtsEventSource();
      const liveBtn = currentTtsButton;
      const liveUi = currentTtsUi;
      resetTtsControls(liveUi, true);
      resetSpeakButton(liveBtn);
      markPlayingBubble(null);
      currentTtsJobId = null;
      currentTtsAbort = null;
      currentTtsButton = null;
      currentTtsUi = null;
      currentTtsMessageId = null;
      return true;
    }

    return false;
  }

  function startTtsEventSource(jobId) {
    closeTtsEventSource();
    if (typeof EventSource === "undefined") return false;
    try {
      const source = new EventSource(`${SERVER_URL}/tts-job/${jobId}/events`);
      currentTtsEventSource = source;
      source.onmessage = async (event) => {
        if (!event.data || currentTtsJobId !== jobId) return;
        try {
          const job = JSON.parse(event.data);
          await applyTtsJobUpdate(job);
        } catch (_) {}
      };
      source.onerror = () => {
        if (currentTtsEventSource !== source) return;
        try { source.close(); } catch (_) {}
        currentTtsEventSource = null;
        if (currentTtsJobId === jobId) {
          currentTtsPollTimer = setTimeout(() => pollTtsJob(jobId), 1000);
        }
      };
      return true;
    } catch (_) {
      return false;
    }
  }

  async function pollTtsJob(jobId) {
    try {
      const resp = await fetch(`${SERVER_URL}/tts-job/${jobId}`);
      const job = await resp.json();
      if (!resp.ok) throw new Error(job.error || "TTS job failed");
      if (currentTtsJobId !== jobId) return;

      const finalised = await applyTtsJobUpdate(job);
      if (finalised) return;

      currentTtsPollTimer = setTimeout(() => pollTtsJob(jobId), 1000);
    } catch (e) {
      const liveBtn = currentTtsButton;
      const liveUi = currentTtsUi;
      setSpeakButtonLabel(liveBtn, "Retry", "error");
      if (liveBtn) liveBtn.classList.remove("loading");
      setTtsStatus(liveUi, e.message || "Could not check TTS progress.", "error");
      currentTtsJobId = null;
      currentTtsAbort = null;
      currentTtsButton = null;
      currentTtsUi = null;
      currentTtsMessageId = null;
      if (liveBtn) setTimeout(() => resetSpeakButton(liveBtn), 1500);
    }
  }

  async function toggleSpeak(btn, textEl) {
    const ui = getTtsUi(btn);
    const kind = getTtsKind(btn);
    const text = textEl.textContent;
    if (!text) return;

    const isChat = kind === "chat";
    const messageId = isChat ? btn.closest("[data-message-id]")?.dataset.messageId : null;

    if (!ui) return;

    const provider = selectedTtsProvider(ui);

    if (currentTtsMode === "chrome" && currentTtsButton === btn && provider === "local") {
      if (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused) {
        stopChromeTts();
        resetSpeakButton(btn);
        btn.title = isChat ? "Listen" : "Read aloud";
      } else {
        startChromeTts(text, btn, ui, "Using Chrome's built-in speech. Click Stop to end playback, then click Listen to restart.");
      }
      return;
    }

    if (provider === "local") {
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
      currentTtsMessageId = messageId;
      if (isChat) markPlayingBubble(messageId);
      resetTtsControls(ui, false);
      startChromeTts(text, btn, ui, "Using Chrome's built-in speech. Click Stop to end playback, then click Listen to restart.");
      if (currentTtsJobId && ui.retry) ui.retry.hidden = false;
      return;
    }

    if (currentTtsAudio && currentTtsButton === btn) {
      if (currentTtsAudio.paused) {
        await playCurrentTts();
      } else {
        currentTtsWaitingForNextChunk = false;
        currentTtsAudio.pause();
        syncTtsPlaybackUi(currentTtsAudio, ui, btn);
      }
      return;
    }

    if (currentTtsButton === btn && (currentTtsAbort || currentTtsJobId)) {
      stopGeminiTts(true);
      return;
    }

    stopGeminiTts(true);
    setSpeakButtonLabel(btn, "Generating...", "loading");
    btn.classList.add("loading");
    currentTtsButton = btn;
    currentTtsUi = ui;
    currentTtsKind = kind;
    currentTtsMessageId = messageId;
    if (isChat) markPlayingBubble(messageId);
    currentTtsAbort = new AbortController();
    currentTtsChunkDurations = [];
    currentTtsPlayingChunk = 0;
    currentTtsSeekMode = "final";
    currentTtsWaitingForNextChunk = false;
    revokeTtsUrls();
    resetTtsControls(ui, false);
    setTtsStatus(
      ui,
      isChat
        ? `Generating speech with ${generatedTtsLabel(provider)}...`
        : `Generating speech with ${generatedTtsLabel(provider)}... click the speaker again to cancel.`
    );

    try {
      const requestUrl = isChat ? `${SERVER_URL}/chat-tts` : `${SERVER_URL}/tts-job`;
      const requestBody = isChat
        ? {
            videoId: currentVideoId,
            sessionId: currentChatSession?.sessionId,
            messageId,
            provider,
          }
        : { text, provider };
      const resp = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: currentTtsAbort.signal,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `${generatedTtsLabel(provider)} failed`);
      }
      currentTtsAbort = null;
      currentTtsJobId = data.jobId;
      currentTtsMode = data.provider || provider;
      setProviderSelection(ui, currentTtsMode);
      if (!isChat) saveTtsJob(kind, data.jobId);
      setTtsStatus(ui, ttsJobMessage(data));
      updateChunkProgressUi(ui, data);

      if (data.status === "done") {
        await loadCompletedTtsAudio(data, btn, ui);
      } else if (!startTtsEventSource(data.jobId)) {
        currentTtsPollTimer = setTimeout(() => pollTtsJob(data.jobId), 500);
      }
    } catch (e) {
      if (e.name === "AbortError") {
        resetTtsControls(ui, true);
        resetSpeakButton(btn);
      } else {
        btn.title = e.message || `${generatedTtsLabel(provider)} failed`;
        setSpeakButtonLabel(btn, "Retry", "error");
        setTtsStatus(ui, e.message || `${generatedTtsLabel(provider)} failed.`, "error");
        setTimeout(() => resetSpeakButton(btn), 1500);
      }
      currentTtsAbort = null;
      currentTtsButton = null;
      currentTtsUi = null;
      currentTtsMessageId = null;
      markPlayingBubble(null);
    }
  }

  function updateSpeakBtnVisibility(btn, textEl) {
    const hidden = textEl.hidden || !textEl.textContent ||
      textEl.classList.contains("loading") || textEl.classList.contains("error");
    const ui = getTtsUi(btn);
    btn.hidden = hidden;
    if (ui.toolbar && "hidden" in ui.toolbar) ui.toolbar.hidden = hidden;
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
    if (!ui) return;
    if (ui._bound) return;
    ui._bound = true;

    if (ui.playPause) {
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
          currentTtsWaitingForNextChunk = false;
          currentTtsAudio.pause();
          syncTtsPlaybackUi(currentTtsAudio, ui, currentTtsButton);
        }
      });
    }

    if (ui.seek) {
      ui.seek.addEventListener("input", () => {
        if (!currentTtsAudio || currentTtsUi !== ui) return;
        currentTtsWaitingForNextChunk = false;
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
                  else syncTtsPlaybackUi(currentTtsAudio, ui, currentTtsButton);
                }
              });
              return;
            }
            offset += duration;
          }
        } else {
          currentTtsAudio.currentTime = target;
        }
        syncTtsPlaybackUi(currentTtsAudio, ui, currentTtsButton);
      });
    }

    if (ui.speed) {
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
    }

    if (ui.provider) {
      ui.provider.addEventListener("change", () => {
        switchTtsProvider(ui);
      });
    }

    if (ui.retry) {
      ui.retry.addEventListener("click", async () => {
        if (!currentTtsJobId || currentTtsUi !== ui || !currentTtsButton) return;
        try {
          stopChromeTts();
          currentTtsMode = selectedTtsProvider(ui);
          ui.retry.hidden = true;
          setSpeakButtonLabel(currentTtsButton, "Generating...", "loading");
          currentTtsButton.classList.add("loading");
          setTtsStatus(ui, "Retrying failed speech job...");
          const resp = await fetch(`${SERVER_URL}/tts-job/${currentTtsJobId}/retry`, { method: "POST" });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || "Could not retry TTS job");
          setTtsStatus(ui, ttsJobMessage(data));
          updateChunkProgressUi(ui, data);
          if (!startTtsEventSource(currentTtsJobId)) {
            currentTtsPollTimer = setTimeout(() => pollTtsJob(currentTtsJobId), 500);
          }
        } catch (e) {
          setTtsStatus(ui, e.message || "Could not retry TTS job.", "error");
          ui.retry.hidden = false;
        }
      });
    }
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
        currentTtsMode = job.provider || "gemini";
        currentTtsKind = kind;
        currentTtsButton = btn;
        currentTtsUi = ui;
        setProviderSelection(ui, currentTtsMode);
        currentTtsWaitingForNextChunk = false;
        currentTtsChunkDurations = (job.chunkTimings || [])
          .sort((a, b) => a.chunkIndex - b.chunkIndex)
          .map((timing) => timing.audioSeconds || 0);
        btn.hidden = false;
        if (ui.toolbar && "hidden" in ui.toolbar) ui.toolbar.hidden = false;
        btn.textContent = job.status === "done" ? "Read aloud" : "Generating...";
        btn.classList.toggle("loading", job.status !== "done" && job.status !== "error");
        resetTtsControls(ui, false);
        setTtsStatus(ui, ttsJobMessage(job), job.status === "error" ? "error" : "");
        updateChunkProgressUi(ui, job);

        for (const chunkIndex of job.chunkAudioReady || []) {
          await loadTtsChunk(job.jobId, chunkIndex, btn, ui, false);
        }

        if (job.status === "done") {
          await loadCompletedTtsAudio(job, btn, ui, false);
        } else if (job.status === "error") {
          if (ui.retry) ui.retry.hidden = false;
        } else if (!startTtsEventSource(job.jobId)) {
          currentTtsPollTimer = setTimeout(() => pollTtsJob(job.jobId), 500);
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

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] || null);
      });
    });
  }

  function setYoutubeTabsVisible(visible) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      if (btn.dataset.tab !== "shortcuts-tab") btn.hidden = !visible;
    });
  }

  function activateTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === tabId);
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
    if (currentChatRequestId) {
      const key = chatJobKey(currentVideoId, currentChatRequestId);
      if (changes[key] && changes[key].newValue) {
        const job = changes[key].newValue;
        if (job.status === "done" || job.status === "error") {
          handleChatJobResult(job);
        }
      }
    }
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
    const activeTab = await getActiveTab();
    const resp = await sendToContent({ type: "get-video-id" });

    if (!resp || !resp.videoId) {
      setYoutubeTabsVisible(false);
      activateTab("shortcuts-tab");
      mainControls.hidden = false;
      noVideoEl.hidden = false;
      noVideoEl.textContent = activeTab && activeTab.url && activeTab.url.startsWith("http")
        ? "Website keybindings can be configured for this page."
        : "Website keybindings cannot run on browser-internal pages, but you can still configure them here.";
      return;
    }

    setYoutubeTabsVisible(true);
    activateTab("chat-tab");
    currentVideoId = resp.videoId;
    currentIsShortsPage = resp.isShorts === true;
    noVideoEl.hidden = true;
    mainControls.hidden = false;

    initSlider(resp.duration || 0, resp.currentTime || 0);
    initChatSlider(resp.duration || 0, resp.currentTime || 0);
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
    loadChatSession();
    restoreTtsJob("transcript");
    restoreTtsJob("visual");
    restoreChatPendingJob();
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

  // --- Persistent chat ---

  function updateChatIntervalLabel() {
    const val = Number(chatIntervalSlider.value);
    chatIntervalLabel.textContent = `1 frame / ${val}s`;
  }

  chatVisualToggle.addEventListener("change", () => {
    chatVisualOptions.hidden = !chatVisualToggle.checked;
    if (chatVisualToggle.checked && chatContextPanel.hidden) {
      chatContextPanel.hidden = false;
      chatContextToggle.setAttribute("aria-expanded", "true");
    }
  });

  chatIntervalSlider.addEventListener("input", updateChatIntervalLabel);
  updateChatIntervalLabel();

  chatContextToggle.addEventListener("click", () => {
    const willOpen = chatContextPanel.hidden;
    chatContextPanel.hidden = !willOpen;
    chatContextToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  function autoGrowChatInput() {
    chatInput.style.height = "auto";
    const next = Math.min(120, chatInput.scrollHeight);
    chatInput.style.height = next + "px";
  }

  chatInput.addEventListener("input", autoGrowChatInput);
  autoGrowChatInput();

  chatSendBtn.addEventListener("click", () => {
    sendChatTurn();
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatSendBtn.click();
    }
  });

  chatSummaryBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const summaryType = btn.dataset.summaryType || "detailed";
      sendChatTurn({
        mode: "summary",
        summaryType,
        question: SUMMARY_CHAT_LABELS[summaryType],
      });
    });
  });

  chatClearBtn.addEventListener("click", async () => {
    if (!currentVideoId || chatPending) return;
    const original = chatClearBtn.textContent;
    if (chatClearBtn.dataset.confirm !== "true") {
      chatClearBtn.dataset.confirm = "true";
      chatClearBtn.textContent = "Confirm clear";
      setTimeout(() => {
        chatClearBtn.dataset.confirm = "false";
        chatClearBtn.textContent = original;
      }, 3000);
      return;
    }
    chatClearBtn.dataset.confirm = "false";
    chatClearBtn.disabled = true;
    try {
      const resp = await fetch(`${SERVER_URL}/chat-session/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: currentVideoId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not clear session.");
      currentChatSession = data.session;
      chrome.storage.local.remove(chatPendingKey(currentVideoId));
      chrome.storage.local.set({ [chatStateKey(currentVideoId)]: { session: currentChatSession, savedAt: Date.now() } });
      setChatStatus("");
      renderChat();
    } catch (e) {
      setChatStatus(e.message || "Could not clear session.", { error: true });
    } finally {
      chatClearBtn.disabled = false;
      chatClearBtn.textContent = original;
    }
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

  function applyKeybindingsSettingsToUi(settings) {
    const defs = self.VSC_KEYBINDINGS;
    const norm = defs ? defs.normalizeSettings(settings) : (settings || {});
    keybindingsEnabledToggle.checked = norm.enabled === true;
    keybindingsIgnoreInputsToggle.checked = norm.ignoreInInputs !== false;
    const count = Array.isArray(norm.bindings) ? norm.bindings.length : 0;
    if (count === 0) {
      keybindingsSummary.textContent = "No keybindings configured yet.";
    } else {
      keybindingsSummary.textContent = `${count} keybinding${count === 1 ? "" : "s"} configured.`;
    }
  }

  function loadKeyboardControlSettings() {
    chrome.storage.local.get([SHORTCUTS_STORAGE_KEY, KEYBINDINGS_STORAGE_KEY], (result) => {
      applyShortcutsSettingsToUi(result[SHORTCUTS_STORAGE_KEY]);
      applyKeybindingsSettingsToUi(result[KEYBINDINGS_STORAGE_KEY]);
    });
  }

  function updateShortcutsSetting(patch) {
    chrome.storage.local.get([SHORTCUTS_STORAGE_KEY, KEYBINDINGS_STORAGE_KEY], (result) => {
      const defs = self.VSC_SHORTCUTS;
      const current = defs
        ? defs.normalizeSettings(result[SHORTCUTS_STORAGE_KEY])
        : Object.assign({}, result[SHORTCUTS_STORAGE_KEY] || {});
      const next = Object.assign({}, current, patch);
      const writes = { [SHORTCUTS_STORAGE_KEY]: next };
      if (patch.enabled === true) {
        const kbDefs = self.VSC_KEYBINDINGS;
        const keybindings = kbDefs
          ? kbDefs.normalizeSettings(result[KEYBINDINGS_STORAGE_KEY])
          : Object.assign({}, result[KEYBINDINGS_STORAGE_KEY] || {});
        keybindings.enabled = false;
        writes[KEYBINDINGS_STORAGE_KEY] = keybindings;
      }
      chrome.storage.local.set(writes);
    });
  }

  function updateKeybindingsSetting(patch) {
    chrome.storage.local.get([SHORTCUTS_STORAGE_KEY, KEYBINDINGS_STORAGE_KEY], (result) => {
      const defs = self.VSC_KEYBINDINGS;
      const current = defs
        ? defs.normalizeSettings(result[KEYBINDINGS_STORAGE_KEY])
        : Object.assign({}, result[KEYBINDINGS_STORAGE_KEY] || {});
      const next = Object.assign({}, current, patch);
      const writes = { [KEYBINDINGS_STORAGE_KEY]: next };
      if (patch.enabled === true) {
        const shortcutDefs = self.VSC_SHORTCUTS;
        const shortcuts = shortcutDefs
          ? shortcutDefs.normalizeSettings(result[SHORTCUTS_STORAGE_KEY])
          : Object.assign({}, result[SHORTCUTS_STORAGE_KEY] || {});
        shortcuts.enabled = false;
        writes[SHORTCUTS_STORAGE_KEY] = shortcuts;
      }
      chrome.storage.local.set(writes);
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

  keybindingsEnabledToggle.addEventListener("change", () => {
    updateKeybindingsSetting({ enabled: keybindingsEnabledToggle.checked });
  });

  keybindingsIgnoreInputsToggle.addEventListener("change", () => {
    updateKeybindingsSetting({ ignoreInInputs: keybindingsIgnoreInputsToggle.checked });
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
    if (changes[KEYBINDINGS_STORAGE_KEY]) {
      applyKeybindingsSettingsToUi(changes[KEYBINDINGS_STORAGE_KEY].newValue);
    }
  });

  loadKeyboardControlSettings();

  // --- Tab switching ---

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
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
      currentChatSession = null;
      currentChatRequestId = null;
      currentChatAssistantMessageId = null;
      chatPending = false;
      renderChat();
      setChatStatus("");
      setChatPending(false);
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
