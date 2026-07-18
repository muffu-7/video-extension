(function () {
  "use strict";

  const KB = self.VSC_KEYBINDINGS;
  if (!KB) return;

  let settings = KB.normalizeSettings(null);
  let shortcutsEnabled = false;
  const generatedEvents = new WeakSet();
  const activeRemaps = new Map();

  function contextValid() {
    try { return !!chrome.runtime.id; } catch { return false; }
  }

  function loadSettings() {
    if (!contextValid()) return;
    chrome.storage.local.get([KB.STORAGE_KEY, KB.SHORTCUTS_STORAGE_KEY], (result) => {
      settings = KB.normalizeSettings(result[KB.STORAGE_KEY]);
      shortcutsEnabled = result[KB.SHORTCUTS_STORAGE_KEY]
        ? result[KB.SHORTCUTS_STORAGE_KEY].enabled !== false
        : true;
    });
  }

  function replacementTarget(e) {
    if (!settings || settings.enabled !== true) return null;
    if (shortcutsEnabled) return null;
    if (settings.ignoreInInputs !== false && KB.isTypingTarget(e.target)) return null;

    for (const binding of settings.bindings || []) {
      if (KB.matchKey(e, binding.from)) return binding;
    }
    return null;
  }

  function dispatchReplacement(original, binding, type) {
    const target = original.target || document.activeElement || document;
    const init = KB.eventInitForSpec(binding.to, original);
    const event = new KeyboardEvent(type, init);

    // Some sites still read legacy keyCode/which, which KeyboardEvent init
    // does not reliably expose in every browser.
    const keyCode = init.keyCode || 0;
    try {
      Object.defineProperty(event, "keyCode", { get: () => keyCode });
      Object.defineProperty(event, "which", { get: () => keyCode });
    } catch {}

    generatedEvents.add(event);
    return target.dispatchEvent(event);
  }

  function isScrollable(el, axis) {
    if (!el || el === document || el === document.documentElement || el === document.body) return false;
    const style = getComputedStyle(el);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    if (!/(auto|scroll|overlay)/.test(overflow)) return false;
    return axis === "x"
      ? el.scrollWidth > el.clientWidth
      : el.scrollHeight > el.clientHeight;
  }

  function nearestScrollable(start, axis) {
    let el = start && start.nodeType === Node.ELEMENT_NODE ? start : start && start.parentElement;
    while (el) {
      if (isScrollable(el, axis)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollByAction(target, action, sensitivity) {
    const viewportStep = Math.max(120, Math.floor(window.innerHeight * 0.85));
    const factor = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 1;
    const lineStep = 80 * factor;
    const pageStep = viewportStep * factor;
    let axis = "y";
    let dx = 0;
    let dy = 0;

    if (action === "scroll-up") dy = -lineStep;
    else if (action === "scroll-down") dy = lineStep;
    else if (action === "scroll-left") { axis = "x"; dx = -lineStep; }
    else if (action === "scroll-right") { axis = "x"; dx = lineStep; }
    else if (action === "page-up") dy = -pageStep;
    else if (action === "page-down") dy = pageStep;
    else if (action === "scroll-top") dy = -Number.MAX_SAFE_INTEGER;
    else if (action === "scroll-bottom") dy = Number.MAX_SAFE_INTEGER;
    else return false;

    const scroller = nearestScrollable(target, axis);
    if (!scroller) return false;

    if (action === "scroll-top") scroller.scrollTo({ top: 0, behavior: "auto" });
    else if (action === "scroll-bottom") scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
    else scroller.scrollBy({ left: dx, top: dy, behavior: "auto" });
    return true;
  }

  function runBindingAction(original, binding, type) {
    if (binding.action === "remap") {
      dispatchReplacement(original, binding, type);
      return;
    }
    if (type !== "keydown") return;
    scrollByAction(original.target, binding.action, binding.sensitivity);
  }

  function onKeydown(e) {
    if (generatedEvents.has(e)) return;
    const binding = replacementTarget(e);
    if (!binding) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    activeRemaps.set(KB.keySignature(binding.from), binding);
    runBindingAction(e, binding, "keydown");
  }

  function onKeyup(e) {
    if (generatedEvents.has(e)) return;
    const sig = KB.keySignature(KB.specFromKeyboardEvent(e));
    const binding = activeRemaps.get(sig) || replacementTarget(e);
    if (!binding) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    activeRemaps.delete(KB.keySignature(binding.from));
    runBindingAction(e, binding, "keyup");
  }

  if (contextValid()) {
    loadSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[KB.STORAGE_KEY]) {
        settings = KB.normalizeSettings(changes[KB.STORAGE_KEY].newValue);
        activeRemaps.clear();
      }
      if (changes[KB.SHORTCUTS_STORAGE_KEY]) {
        const next = changes[KB.SHORTCUTS_STORAGE_KEY].newValue;
        shortcutsEnabled = next ? next.enabled !== false : true;
      }
    });
  }

  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("keyup", onKeyup, true);
})();
