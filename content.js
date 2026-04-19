(function () {
  "use strict";

  let video = null;
  let segments = [];
  let enabled = false;
  let currentSegmentIndex = 0;
  let lastVideoId = null;
  let lastWasShorts = false;
  let fallbackInterval = null;
  let shortsAutoScrollEnabled = false;
  let shortsBoundVideo = null;
  let shortsObserver = null;

  function contextValid() {
    try { return !!chrome.runtime.id; } catch { return false; }
  }

  // --- Helpers ---

  function getVideoId() {
    try {
      const url = new URL(location.href);
      if (url.pathname.startsWith("/shorts/")) {
        const shortId = url.pathname.split("/")[2];
        return shortId || null;
      }
      return url.searchParams.get("v") || null;
    } catch {
      return null;
    }
  }

  function isShortsPage() {
    return location.pathname.startsWith("/shorts/");
  }

  function storageKey(videoId) {
    return `segments_${videoId}`;
  }

  function isAdPlaying() {
    const player = document.getElementById("movie_player");
    return player && player.classList.contains("ad-showing");
  }

  // --- Seek resolution ---

  function findSegmentContaining(t) {
    for (let i = 0; i < segments.length; i++) {
      if (t >= segments[i].start - 0.5 && t < segments[i].end) return i;
    }
    return -1;
  }

  function findNextSegmentAfter(t) {
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start > t) return i;
    }
    return 0;
  }

  function onUserSeek() {
    if (!enabled || segments.length === 0 || !video) return;

    const t = video.currentTime;
    const hit = findSegmentContaining(t);

    if (hit !== -1) {
      currentSegmentIndex = hit;
    } else {
      currentSegmentIndex = findNextSegmentAfter(t);
      video.currentTime = segments[currentSegmentIndex].start;
    }
  }

  // --- Core playback enforcement ---

  function enforce() {
    if (!enabled || segments.length === 0 || !video) return;
    if (isAdPlaying()) return;

    const seg = segments[currentSegmentIndex];
    if (!seg) return;

    const t = video.currentTime;

    if (t >= seg.end - 0.15) {
      currentSegmentIndex = (currentSegmentIndex + 1) % segments.length;
      video.currentTime = segments[currentSegmentIndex].start;
      if (video.paused) video.play();
    }
  }

  // --- Video element management ---

  function detachVideo() {
    if (video) {
      video.removeEventListener("timeupdate", enforce);
      video.removeEventListener("seeking", onUserSeek);
      video.removeEventListener("ratechange", onRateChange);
    }
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
  }

  function attachVideo(el) {
    detachVideo();
    video = el;
    video.addEventListener("timeupdate", enforce);
    video.addEventListener("seeking", onUserSeek);
    video.addEventListener("ratechange", onRateChange);
    fallbackInterval = setInterval(enforce, 200);
    syncShortsAutoScroll();
    ensureSpeedOverlay();
  }

  function findAndAttachVideo() {
    const el = document.querySelector("video");
    if (el && el !== video) {
      attachVideo(el);
    }
  }

  // --- Load segments from storage for a given video ---

  function loadSegments(videoId) {
    if (!videoId || !contextValid()) {
      segments = [];
      enabled = false;
      return;
    }

    const key = storageKey(videoId);
    chrome.storage.local.get(key, (result) => {
      const data = result[key];
      if (data && data.segments && data.segments.length > 0) {
        segments = data.segments;
        enabled = data.enabled !== false;
        currentSegmentIndex = 0;
        if (enabled && video) {
          video.currentTime = segments[0].start;
          if (video.paused) video.play();
        }
      } else {
        segments = [];
        enabled = false;
      }
    });
  }

  // --- Shorts auto-scroll ---

  function getShortsNextButton() {
    return (
      document.querySelector("#navigation-button-down button") ||
      document.querySelector("button[aria-label*='Next']") ||
      document.querySelector("button[title*='Next']")
    );
  }

  function getShortsPrevButton() {
    return (
      document.querySelector("#navigation-button-up button") ||
      document.querySelector("button[aria-label*='Previous']") ||
      document.querySelector("button[title*='Previous']")
    );
  }

  function cleanupShortsBinding() {
    if (!shortsBoundVideo) return;
    shortsBoundVideo.removeEventListener("ended", onShortEnded);
    shortsBoundVideo.removeEventListener("progress", keepShortLoopDisabled);
    shortsBoundVideo.removeEventListener("playing", keepShortLoopDisabled);
    shortsBoundVideo = null;
  }

  function keepShortLoopDisabled() {
    if (!shortsAutoScrollEnabled || !isShortsPage() || !video) return;
    video.loop = false;
    video.removeAttribute("loop");
  }

  function onShortEnded() {
    if (!shortsAutoScrollEnabled || !isShortsPage()) return;
    const nextButton = getShortsNextButton();
    if (nextButton) {
      nextButton.click();
    }
  }

  function syncShortsAutoScroll() {
    if (!shortsAutoScrollEnabled || !isShortsPage() || !video) {
      cleanupShortsBinding();
      return;
    }

    if (shortsBoundVideo === video) {
      keepShortLoopDisabled();
      return;
    }

    cleanupShortsBinding();
    shortsBoundVideo = video;
    keepShortLoopDisabled();
    shortsBoundVideo.addEventListener("ended", onShortEnded);
    shortsBoundVideo.addEventListener("progress", keepShortLoopDisabled);
    shortsBoundVideo.addEventListener("playing", keepShortLoopDisabled);
  }

  function disconnectShortsObserver() {
    if (shortsObserver) {
      shortsObserver.disconnect();
      shortsObserver = null;
    }
  }

  function ensureShortsObserver() {
    disconnectShortsObserver();
    if (!shortsAutoScrollEnabled || !isShortsPage()) return;

    const target = document.getElementById("shorts-player") || document.body;
    if (!target) return;

    shortsObserver = new MutationObserver(() => {
      findAndAttachVideo();
      syncShortsAutoScroll();
    });
    shortsObserver.observe(target, { childList: true, subtree: true });
  }

  function updateShortsAutoScrollState(nextValue) {
    shortsAutoScrollEnabled = !!nextValue;
    if (!shortsAutoScrollEnabled) {
      if (shortsBoundVideo) {
        shortsBoundVideo.loop = true;
        shortsBoundVideo.setAttribute("loop", "");
      }
      cleanupShortsBinding();
      disconnectShortsObserver();
      return;
    }
    ensureShortsObserver();
    syncShortsAutoScroll();
  }

  if (contextValid()) {
    chrome.storage.local.get("shorts_auto_scroll", (result) => {
      updateShortsAutoScrollState(result.shorts_auto_scroll === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.shorts_auto_scroll) return;
      updateShortsAutoScrollState(changes.shorts_auto_scroll.newValue === true);
    });
  }

  // --- SPA navigation handling ---

  function onNavigate() {
    if (!contextValid()) return;
    const videoId = getVideoId();
    const onShorts = isShortsPage();
    if (videoId === lastVideoId && onShorts === lastWasShorts) return;
    lastVideoId = videoId;
    lastWasShorts = onShorts;
    currentSegmentIndex = 0;

    findAndAttachVideo();
    loadSegments(videoId);
    ensureShortsObserver();
    syncShortsAutoScroll();
  }

  // YouTube fires this custom event on SPA navigation
  window.addEventListener("yt-navigate-finish", onNavigate);

  // Fallback: watch for title changes which signal page transitions
  const titleObserver = new MutationObserver(() => {
    onNavigate();
  });
  const titleEl = document.querySelector("title");
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true });
  }

  // Also catch popstate for browser back/forward
  window.addEventListener("popstate", onNavigate);

  // Retry video detection — YouTube loads the player lazily
  const bodyObserver = new MutationObserver(() => {
    if (!video || !video.isConnected) {
      findAndAttachVideo();
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // --- Message handling from popup ---

  function getVideoRect() {
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      tabWidth: window.innerWidth,
      tabHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "get-video-id") {
      sendResponse({
        videoId: getVideoId(),
        isShorts: isShortsPage(),
        duration: video ? video.duration || 0 : 0,
        currentTime: video ? video.currentTime || 0 : 0,
      });
      return;
    }

    if (message.type === "update-segments") {
      const videoId = getVideoId();
      if (videoId) loadSegments(videoId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "toggle") {
      enabled = message.enabled;
      if (enabled && segments.length > 0 && video) {
        currentSegmentIndex = 0;
        video.currentTime = segments[0].start;
        if (video.paused) video.play();
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "get-video-rect") {
      sendResponse({ rect: getVideoRect() });
      return;
    }

    if (message.type === "prepare-capture") {
      if (!video) {
        sendResponse({ ok: false, error: "No video element found" });
        return;
      }
      video.pause();
      sendResponse({
        ok: true,
        rect: getVideoRect(),
        wasPaused: video.paused,
        savedTime: video.currentTime,
      });
      return;
    }

    if (message.type === "seek-to") {
      if (!video) {
        sendResponse({ ok: false, error: "No video element found" });
        return;
      }
      const target = message.time;
      if (Math.abs(video.currentTime - target) < 0.1) {
        sendResponse({ ok: true, ready: true });
        return;
      }
      let responded = false;
      const respond = () => {
        if (responded) return;
        responded = true;
        video.removeEventListener("seeked", onSeeked);
        clearTimeout(timeout);
        sendResponse({ ok: true, ready: true });
      };
      const onSeeked = () => respond();
      const timeout = setTimeout(() => {
        if (Math.abs(video.currentTime - target) < 1) {
          respond();
        } else {
          video.currentTime = target;
          setTimeout(respond, 1000);
        }
      }, 3000);
      video.addEventListener("seeked", onSeeked);
      video.currentTime = target;
      return true;
    }

    if (message.type === "finish-capture") {
      if (video && typeof message.restoreTime === "number") {
        video.currentTime = message.restoreTime;
        if (message.wasPlaying) video.play();
      }
      sendResponse({ ok: true });
      return;
    }
  });

  // --- Active video resolution (for shortcut dispatch) ---
  //
  // The cached `video` variable is tied to the main watch/Shorts player and
  // drives segment loop enforcement + the speed overlay.  For keyboard
  // shortcuts we want a broader target so actions also work on Shorts that
  // swapped in mid-scroll and on transient hover-preview videos shown on
  // home/search pages.
  //
  // Resolution order used by getActiveVideo():
  //   1. The video the mouse most recently moved over, if still attached and visible.
  //   2. The largest playing + visible video in the viewport.
  //   3. The largest visible video in the viewport.
  //   4. The cached main-player `video` if still attached.
  //   5. The first connected <video> we can find.

  let lastHoveredVideo = null;

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) {
      return false;
    }
    return true;
  }

  function largestByArea(videos) {
    let best = null;
    let bestArea = -1;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > bestArea) { best = v; bestArea = a; }
    }
    return best;
  }

  function getActiveVideo() {
    if (lastHoveredVideo && lastHoveredVideo.isConnected && isElementVisible(lastHoveredVideo)) {
      return lastHoveredVideo;
    }
    const all = Array.from(document.querySelectorAll("video")).filter((v) => v.isConnected);
    if (all.length === 0) {
      return (video && video.isConnected) ? video : null;
    }
    const playingVisible = all.filter((v) => !v.paused && !v.ended && v.readyState >= 2 && isElementVisible(v));
    if (playingVisible.length) return largestByArea(playingVisible);
    const visible = all.filter(isElementVisible);
    if (visible.length) return largestByArea(visible);
    if (video && video.isConnected) return video;
    return all[0];
  }

  // Capture-phase mouseover so we see events even if the page stops propagation.
  // Fast path: only inspect when the cursor is on or inside a <video>.  A naive
  // `querySelector("video")` fallback would scan the whole document on every
  // mouse move over unrelated elements, which is expensive on YouTube's DOM.
  document.addEventListener("mouseover", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const v = t.tagName === "VIDEO" ? t : t.closest("video");
    if (v && v.isConnected) lastHoveredVideo = v;
  }, true);

  // --- Custom keyboard shortcuts ---

  const SC = self.VSC_SHORTCUTS;
  let shortcutSettings = SC ? SC.normalizeSettings(null) : null;

  function loadShortcutSettings() {
    if (!SC || !contextValid()) return;
    chrome.storage.local.get(SC.STORAGE_KEY, (result) => {
      shortcutSettings = SC.normalizeSettings(result[SC.STORAGE_KEY]);
      applyOverlayVisibility();
    });
  }

  if (SC && contextValid()) {
    loadShortcutSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[SC.STORAGE_KEY]) return;
      shortcutSettings = SC.normalizeSettings(changes[SC.STORAGE_KEY].newValue);
      applyOverlayVisibility();
    });
  }

  function persistShortcutSettings() {
    if (!SC || !contextValid() || !shortcutSettings) return;
    chrome.storage.local.set({ [SC.STORAGE_KEY]: shortcutSettings });
  }

  function clampVolume(v) {
    return Math.max(0, Math.min(1, v));
  }

  function clampRate(r) {
    return Math.max(0.0625, Math.min(16, r));
  }

  function getPlayer() {
    return document.getElementById("movie_player") || document.querySelector(".html5-video-player");
  }

  function clickPlayerButton(selector) {
    const btn = document.querySelector(selector);
    if (btn) btn.click();
    return !!btn;
  }

  // --- Action handlers ---

  const actionHandlers = {
    "play-pause": () => {
      const v = getActiveVideo();
      if (!v) return;
      if (v.paused) v.play().catch(() => {}); else v.pause();
    },
    "rewind": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const step = Number.isFinite(b.value) ? b.value : shortcutSettings.rewindStep;
      v.currentTime = Math.max(0, v.currentTime - step);
    },
    "advance": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const step = Number.isFinite(b.value) ? b.value : shortcutSettings.advanceStep;
      const dur = v.duration || Infinity;
      v.currentTime = Math.min(dur, v.currentTime + step);
    },
    "frame-forward": () => {
      const v = getActiveVideo();
      if (!v) return;
      if (!v.paused) v.pause();
      v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 1 / 30);
    },
    "frame-back": () => {
      const v = getActiveVideo();
      if (!v) return;
      if (!v.paused) v.pause();
      v.currentTime = Math.max(0, v.currentTime - 1 / 30);
    },
    "speed-down": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const step = Number.isFinite(b && b.value) ? b.value : shortcutSettings.speedStep;
      v.playbackRate = clampRate(v.playbackRate - step);
    },
    "speed-up": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const step = Number.isFinite(b && b.value) ? b.value : shortcutSettings.speedStep;
      v.playbackRate = clampRate(v.playbackRate + step);
    },
    "speed-reset": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const target = Number.isFinite(b.value) ? b.value : 1;
      v.playbackRate = clampRate(target);
    },
    "speed-preferred": (b) => {
      const v = getActiveVideo();
      if (!v) return;
      const target = Number.isFinite(b.value) ? b.value : shortcutSettings.preferredSpeed;
      v.playbackRate = clampRate(target);
    },
    "volume-up": () => {
      const v = getActiveVideo();
      if (!v) return;
      v.muted = false;
      v.volume = clampVolume(v.volume + shortcutSettings.volumeStep);
    },
    "volume-down": () => {
      const v = getActiveVideo();
      if (!v) return;
      v.volume = clampVolume(v.volume - shortcutSettings.volumeStep);
    },
    "mute": () => {
      const v = getActiveVideo();
      if (!v) return;
      v.muted = !v.muted;
    },
    "fullscreen": () => {
      const v = getActiveVideo();
      // Prefer YouTube's own fullscreen button when acting on the main player.
      if (v === video && clickPlayerButton(".ytp-fullscreen-button")) return;
      const target = (v && v.closest(".html5-video-player")) || getPlayer() || v;
      if (!target) return;
      if (!document.fullscreenElement) target.requestFullscreen?.();
      else document.exitFullscreen?.();
    },
    "captions": () => {
      clickPlayerButton(".ytp-subtitles-button");
    },
    "overlay-toggle": () => {
      if (!shortcutSettings) return;
      shortcutSettings.showSpeedOverlay = shortcutSettings.showSpeedOverlay === false;
      persistShortcutSettings();
      applyOverlayVisibility();
    },
    "loop-toggle": () => {
      const vid = getVideoId();
      if (!vid || !contextValid()) return;
      const key = storageKey(vid);
      chrome.storage.local.get(key, (result) => {
        const data = result[key];
        if (!data || !data.segments || data.segments.length === 0) return;
        data.enabled = !data.enabled;
        chrome.storage.local.set({ [key]: data }, () => {
          enabled = data.enabled;
          if (enabled && video) {
            currentSegmentIndex = 0;
            video.currentTime = data.segments[0].start;
            if (video.paused) video.play();
          }
        });
      });
    },
    "segment-next": () => {
      if (!video || segments.length === 0) return;
      currentSegmentIndex = (currentSegmentIndex + 1) % segments.length;
      video.currentTime = segments[currentSegmentIndex].start;
      if (video.paused) video.play();
    },
    "segment-prev": () => {
      if (!video || segments.length === 0) return;
      currentSegmentIndex = (currentSegmentIndex - 1 + segments.length) % segments.length;
      video.currentTime = segments[currentSegmentIndex].start;
      if (video.paused) video.play();
    },
    "segment-restart": () => {
      if (!video || segments.length === 0) return;
      const seg = segments[currentSegmentIndex] || segments[0];
      if (seg) video.currentTime = seg.start;
    },
    "marker-a": () => {
      if (!video || !shortcutSettings) return;
      shortcutSettings.markers = shortcutSettings.markers || { a: null, b: null };
      shortcutSettings.markers.a = video.currentTime;
      persistShortcutSettings();
    },
    "marker-b": () => {
      if (!video || !shortcutSettings) return;
      shortcutSettings.markers = shortcutSettings.markers || { a: null, b: null };
      const a = shortcutSettings.markers.a;
      const b = video.currentTime;
      if (a == null) {
        shortcutSettings.markers.a = b;
        persistShortcutSettings();
        return;
      }
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      if (end - start < 0.05) {
        persistShortcutSettings();
        return;
      }
      const vid = getVideoId();
      if (!vid || !contextValid()) return;
      const key = storageKey(vid);
      chrome.storage.local.get(key, (result) => {
        const existing = result[key] || { enabled: true, segments: [], raw: "" };
        const segs = Array.isArray(existing.segments) ? existing.segments.slice() : [];
        segs.push({ start, end });
        segs.sort((x, y) => x.start - y.start);
        const raw = segs
          .map((s) => `${formatMarkerTime(s.start)}-${formatMarkerTime(s.end)}`)
          .join(", ");
        const next = { enabled: existing.enabled !== false, segments: segs, raw };
        chrome.storage.local.set({ [key]: next }, () => {
          shortcutSettings.markers = { a: null, b: null };
          persistShortcutSettings();
          loadSegments(vid);
        });
      });
    },
    "marker-jump": () => {
      if (!video || !shortcutSettings || !shortcutSettings.markers) return;
      const a = shortcutSettings.markers.a;
      if (a != null) video.currentTime = a;
    },
    "shorts-auto-scroll": () => {
      if (!contextValid()) return;
      chrome.storage.local.get("shorts_auto_scroll", (res) => {
        chrome.storage.local.set({ shorts_auto_scroll: !(res.shorts_auto_scroll === true) });
      });
    },
    "shorts-next": () => {
      if (!isShortsPage()) return;
      const btn = getShortsNextButton();
      if (btn) btn.click();
    },
    "shorts-prev": () => {
      if (!isShortsPage()) return;
      const btn = getShortsPrevButton();
      if (btn) btn.click();
    },
    "open-options": () => {
      if (!contextValid()) return;
      try { chrome.runtime.sendMessage({ type: "open-options" }); } catch {}
    },
  };

  function formatMarkerTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  // --- Speed overlay ---

  let speedOverlay = null;
  let speedOverlayStylesInjected = false;

  function injectOverlayStyles() {
    if (speedOverlayStylesInjected) return;
    speedOverlayStylesInjected = true;
    const style = document.createElement("style");
    style.setAttribute("data-vsc-overlay", "1");
    style.textContent = `
      .vsc-speed-overlay {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 60;
        padding: 2px 7px;
        background: rgba(0, 0, 0, 0.55);
        color: rgba(255, 255, 255, 0.82);
        font: 600 11px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        letter-spacing: 0.4px;
        border-radius: 3px;
        pointer-events: none;
        user-select: none;
        opacity: 0.45;
        transition: opacity 0.15s ease;
      }
      .html5-video-player:hover .vsc-speed-overlay {
        opacity: 0.8;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function formatSpeed(rate) {
    const n = Number(rate || 1);
    if (!Number.isFinite(n)) return "1.00x";
    return (n >= 10 ? n.toFixed(1) : n.toFixed(2)) + "x";
  }

  function applyOverlayVisibility() {
    if (!shortcutSettings || shortcutSettings.showSpeedOverlay === false) {
      removeSpeedOverlay();
    } else {
      ensureSpeedOverlay();
    }
  }

  function ensureSpeedOverlay() {
    if (!shortcutSettings || shortcutSettings.showSpeedOverlay === false) return;
    if (!video) return;
    injectOverlayStyles();

    const container = getPlayer() || video.parentElement;
    if (!container) return;

    const computedPos = getComputedStyle(container).position;
    if (computedPos === "static") {
      container.style.position = "relative";
    }

    if (!speedOverlay) {
      speedOverlay = document.createElement("div");
      speedOverlay.className = "vsc-speed-overlay";
    }
    if (speedOverlay.parentElement !== container) {
      container.appendChild(speedOverlay);
    }
    updateSpeedOverlayText();
  }

  function removeSpeedOverlay() {
    if (speedOverlay && speedOverlay.parentElement) {
      speedOverlay.parentElement.removeChild(speedOverlay);
    }
  }

  function updateSpeedOverlayText() {
    if (!speedOverlay || !video) return;
    speedOverlay.textContent = formatSpeed(video.playbackRate);
  }

  function onRateChange() {
    updateSpeedOverlayText();
  }

  // --- Dispatcher ---

  function onShortcutKeydown(e) {
    if (!SC || !shortcutSettings || shortcutSettings.enabled === false) return;
    if (!shortcutSettings.bindings || shortcutSettings.bindings.length === 0) return;
    if (shortcutSettings.ignoreInInputs !== false && SC.isTypingTarget(e.target)) return;

    for (const binding of shortcutSettings.bindings) {
      if (!SC.matchBinding(e, binding)) continue;
      const handler = actionHandlers[binding.action];
      if (!handler) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      try { handler(binding); } catch (err) { /* swallow */ }
      return;
    }
  }

  document.addEventListener("keydown", onShortcutKeydown, true);

  // --- Initial setup ---

  findAndAttachVideo();
  onNavigate();
})();
