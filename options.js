(function () {
  "use strict";

  const defs = self.VSC_SHORTCUTS;
  const keyDefs = self.VSC_KEYBINDINGS;
  const {
    STORAGE_KEY,
    ACTIONS,
    ACTION_BY_ID,
    DEFAULT_SETTINGS,
    DEFAULT_BINDINGS,
    isPureModifierKey,
    bindingSignature,
    formatBinding,
    normalizeSettings,
  } = defs;
  const {
    STORAGE_KEY: KEYBINDINGS_STORAGE_KEY,
    DEFAULT_SETTINGS: KEYBINDINGS_DEFAULT_SETTINGS,
    ACTIONS: KEYBINDING_ACTIONS,
    ACTION_BY_ID: KEYBINDING_ACTION_BY_ID,
    keySignature,
    formatKey,
    normalizeSettings: normalizeKeybindingSettings,
    specFromKeyboardEvent,
    isPureModifierKey: isPureKeybindingModifier,
  } = keyDefs;

  const rowsEl = document.getElementById("rows");
  const addBtn = document.getElementById("add-btn");
  const saveBtn = document.getElementById("save-btn");
  const resetBtn = document.getElementById("reset-btn");
  const emptyNotice = document.getElementById("empty-notice");
  const saveStatus = document.getElementById("save-status");

  const optEnabled = document.getElementById("opt-enabled");
  const optIgnoreInputs = document.getElementById("opt-ignore-inputs");
  const optShowOverlay = document.getElementById("opt-show-overlay");
  const optPreferredSpeed = document.getElementById("opt-preferred-speed");
  const optRewindStep = document.getElementById("opt-rewind-step");
  const optAdvanceStep = document.getElementById("opt-advance-step");
  const optSpeedStep = document.getElementById("opt-speed-step");
  const optVolumeStep = document.getElementById("opt-volume-step");
  const kbEnabled = document.getElementById("kb-enabled");
  const kbIgnoreInputs = document.getElementById("kb-ignore-inputs");
  const kbRowsEl = document.getElementById("kb-rows");
  const kbAddBtn = document.getElementById("kb-add-btn");
  const kbEmptyNotice = document.getElementById("kb-empty-notice");

  // Editable working copy of the bindings list.
  let draft = { bindings: [] };
  let keybindingDraft = { bindings: [] };
  let capturingRowId = null;
  let keybindingCapture = null;

  function newId() {
    return "b_" + Math.random().toString(36).slice(2, 10);
  }

  function cloneBindings(bindings) {
    return bindings.map((b) => Object.assign({}, b));
  }

  function groupedActions() {
    const groups = new Map();
    for (const a of ACTIONS) {
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group).push(a);
    }
    return groups;
  }

  function buildActionSelect(selectedId) {
    const sel = document.createElement("select");
    const groups = groupedActions();
    for (const [group, items] of groups) {
      const og = document.createElement("optgroup");
      og.label = group;
      for (const a of items) {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        if (a.id === selectedId) opt.selected = true;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
    return sel;
  }

  function detectConflicts() {
    const seen = new Map();
    const conflicts = new Set();
    for (const b of draft.bindings) {
      const sig = bindingSignature(b);
      if (!sig) continue;
      if (seen.has(sig)) {
        conflicts.add(b.id);
        conflicts.add(seen.get(sig));
      } else {
        seen.set(sig, b.id);
      }
    }
    return conflicts;
  }

  function render() {
    rowsEl.innerHTML = "";
    const conflicts = detectConflicts();

    for (const b of draft.bindings) {
      rowsEl.appendChild(renderRow(b, conflicts.has(b.id)));
    }

    emptyNotice.hidden = draft.bindings.length > 0;

    updateSaveState();
  }

  function renderRow(b, hasConflict) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = b.id;

    // Action dropdown
    const select = buildActionSelect(b.action);
    select.addEventListener("change", () => {
      b.action = select.value;
      const act = ACTION_BY_ID[b.action];
      if (act && act.valueType !== "none" && (b.value == null || Number.isNaN(b.value))) {
        b.value = act.defaultValue != null ? act.defaultValue : 0;
      }
      if (act && act.valueType === "none") {
        b.value = null;
      }
      render();
    });
    row.appendChild(select);

    // Key capture pill
    const keyBtn = document.createElement("button");
    keyBtn.type = "button";
    keyBtn.className = "key-capture";
    if (capturingRowId === b.id) {
      keyBtn.classList.add("capturing");
      keyBtn.textContent = "Press a key\u2026";
    } else if (!b.code) {
      keyBtn.classList.add("unset");
      keyBtn.textContent = "Click to set key";
    } else {
      keyBtn.textContent = formatBinding(b);
    }
    if (hasConflict) keyBtn.classList.add("conflict");
    keyBtn.title = hasConflict
      ? "This key combo conflicts with another row."
      : "Click, then press the key(s) you want to bind.";
    keyBtn.addEventListener("click", () => startCapture(b.id));
    row.appendChild(keyBtn);

    // Value input (or placeholder)
    const act = ACTION_BY_ID[b.action];
    if (act && act.valueType && act.valueType !== "none") {
      const valWrap = document.createElement("div");
      valWrap.style.display = "flex";
      valWrap.style.alignItems = "center";
      valWrap.style.gap = "6px";

      const input = document.createElement("input");
      input.type = "number";
      input.step = act.valueType === "seconds" ? "1" : "0.05";
      input.min = "0";
      input.value = b.value != null ? String(b.value) : "";
      input.placeholder = act.defaultValue != null ? String(act.defaultValue) : "";
      input.addEventListener("change", () => {
        const v = parseFloat(input.value);
        b.value = Number.isNaN(v) ? null : v;
      });
      valWrap.appendChild(input);

      if (act.valueSuffix) {
        const suf = document.createElement("span");
        suf.textContent = act.valueSuffix;
        suf.style.color = "#666";
        suf.style.fontSize = "12px";
        valWrap.appendChild(suf);
      }
      row.appendChild(valWrap);
    } else {
      const none = document.createElement("span");
      none.className = "no-value";
      none.textContent = "\u2014";
      row.appendChild(none);
    }

    // Delete
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.innerHTML = "\u2715";
    del.title = "Delete this binding";
    del.addEventListener("click", () => {
      draft.bindings = draft.bindings.filter((x) => x.id !== b.id);
      if (capturingRowId === b.id) stopCapture();
      render();
    });
    row.appendChild(del);

    return row;
  }

  function cloneKeybindings(bindings) {
    return bindings.map((b) => ({
      id: b.id,
      action: b.action || "remap",
      sensitivity: b.sensitivity,
      from: Object.assign({}, b.from),
      to: b.to ? Object.assign({}, b.to) : null,
    }));
  }

  function detectKeybindingConflicts() {
    const seen = new Map();
    const conflicts = new Set();
    for (const b of keybindingDraft.bindings) {
      const sig = keySignature(b.from);
      if (!sig) continue;
      if (seen.has(sig)) {
        conflicts.add(b.id);
        conflicts.add(seen.get(sig));
      } else {
        seen.set(sig, b.id);
      }
    }
    return conflicts;
  }

  function renderKeybindings() {
    kbRowsEl.innerHTML = "";
    const conflicts = detectKeybindingConflicts();

    for (const b of keybindingDraft.bindings) {
      kbRowsEl.appendChild(renderKeybindingRow(b, conflicts.has(b.id)));
    }

    kbEmptyNotice.hidden = keybindingDraft.bindings.length > 0;
    updateSaveState();
  }

  function renderKeybindingRow(binding, hasConflict) {
    const row = document.createElement("div");
    row.className = "row keybinding-row";
    row.dataset.id = binding.id;

    row.appendChild(renderKeybindingCaptureButton(binding, "from", hasConflict));
    row.appendChild(renderKeybindingActionSelect(binding));
    row.appendChild(renderKeybindingValueControl(binding));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.innerHTML = "\u2715";
    del.title = "Delete this keybinding";
    del.addEventListener("click", () => {
      keybindingDraft.bindings = keybindingDraft.bindings.filter((x) => x.id !== binding.id);
      if (keybindingCapture && keybindingCapture.id === binding.id) stopKeybindingCapture();
      renderKeybindings();
    });
    row.appendChild(del);

    return row;
  }

  function renderKeybindingActionSelect(binding) {
    const select = document.createElement("select");
    select.className = "keybinding-action-select";
    const actionId = binding.action || "remap";
    for (const action of KEYBINDING_ACTIONS) {
      const opt = document.createElement("option");
      opt.value = action.id;
      opt.textContent = action.label;
      opt.selected = action.id === actionId;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      binding.action = select.value;
      const action = KEYBINDING_ACTION_BY_ID[binding.action];
      if (action && action.needsTarget) {
        binding.sensitivity = null;
      } else {
        binding.to = null;
        binding.sensitivity = action && action.defaultSensitivity != null
          ? action.defaultSensitivity
          : null;
      }
      renderKeybindings();
    });
    return select;
  }

  function renderKeybindingValueControl(binding) {
    const action = KEYBINDING_ACTION_BY_ID[binding.action || "remap"] || KEYBINDING_ACTION_BY_ID.remap;
    if (action.needsTarget) {
      return renderKeybindingCaptureButton(binding, "to", false);
    }
    if (action.defaultSensitivity == null) {
      const none = document.createElement("span");
      none.className = "no-value";
      none.textContent = "\u2014";
      return none;
    }

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.1";
    input.max = "10";
    input.step = "0.1";
    input.value = binding.sensitivity != null ? String(binding.sensitivity) : String(action.defaultSensitivity);
    input.title = "Scroll sensitivity multiplier";
    input.addEventListener("change", () => {
      const value = parseFloat(input.value);
      binding.sensitivity = Number.isFinite(value) && value > 0 ? value : action.defaultSensitivity;
      input.value = String(binding.sensitivity);
    });
    return input;
  }

  function renderKeybindingCaptureButton(binding, field, hasConflict) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key-capture";
    const active = keybindingCapture
      && keybindingCapture.id === binding.id
      && keybindingCapture.field === field;
    if (active) {
      btn.classList.add("capturing");
      btn.textContent = "Press a key\u2026";
    } else if (!binding[field] || !binding[field].code) {
      btn.classList.add("unset");
      btn.textContent = field === "from" ? "Source key" : "Replacement key";
    } else {
      btn.textContent = formatKey(binding[field]);
    }
    if (hasConflict) btn.classList.add("conflict");
    btn.title = field === "from"
      ? "Click, then press the key you want to replace."
      : "Click, then press the key this should act as.";
    btn.addEventListener("click", () => startKeybindingCapture(binding.id, field));
    return btn;
  }

  function updateSaveState() {
    const shortcutConflicts = detectConflicts();
    const keybindingConflicts = detectKeybindingConflicts();
    const hasShortcutConflict = shortcutConflicts.size > 0;
    const hasKeybindingConflict = keybindingConflicts.size > 0;
    saveBtn.disabled = hasShortcutConflict || hasKeybindingConflict;

    if (hasShortcutConflict) {
      showStatus("Two or more YouTube shortcuts share the same key combo. Resolve before saving.", "error");
    } else if (hasKeybindingConflict) {
      showStatus("Two or more website keybindings use the same source key. Resolve before saving.", "error");
    } else {
      clearStatus();
    }
  }

  // --- Key capture ---

  function startCapture(id) {
    if (keybindingCapture) stopKeybindingCapture();
    capturingRowId = id;
    render();
    window.addEventListener("keydown", onCaptureKeydown, true);
    window.addEventListener("blur", stopCapture, { once: true });
  }

  function stopCapture() {
    capturingRowId = null;
    window.removeEventListener("keydown", onCaptureKeydown, true);
    render();
  }

  function onCaptureKeydown(e) {
    if (!capturingRowId) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    // Escape cancels capture without changes
    if (e.key === "Escape") {
      stopCapture();
      return;
    }

    const b = draft.bindings.find((x) => x.id === capturingRowId);
    if (!b) {
      stopCapture();
      return;
    }

    b.code = e.code;
    b.key = e.key;
    // If the bound key IS a modifier, ignore modifier flags (match by code only).
    if (isPureModifierKey(e.key)) {
      b.ctrl = false;
      b.shift = false;
      b.alt = false;
      b.meta = false;
    } else {
      b.ctrl = !!e.ctrlKey;
      b.shift = !!e.shiftKey;
      b.alt = !!e.altKey;
      b.meta = !!e.metaKey;
    }
    stopCapture();
  }

  function startKeybindingCapture(id, field) {
    if (capturingRowId) stopCapture();
    keybindingCapture = { id, field };
    renderKeybindings();
    window.addEventListener("keydown", onKeybindingCaptureKeydown, true);
    window.addEventListener("blur", stopKeybindingCapture, { once: true });
  }

  function stopKeybindingCapture() {
    keybindingCapture = null;
    window.removeEventListener("keydown", onKeybindingCaptureKeydown, true);
    renderKeybindings();
  }

  function onKeybindingCaptureKeydown(e) {
    if (!keybindingCapture) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (e.key === "Escape") {
      stopKeybindingCapture();
      return;
    }

    const binding = keybindingDraft.bindings.find((x) => x.id === keybindingCapture.id);
    if (!binding) {
      stopKeybindingCapture();
      return;
    }

    const spec = specFromKeyboardEvent(e);
    if (isPureKeybindingModifier(e.key)) {
      spec.ctrl = false;
      spec.shift = false;
      spec.alt = false;
      spec.meta = false;
    }
    binding[keybindingCapture.field] = spec;
    stopKeybindingCapture();
  }

  // --- Status helpers ---

  function showStatus(msg, kind) {
    saveStatus.textContent = msg;
    saveStatus.className = "save-status " + (kind || "");
    saveStatus.hidden = false;
  }

  function clearStatus() {
    saveStatus.hidden = true;
    saveStatus.textContent = "";
  }

  // --- Add / Save / Reset ---

  addBtn.addEventListener("click", () => {
    const firstAction = ACTIONS[0];
    const b = {
      id: newId(),
      action: firstAction.id,
      value: firstAction.valueType !== "none" ? firstAction.defaultValue : null,
      code: "",
      key: "",
      ctrl: false, shift: false, alt: false, meta: false,
    };
    draft.bindings.push(b);
    render();
    startCapture(b.id);
  });

  kbAddBtn.addEventListener("click", () => {
    const b = {
      id: newId(),
      action: "remap",
      sensitivity: null,
      from: null,
      to: null,
    };
    keybindingDraft.bindings.push(b);
    renderKeybindings();
    startKeybindingCapture(b.id, "from");
  });

  optEnabled.addEventListener("change", () => {
    if (optEnabled.checked) kbEnabled.checked = false;
  });

  kbEnabled.addEventListener("change", () => {
    if (kbEnabled.checked) optEnabled.checked = false;
  });

  saveBtn.addEventListener("click", () => {
    const conflicts = detectConflicts();
    if (conflicts.size > 0) {
      showStatus("Resolve duplicate key combos before saving.", "error");
      return;
    }

    const keybindingConflicts = detectKeybindingConflicts();
    if (keybindingConflicts.size > 0) {
      showStatus("Resolve duplicate website keybinding source keys before saving.", "error");
      return;
    }

    const incomplete = draft.bindings.filter((b) => !b.code);
    if (incomplete.length > 0) {
      showStatus(
        incomplete.length + " binding(s) have no key assigned. Click the key field and press a key, or delete the row.",
        "error"
      );
      return;
    }

    const incompleteKeybindings = keybindingDraft.bindings.filter((b) => {
      if (!b.from || !b.from.code) return true;
      const action = KEYBINDING_ACTION_BY_ID[b.action || "remap"] || KEYBINDING_ACTION_BY_ID.remap;
      return action.needsTarget && (!b.to || !b.to.code);
    });
    if (incompleteKeybindings.length > 0) {
      showStatus(
        incompleteKeybindings.length + " keybinding(s) are incomplete. Set both keys, or delete the row.",
        "error"
      );
      return;
    }

    const payload = {
      enabled: !!optEnabled.checked,
      ignoreInInputs: !!optIgnoreInputs.checked,
      showSpeedOverlay: !!optShowOverlay.checked,
      preferredSpeed: clampNumber(parseFloat(optPreferredSpeed.value), 0.1, 16, DEFAULT_SETTINGS.preferredSpeed),
      rewindStep: clampNumber(parseFloat(optRewindStep.value), 1, 600, DEFAULT_SETTINGS.rewindStep),
      advanceStep: clampNumber(parseFloat(optAdvanceStep.value), 1, 600, DEFAULT_SETTINGS.advanceStep),
      speedStep: clampNumber(parseFloat(optSpeedStep.value), 0.01, 5, DEFAULT_SETTINGS.speedStep),
      volumeStep: clampNumber(parseFloat(optVolumeStep.value), 0.01, 1, DEFAULT_SETTINGS.volumeStep),
      markers: { a: null, b: null },
      bindings: draft.bindings.map((b) => ({
        id: b.id,
        action: b.action,
        value: b.value != null ? Number(b.value) : null,
        code: b.code,
        key: b.key || "",
        ctrl: !!b.ctrl,
        shift: !!b.shift,
        alt: !!b.alt,
        meta: !!b.meta,
      })),
    };

    const keybindingPayload = {
      enabled: !!kbEnabled.checked,
      ignoreInInputs: !!kbIgnoreInputs.checked,
      bindings: keybindingDraft.bindings.map((b) => ({
        id: b.id,
        action: b.action || "remap",
        sensitivity: b.sensitivity != null ? Number(b.sensitivity) : null,
        from: Object.assign({}, b.from),
        to: b.to ? Object.assign({}, b.to) : null,
      })),
    };

    if (payload.enabled && keybindingPayload.enabled) {
      keybindingPayload.enabled = false;
      kbEnabled.checked = false;
    }

    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const prev = res[STORAGE_KEY] || {};
      // Preserve existing markers so in-session marker A/B survive saves.
      payload.markers = prev.markers || { a: null, b: null };
      chrome.storage.local.set({
        [STORAGE_KEY]: payload,
        [KEYBINDINGS_STORAGE_KEY]: keybindingPayload,
      }, () => {
        showStatus("Saved. Changes apply immediately on active tabs where the extension is running.", "ok");
        setTimeout(() => {
          if (saveStatus.classList.contains("ok")) clearStatus();
        }, 3000);
      });
    });
  });

  resetBtn.addEventListener("click", () => {
    draft.bindings = cloneBindings(DEFAULT_BINDINGS).map((b) => Object.assign({}, b, { id: newId() }));
    optEnabled.checked = DEFAULT_SETTINGS.enabled;
    optIgnoreInputs.checked = DEFAULT_SETTINGS.ignoreInInputs;
    optShowOverlay.checked = DEFAULT_SETTINGS.showSpeedOverlay !== false;
    optPreferredSpeed.value = DEFAULT_SETTINGS.preferredSpeed;
    optRewindStep.value = DEFAULT_SETTINGS.rewindStep;
    optAdvanceStep.value = DEFAULT_SETTINGS.advanceStep;
    optSpeedStep.value = DEFAULT_SETTINGS.speedStep;
    optVolumeStep.value = DEFAULT_SETTINGS.volumeStep;
    kbEnabled.checked = KEYBINDINGS_DEFAULT_SETTINGS.enabled;
    kbIgnoreInputs.checked = KEYBINDINGS_DEFAULT_SETTINGS.ignoreInInputs;
    keybindingDraft.bindings = cloneKeybindings(KEYBINDINGS_DEFAULT_SETTINGS.bindings);
    render();
    renderKeybindings();
    showStatus("Defaults restored. Click Save to apply.", "ok");
  });

  function clampNumber(n, min, max, fallback) {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // --- Init ---

  chrome.storage.local.get([STORAGE_KEY, KEYBINDINGS_STORAGE_KEY], (res) => {
    const settings = normalizeSettings(res[STORAGE_KEY]);
    optEnabled.checked = settings.enabled;
    optIgnoreInputs.checked = settings.ignoreInInputs;
    optShowOverlay.checked = settings.showSpeedOverlay !== false;
    optPreferredSpeed.value = settings.preferredSpeed;
    optRewindStep.value = settings.rewindStep;
    optAdvanceStep.value = settings.advanceStep;
    optSpeedStep.value = settings.speedStep;
    optVolumeStep.value = settings.volumeStep;
    draft.bindings = cloneBindings(settings.bindings);

    const keybindingSettings = normalizeKeybindingSettings(res[KEYBINDINGS_STORAGE_KEY]);
    kbEnabled.checked = keybindingSettings.enabled;
    kbIgnoreInputs.checked = keybindingSettings.ignoreInInputs;
    keybindingDraft.bindings = cloneKeybindings(keybindingSettings.bindings);
    render();
    renderKeybindings();
  });
})();
