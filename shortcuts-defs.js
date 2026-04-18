// Shared shortcuts catalog + helpers.
// Loaded as the first file in content_scripts (so content.js can use it)
// and via a <script> tag in options.html / popup.html.

(function (root) {
  "use strict";

  const STORAGE_KEY = "custom_shortcuts";

  const ACTIONS = [
    { id: "play-pause",        label: "Play / Pause",              group: "Playback", valueType: "none" },
    { id: "rewind",            label: "Rewind",                    group: "Playback", valueType: "seconds", defaultValue: 5,  valueSuffix: "s" },
    { id: "advance",           label: "Advance",                   group: "Playback", valueType: "seconds", defaultValue: 5,  valueSuffix: "s" },
    { id: "frame-back",        label: "Frame step backward",       group: "Playback", valueType: "none" },
    { id: "frame-forward",     label: "Frame step forward",        group: "Playback", valueType: "none" },

    { id: "speed-down",        label: "Decrease speed",            group: "Speed",    valueType: "number",  defaultValue: 0.05, valueSuffix: "x" },
    { id: "speed-up",          label: "Increase speed",            group: "Speed",    valueType: "number",  defaultValue: 0.05, valueSuffix: "x" },
    { id: "speed-reset",       label: "Reset speed (1x)",          group: "Speed",    valueType: "number",  defaultValue: 1,    valueSuffix: "x" },
    { id: "speed-preferred",   label: "Preferred speed",           group: "Speed",    valueType: "number",  defaultValue: 2,    valueSuffix: "x" },

    { id: "volume-up",         label: "Volume up",                 group: "Audio",    valueType: "none" },
    { id: "volume-down",       label: "Volume down",               group: "Audio",    valueType: "none" },
    { id: "mute",              label: "Toggle mute",               group: "Audio",    valueType: "none" },

    { id: "fullscreen",        label: "Toggle fullscreen",         group: "Display",  valueType: "none" },
    { id: "captions",          label: "Toggle captions",           group: "Display",  valueType: "none" },
    { id: "overlay-toggle",    label: "Toggle speed overlay",      group: "Display",  valueType: "none" },

    { id: "loop-toggle",       label: "Toggle segment loop",       group: "Segments", valueType: "none" },
    { id: "segment-next",      label: "Next segment",              group: "Segments", valueType: "none" },
    { id: "segment-prev",      label: "Previous segment",          group: "Segments", valueType: "none" },
    { id: "segment-restart",   label: "Restart current segment",   group: "Segments", valueType: "none" },
    { id: "marker-a",          label: "Set marker A (start)",      group: "Segments", valueType: "none" },
    { id: "marker-b",          label: "Set marker B (creates A\u2192B)", group: "Segments", valueType: "none" },
    { id: "marker-jump",       label: "Jump to marker A",          group: "Segments", valueType: "none" },

    { id: "shorts-auto-scroll", label: "Toggle Shorts auto-scroll", group: "Shorts",  valueType: "none" },
    { id: "shorts-next",       label: "Next Short",                group: "Shorts",   valueType: "none" },
    { id: "shorts-prev",       label: "Previous Short",            group: "Shorts",   valueType: "none" },

    { id: "open-options",      label: "Open shortcut settings",    group: "Misc",     valueType: "none" },
  ];

  const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

  function mkBind(id, action, code, key, value) {
    return {
      id,
      action,
      value: value != null ? value : null,
      code,
      key,
      ctrl: false,
      shift: code === "ShiftLeft" || code === "ShiftRight",
      alt: false,
      meta: false,
    };
  }

  const DEFAULT_BINDINGS = [
    mkBind("default-shorts-next",  "shorts-next",  "ShiftLeft",    "Shift"),
    mkBind("default-shorts-prev",  "shorts-prev",  "Tab",          "Tab"),

    mkBind("default-play-pause-a", "play-pause",   "KeyA",         "A"),
    mkBind("default-play-pause-p", "play-pause",   "KeyP",         "P"),

    mkBind("default-rewind-q",     "rewind",       "KeyQ",         "Q", 5),
    mkBind("default-advance-w",    "advance",      "KeyW",         "W", 5),
    mkBind("default-rewind-z",     "rewind",       "KeyZ",         "Z", 5),
    mkBind("default-advance-x",    "advance",      "KeyX",         "X", 5),
    mkBind("default-rewind-lb",    "rewind",       "BracketLeft",  "[", 5),
    mkBind("default-advance-rb",   "advance",      "BracketRight", "]", 5),
    mkBind("default-rewind-sc",    "rewind",       "Semicolon",    ";", 3),
    mkBind("default-advance-qt",   "advance",      "Quote",        "'", 3),

    mkBind("default-speed-down-s", "speed-down",   "KeyS",         "S", 0.05),
    mkBind("default-speed-up-d",   "speed-up",     "KeyD",         "D", 0.05),

    mkBind("default-overlay-v",    "overlay-toggle", "KeyV",       "V"),
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,
    ignoreInInputs: true,
    preferredSpeed: 2,
    rewindStep: 5,
    advanceStep: 5,
    speedStep: 0.05,
    volumeStep: 0.1,
    showSpeedOverlay: true,
    markers: { a: null, b: null },
    bindings: DEFAULT_BINDINGS,
  };

  function isModifierCode(code) {
    return code === "ShiftLeft" || code === "ShiftRight"
        || code === "ControlLeft" || code === "ControlRight"
        || code === "AltLeft" || code === "AltRight"
        || code === "MetaLeft" || code === "MetaRight"
        || code === "OSLeft" || code === "OSRight";
  }

  function isPureModifierKey(key) {
    return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "OS";
  }

  function matchBinding(e, b) {
    if (!b || !b.code) return false;
    if (e.code !== b.code) return false;
    if (isModifierCode(b.code)) return true;
    return !!e.ctrlKey  === !!b.ctrl
        && !!e.shiftKey === !!b.shift
        && !!e.altKey   === !!b.alt
        && !!e.metaKey  === !!b.meta;
  }

  function bindingSignature(b) {
    if (!b || !b.code) return "";
    if (isModifierCode(b.code)) return b.code;
    return [
      b.code,
      b.ctrl ? "C" : "-",
      b.shift ? "S" : "-",
      b.alt ? "A" : "-",
      b.meta ? "M" : "-",
    ].join(":");
  }

  const CODE_LABELS = {
    ShiftLeft: "Shift (L)", ShiftRight: "Shift (R)",
    ControlLeft: "Ctrl (L)", ControlRight: "Ctrl (R)",
    AltLeft: "Alt (L)", AltRight: "Alt (R)",
    MetaLeft: "Cmd (L)", MetaRight: "Cmd (R)",
    Tab: "Tab", Space: "Space", Enter: "Enter",
    Escape: "Esc", Backspace: "Backspace", Delete: "Del",
    ArrowLeft: "\u2190", ArrowRight: "\u2192", ArrowUp: "\u2191", ArrowDown: "\u2193",
    Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
    Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]",
    Semicolon: ";", Quote: "'",
    Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
    CapsLock: "CapsLock",
  };

  function prettyCode(code) {
    if (!code) return "";
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return "Num" + code.slice(6);
    if (/^F[0-9]+$/.test(code)) return code;
    return CODE_LABELS[code] || code;
  }

  function formatBinding(b) {
    if (!b || !b.code) return "Not set";
    if (isModifierCode(b.code)) return prettyCode(b.code);
    const parts = [];
    if (b.ctrl)  parts.push("Ctrl");
    if (b.alt)   parts.push("Alt");
    if (b.shift) parts.push("Shift");
    if (b.meta)  parts.push("Cmd");
    parts.push(prettyCode(b.code));
    return parts.join(" + ");
  }

  function normalizeSettings(raw) {
    const out = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    out.markers = Object.assign({ a: null, b: null }, (raw && raw.markers) || {});
    if (!Array.isArray(out.bindings)) out.bindings = [];
    out.bindings = out.bindings.map(normalizeBinding).filter(Boolean);
    return out;
  }

  function normalizeBinding(b) {
    if (!b || !b.action || !b.code) return null;
    return {
      id: b.id || ("b_" + Math.random().toString(36).slice(2, 10)),
      action: b.action,
      value: b.value != null ? Number(b.value) : null,
      code: String(b.code),
      key: b.key || "",
      ctrl: !!b.ctrl,
      shift: !!b.shift,
      alt: !!b.alt,
      meta: !!b.meta,
    };
  }

  function isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return false;
  }

  root.VSC_SHORTCUTS = {
    STORAGE_KEY,
    ACTIONS,
    ACTION_BY_ID,
    DEFAULT_BINDINGS,
    DEFAULT_SETTINGS,
    isModifierCode,
    isPureModifierKey,
    matchBinding,
    bindingSignature,
    prettyCode,
    formatBinding,
    normalizeSettings,
    normalizeBinding,
    isTypingTarget,
  };
})(typeof self !== "undefined" ? self : this);
