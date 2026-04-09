(function () {
  "use strict";

  let video = null;
  let segments = [];
  let enabled = false;
  let currentSegmentIndex = 0;
  let lastVideoId = null;
  let fallbackInterval = null;

  // --- Helpers ---

  function getVideoId() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get("v") || null;
    } catch {
      return null;
    }
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
    fallbackInterval = setInterval(enforce, 200);
  }

  function findAndAttachVideo() {
    const el = document.querySelector("video");
    if (el && el !== video) {
      attachVideo(el);
    }
  }

  // --- Load segments from storage for a given video ---

  function loadSegments(videoId) {
    if (!videoId) {
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

  // --- SPA navigation handling ---

  function onNavigate() {
    const videoId = getVideoId();
    if (videoId === lastVideoId) return;
    lastVideoId = videoId;
    currentSegmentIndex = 0;

    findAndAttachVideo();
    loadSegments(videoId);
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "get-video-id") {
      sendResponse({
        videoId: getVideoId(),
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
  });

  // --- Initial setup ---

  findAndAttachVideo();
  onNavigate();
})();
