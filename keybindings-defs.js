// Shared key remapping helpers.
// Loaded by the global keybinding content script and options/popup pages.

(function (root) {
  "use strict";

  const STORAGE_KEY = "custom_keybindings";
  const SHORTCUTS_STORAGE_KEY = "custom_shortcuts";

  const DEFAULT_SETTINGS = {
    enabled: false,
    ignoreInInputs: true,
    bindings: [],
  };

  const ACTIONS = [
    { id: "remap", label: "Remap to key", needsTarget: true, defaultSensitivity: null },
    { id: "scroll-up", label: "Scroll up", needsTarget: false, defaultSensitivity: 1 },
    { id: "scroll-down", label: "Scroll down", needsTarget: false, defaultSensitivity: 1 },
    { id: "scroll-left", label: "Scroll left", needsTarget: false, defaultSensitivity: 1 },
    { id: "scroll-right", label: "Scroll right", needsTarget: false, defaultSensitivity: 1 },
    { id: "page-up", label: "Page up", needsTarget: false, defaultSensitivity: 1 },
    { id: "page-down", label: "Page down", needsTarget: false, defaultSensitivity: 1 },
    { id: "scroll-top", label: "Scroll to top", needsTarget: false, defaultSensitivity: null },
    { id: "scroll-bottom", label: "Scroll to bottom", needsTarget: false, defaultSensitivity: null },
  ];

  const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

  const KEY_PROPS = [
    "code", "key", "ctrl", "shift", "alt", "meta",
    "location", "keyCode", "which",
  ];

  const KEY_CODES = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    ShiftLeft: 16,
    ShiftRight: 16,
    ControlLeft: 17,
    ControlRight: 17,
    AltLeft: 18,
    AltRight: 18,
    Pause: 19,
    CapsLock: 20,
    Escape: 27,
    Space: 32,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Insert: 45,
    Delete: 46,
    MetaLeft: 91,
    MetaRight: 92,
    ContextMenu: 93,
    Semicolon: 186,
    Equal: 187,
    Comma: 188,
    Minus: 189,
    Period: 190,
    Slash: 191,
    Backquote: 192,
    BracketLeft: 219,
    Backslash: 220,
    BracketRight: 221,
    Quote: 222,
  };

  const CODE_LABELS = {
    ShiftLeft: "Shift (L)", ShiftRight: "Shift (R)",
    ControlLeft: "Ctrl (L)", ControlRight: "Ctrl (R)",
    AltLeft: "Alt (L)", AltRight: "Alt (R)",
    MetaLeft: "Cmd (L)", MetaRight: "Cmd (R)",
    Tab: "Tab", Space: "Space", Enter: "Enter",
    Escape: "Esc", Backspace: "Backspace", Delete: "Del",
    ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down",
    Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
    Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]",
    Semicolon: ";", Quote: "'",
    Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
    CapsLock: "CapsLock",
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

  function prettyCode(code) {
    if (!code) return "";
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return "Num" + code.slice(6);
    if (/^F[0-9]+$/.test(code)) return code;
    return CODE_LABELS[code] || code;
  }

  function codeToKey(code, fallback) {
    if (!code) return fallback || "";
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (code === "Space") return " ";
    if (code === "Esc") return "Escape";
    if (CODE_LABELS[code]) {
      const label = CODE_LABELS[code];
      if (label === "Up") return "ArrowUp";
      if (label === "Down") return "ArrowDown";
      if (label === "Left") return "ArrowLeft";
      if (label === "Right") return "ArrowRight";
      if (label === "Del") return "Delete";
      if (label === "Esc") return "Escape";
      if (!label.includes("(")) return label;
    }
    return fallback || code;
  }

  function keyCodeFor(code, key) {
    if (KEY_CODES[code] != null) return KEY_CODES[code];
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
    if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
    if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return 111 + Number(code.slice(1));
    if (typeof key === "string" && key.length === 1) return key.toUpperCase().charCodeAt(0);
    return 0;
  }

  function normalizeKeySpec(raw) {
    if (!raw || !raw.code) return null;
    const code = String(raw.code);
    const key = raw.key != null && raw.key !== "" ? String(raw.key) : codeToKey(code, "");
    return {
      code,
      key,
      ctrl: !!raw.ctrl,
      shift: !!raw.shift,
      alt: !!raw.alt,
      meta: !!raw.meta,
      location: Number.isFinite(Number(raw.location)) ? Number(raw.location) : 0,
      keyCode: Number.isFinite(Number(raw.keyCode)) ? Number(raw.keyCode) : keyCodeFor(code, key),
      which: Number.isFinite(Number(raw.which)) ? Number(raw.which) : keyCodeFor(code, key),
    };
  }

  function normalizeBinding(raw) {
    if (!raw) return null;
    const from = normalizeKeySpec(raw.from);
    if (!from) return null;
    const action = ACTION_BY_ID[raw.action] ? raw.action : "remap";
    const to = action === "remap" ? normalizeKeySpec(raw.to) : null;
    if (action === "remap" && !to) return null;
    const sensitivity = Number(raw.sensitivity);
    return {
      id: raw.id || ("kb_" + Math.random().toString(36).slice(2, 10)),
      action,
      sensitivity: Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : null,
      from,
      to,
    };
  }

  function normalizeSettings(raw) {
    const out = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    if (!Array.isArray(out.bindings)) out.bindings = [];
    out.bindings = out.bindings.map(normalizeBinding).filter(Boolean);
    out.enabled = !!out.enabled;
    out.ignoreInInputs = out.ignoreInInputs !== false;
    return out;
  }

  function keySignature(k) {
    if (!k || !k.code) return "";
    if (isModifierCode(k.code)) return k.code;
    return [
      k.code,
      k.ctrl ? "C" : "-",
      k.shift ? "S" : "-",
      k.alt ? "A" : "-",
      k.meta ? "M" : "-",
    ].join(":");
  }

  function matchKey(e, k) {
    if (!k || e.code !== k.code) return false;
    if (isModifierCode(k.code)) return true;
    return !!e.ctrlKey  === !!k.ctrl
        && !!e.shiftKey === !!k.shift
        && !!e.altKey   === !!k.alt
        && !!e.metaKey  === !!k.meta;
  }

  function formatKey(k) {
    if (!k || !k.code) return "Not set";
    if (isModifierCode(k.code)) return prettyCode(k.code);
    const parts = [];
    if (k.ctrl) parts.push("Ctrl");
    if (k.alt) parts.push("Alt");
    if (k.shift) parts.push("Shift");
    if (k.meta) parts.push("Cmd");
    parts.push(prettyCode(k.code));
    return parts.join(" + ");
  }

  function specFromKeyboardEvent(e) {
    const spec = {
      code: e.code,
      key: e.key,
      location: e.location || 0,
      keyCode: e.keyCode || keyCodeFor(e.code, e.key),
      which: e.which || keyCodeFor(e.code, e.key),
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    };
    if (!isPureModifierKey(e.key)) {
      spec.ctrl = !!e.ctrlKey;
      spec.shift = !!e.shiftKey;
      spec.alt = !!e.altKey;
      spec.meta = !!e.metaKey;
    }
    return spec;
  }

  function eventInitForSpec(spec, baseEvent) {
    const keyCode = spec.keyCode || keyCodeFor(spec.code, spec.key);
    return {
      key: spec.key || codeToKey(spec.code, ""),
      code: spec.code,
      location: spec.location || 0,
      ctrlKey: !!spec.ctrl,
      shiftKey: !!spec.shift,
      altKey: !!spec.alt,
      metaKey: !!spec.meta,
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: !!(baseEvent && baseEvent.repeat),
      keyCode,
      which: spec.which || keyCode,
    };
  }

  function isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  root.VSC_KEYBINDINGS = {
    STORAGE_KEY,
    SHORTCUTS_STORAGE_KEY,
    DEFAULT_SETTINGS,
    ACTIONS,
    ACTION_BY_ID,
    KEY_PROPS,
    isModifierCode,
    isPureModifierKey,
    normalizeSettings,
    normalizeBinding,
    normalizeKeySpec,
    keySignature,
    matchKey,
    formatKey,
    specFromKeyboardEvent,
    eventInitForSpec,
    isTypingTarget,
  };
})(typeof self !== "undefined" ? self : this);
