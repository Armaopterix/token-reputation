
const MODULE_ID = "token-reputation";

/* Reputation levels (hostile → very good) */
const LEVELS = [
  { key: "hostile",     label: "Hostile",   short: "H",  color: 0x8B0000 },
  { key: "verybad",     label: "Very Bad",  short: "-2", color: 0xB22222 },
  { key: "bad",         label: "Bad",       short: "-1", color: 0xDC143C },
  { key: "neutral",     label: "Neutral",   short: "0",  color: 0x808080 },
  { key: "good",        label: "Good",      short: "1",  color: 0x2E8B57 },
  { key: "verygood",    label: "Very Good", short: "2",  color: 0x228B22 },
];

Hooks.once("init", function() {
  // World settings
  game.settings.register(MODULE_ID, "showToPlayers", {
    name: "Show badge to players",
    hint: "If enabled, non-GMs can see the badge on tokens.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: redrawAllBadges
  });

  game.settings.register(MODULE_ID, "defaultLevel", {
    name: "Default reputation level",
    hint: "Default level assigned to new tokens (0 = Hostile ... 5 = Very Good).",
    scope: "world", config: true, type: Number,
    range: { min: 0, max: 5, step: 1 }, default: 3
  });

  // Use skull for hostile (can be toggled)
  game.settings.register(MODULE_ID, "useSkullIcon", {
    name: "Use skull icon for Hostile",
    hint: "Show a black skull icon instead of the letter F for Hostile.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: redrawAllBadges
  });

  // Badge position
  game.settings.register(MODULE_ID, "badgePosition", {
    name: "Badge position",
    hint: "Choose where to place the badge on the token.",
    scope: "world", config: true, type: String,
    choices: {
      "top-left": "Top Left", "top": "Top Center", "top-right": "Top Right",
      "bottom-left": "Bottom Left", "bottom": "Bottom Center", "bottom-right": "Bottom Right"
    },
    default: "top-right", onChange: redrawAllBadges
  });

  // Skull background color (hostile only; dynamic fill)
  game.settings.register(MODULE_ID, "skullBgColor", {
    name: "Skull background color",
    hint: "Background fill behind the skull for Hostile tokens.",
    scope: "world", config: true, type: String,
    choices: {
      "red":"Dark Red", "lightred":"Red", "white":"White", "gray":"Gray", "green":"Green",
      "purple":"Purple", "pink":"Pink", "darkred":"Dark Red", "gold":"Gold"
    },
    default: "red", onChange: redrawAllBadges
  });

  // Client (per-user) settings
  game.settings.register(MODULE_ID, "badgeScale", {
    name: "Badge size (scale)",
    hint: "Scale factor for the badge size on tokens (0.5–2.0).",
    scope: "client", config: true, type: Number,
    range: { min: 0.5, max: 2.0, step: 0.1 }, default: 1.0,
    onChange: redrawAllBadges
  });

  game.settings.register(MODULE_ID, "colorBlindFriendly", {
    name: "Color-blind friendly palette",
    hint: "Use a high-contrast palette for non-hostile levels.",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: redrawAllBadges
  });
  // Show the legacy Token HUD panel (slider and quick buttons). Default off when using right-click menu.
  
  // Context menu trigger (right-click and keyboard 'R')
  game.settings.register(MODULE_ID, "enableContextMenu", {
    name: "Enable context menu triggers",
    hint: "Allow right-click and the 'R' key to open the Reputation menu. When disabled, use the HUD 'R' button or the sheet/actor dialog.",
    scope: "client", config: true, type: Boolean, default: false
  });
game.settings.register(MODULE_ID, "enableHudPanel", {
    name: "Show Token HUD panel",
    hint: "Show the Reputation panel inside the Token HUD (slider and quick buttons). Disable if you use the right-click menu.",
    scope: "client", config: true, type: Boolean, default: false
  });


  game.settings.register(MODULE_ID, "hideLocally", {
    name: "Hide badge locally",
    hint: "Hide reputation badges on this client (players can toggle for immersion).",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: redrawAllBadges
  });

  // Keybinding
  try {
    game.keybindings.register(MODULE_ID, "openDialog", {
      name: "Open reputation dialog",
      hint: "Opens the reputation dialog for the selected token(s). GM can edit; players view-only.",
      editable: [{ key: "KeyR" }],
      onDown: () => {
        const tokens = canvas?.tokens?.controlled ?? [];
        for (const t of tokens) openReputationDialog(t.document);
        return true;
      },
      restricted: false,
      precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
  } catch (e) { console.warn(`[${MODULE_ID}] Keybinding registration failed`, e); }
});

function redrawAllBadges() {
  try { for (const t of canvas.tokens?.placeables ?? []) drawBadge(t); }
  catch (e) { console.warn(`[${MODULE_ID}] redrawAllBadges failed`, e); }
}

function getLevel(doc) {
  let lvl = doc?.getFlag(MODULE_ID, "level");
  if (lvl === undefined || lvl === null) lvl = game.settings.get(MODULE_ID, "defaultLevel") ?? 3;
  lvl = Math.max(0, Math.min(Number(lvl), LEVELS.length - 1));
  return lvl;
}
async function setLevel(doc, idx) {
  idx = Math.max(0, Math.min(Number(idx), LEVELS.length-1));
  await doc.setFlag(MODULE_ID, "level", idx);
  const t = canvas.tokens?.get(doc.id);
  if (t) drawBadge(t);
  return idx;
}


// Color palettes for non-hostile levels
const PALETTE_DEFAULT = [0x8B0000, 0xB22222, 0xDC143C, 0x808080, 0x2E8B57, 0x228B22];
const PALETTE_CB_SAFE  = [0xD55E00, 0xE69F00, 0xCC79A7, 0x0072B2, 0x009E73, 0x56B4E9];

function getPaletteColor(levelIndex) {
  const cb = game.settings.get(MODULE_ID, "colorBlindFriendly");
  const arr = cb ? PALETTE_CB_SAFE : PALETTE_DEFAULT;
  const i = Math.max(0, Math.min(levelIndex, arr.length-1));
  return arr[i];
}

function skullBgHex() {
  const map = {
    red:0xFF3333, lightred:0xFF3333, white:0xFFFFFF, gray:0x808080, green:0x228B22,
    purple:0x800080, pink:0xFF69B4, darkred:0x8B0000, gold:0xFFD700
  };
  return map[ game.settings.get(MODULE_ID, "skullBgColor") ] ?? 0x8B0000;
}

/** Draw / update the token badge */
function drawBadge(token) {
  try {
    if (!token?.document) return;
    const showToPlayers = game.settings.get(MODULE_ID, "showToPlayers");
    const hideLocal = game.settings.get(MODULE_ID, "hideLocally");
    if ((!showToPlayers && !game.user.isGM) || (hideLocal && !game.user.isGM)) {
      if (token.reputationBadge) {
        token.removeChild(token.reputationBadge);
        token.reputationBadge.destroy({ children: true });
        token.reputationBadge = null;
      }
      return;
    }

    const lvl = getLevel(token.document);
    const meta = LEVELS[lvl];
    const scale = Number(game.settings.get(MODULE_ID, "badgeScale") ?? 1.0);

    // remove old
    if (token.reputationBadge) {
      token.removeChild(token.reputationBadge);
      token.reputationBadge.destroy({ children: true });
      token.reputationBadge = null;
    }

    const container = new PIXI.Container();
    container.name = "reputationBadge";

    const g = new PIXI.Graphics();
    const w = Number(token.w || token.width || (token.document?.width||1) * canvas.grid.size);
    const h = Number(token.h || token.height || (token.document?.height||1) * canvas.grid.size);
    const base = Math.min(w || 64, h || 64);
    const radius = Math.max(8, Math.floor(base * 0.08 * scale));

    // Background fill: hostile uses skull background color; others use palette
    const useSkull = (lvl === 0 && game.settings.get(MODULE_ID, "useSkullIcon"));
    const fillColor = useSkull ? skullBgHex() : (getPaletteColor(lvl) ?? meta.color);
    g.beginFill(fillColor, 0.95);
    g.drawCircle(0, 0, radius);
    g.endFill();
    // Outline
    g.lineStyle(2, 0x000000, 0.65);
    g.drawCircle(0, 0, radius);
    container.addChild(g);

    // Foreground: skull (hostile) or short text
    if (useSkull) {
      const skull = PIXI.Sprite.from(`modules/${MODULE_ID}/icons/skull-black.png`);
      skull.anchor.set(0.5);
      const size = Math.floor(radius*1.6);
      skull.width = size; skull.height = size;
      container.addChild(skull);
    } else {
      const style = new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: Math.floor(radius * 1.2),
        fill: 0xFFFFFF, align: "center",
        stroke: 0x000000, strokeThickness: 3
      });
      const t = new PIXI.Text(meta.short, style);
      t.anchor.set(0.5);
      container.addChild(t);
    }

    // Position
    const pad = 6;
    const pos = game.settings.get(MODULE_ID, "badgePosition") || "top-right";
    const cx = w || token.w || 64; const cy = h || token.h || 64;
    const map = {
      "top-left":   { x: radius + pad,      y: radius + pad },
      "top":        { x: cx/2,              y: radius + pad },
      "top-right":  { x: cx - radius - pad, y: radius + pad },
      "bottom-left":{ x: radius + pad,      y: cy - radius - pad },
      "bottom":     { x: cx/2,              y: cy - radius - pad },
      "bottom-right":{x: cx - radius - pad, y: cy - radius - pad }
    };
    const p = map[pos] || map["top-right"];
    container.x = p.x; container.y = p.y;
    container.zIndex = 1000;
    token.sortableChildren = true;

    // Interactions (badge only)
    container.eventMode = "static";
    container.cursor = "pointer";
    container._repClick = () => openReputationDialog(token.document);
    container.on("pointertap", container._repClick);
    container._repHoverOver = () => {
      const txt = `Reputation: ${meta.label}`;
      ui.tooltip?.activate(container);
      ui.tooltip?.bind(container, { text: txt, direction: "UP" });
    };
    container._repHoverOut = () => { ui.tooltip?.deactivate(); };
    container.on("pointerover", container._repHoverOver);
    container.on("pointerout", container._repHoverOut);

    token.addChild(container);
    token.reputationBadge = container;
  } catch (err) { console.error(`[${MODULE_ID}] drawBadge error`, err); }
}

// GM Token HUD
Hooks.on("renderTokenHUD", (hud, html, data) => {
if (!game.user.isGM) return;
  const $html = (html && typeof html.find === "function") ? html : $(html);
  const doc = hud.object?.document ?? canvas.tokens?.controlled[0]?.document;
  if (!doc) return;

  
  // --- 
  // --- Add small HUD button "R" to open the slider dialog (robust container detection + jQuery fallback)
  try {
    // Normalize html to jQuery
    const $root = (html && html.jquery) ? html : $(html);

    // Avoid duplicates
    if ($root.find(".control-icon.reputation-icon").length === 0) {
      const doc = hud.object?.document ?? canvas.tokens?.get(hud.object?.id)?.document;

      // Prefer right column; otherwise fall back to the column that contains control icons.
      let $container = $root.find(".col.right");
      if ($container.length === 0) {
        const $icons = $root.find(".control-icon");
        $container = $icons.length ? $icons.last().parent() : $root.find(".col").last();
      }

      if ($container && $container.length) {
        const $btn = $(`<div class="control-icon reputation-icon" title="Reputation"><span class="rep-letter">R</span></div>`);
        $btn.on("click", ev => { ev.preventDefault(); ev.stopPropagation(); openReputationDialog(doc); });
        $container.prepend($btn);
      }
    }
  } catch(e) { console.warn(`[${MODULE_ID}] HUD button injection failed`, e); }
  // If enabled, also show the legacy HUD panel (slider + quick buttons)
  if (!game.settings.get(MODULE_ID, "enableHudPanel")) return;
const current = getLevel(doc);
  const labels = LEVELS.map(l => l.label);

  const root = $(`
    <div class="reputation-hud flexcol">
      <div class="rep-row">
        <i class="fa-solid fa-users"></i>
        <label>Reputation</label>
      </div>
      <input id="rep-slider" type="range" min="0" max="${LEVELS.length-1}" step="1" value="${current}"/>
      <div class="rep-labels">
        <span>${labels[0]}</span>
        <span>${labels[labels.length-1]}</span>
      </div>
      <div class="rep-current">Current: <b>${LEVELS[current].label}</b></div>
    </div>
  `);

  $html.find(".col.right").append(root);

  const slider = root.find("#rep-slider");
  slider.on("input", ev => {
    const v = Number(ev.target.value);
    root.find(".rep-current b").text(LEVELS[v].label);
  });
  slider.on("change", async ev => {
    const v = Number(ev.target.value);
    await doc.setFlag(MODULE_ID, "level", v);
    const token = hud.object;
    if (token) drawBadge(token);
  });

  const quick = $(`<div class="rep-quick"></div>`);
  LEVELS.forEach((lvl, idx) => {
    const btn = $(`<button type="button" class="rep-btn" title="${lvl.label}">${lvl.short}</button>`);
    btn.on("click", async () => {
      await doc.setFlag(MODULE_ID, "level", idx);
      slider.val(idx).trigger("input").trigger("change");
    });
    quick.append(btn);
  });
  root.append(quick);
});

// D&D5e tab (kept; may be limited on some builds)

function inject5eReputationTab(app, html, actor) {
  try {
    if (!actor) return;
    const $root = (html && html.jquery) ? html : $(html);

    // Header button (robust) - shows 'R' in the sheet header to open actor reputation dialog
    try {
      const $header = $root.find(".window-header, header.window-header, .sheet-header, header");
      if ($header.length && $root.find(".token-rep-headbtn").length === 0) {
        const $btn = $(`<a class="token-rep-headbtn" title="Reputation" style="margin-left:6px; font-weight:800;">R</a>`);
        $btn.on("click", ev => { ev.preventDefault(); ev.stopPropagation(); openActorReputationDialog(actor); });
        // Prefer header actions group if present
        const $actions = $root.find(".window-header .header-actions, .sheet-header .header-actions").first();
        if ($actions.length) $actions.prepend($btn);
        else $header.first().append($btn);
      }
    } catch(e) { /* non-fatal */ }

    const canEdit = game.user.isGM;
    const current = actor.getFlag(MODULE_ID, "level") ?? game.settings.get(MODULE_ID, "defaultLevel") ?? 3;

    const control = $(`
      <div class="token-rep-sheet" style="margin-top:6px; display:flex; gap:8px; align-items:center;">
        <label style="font-weight:600; white-space:nowrap;"><i class="fa-solid fa-users"></i> Reputation</label>
        <input class="rep-slider" type="range" min="0" max="${LEVELS.length-1}" step="1" value="${current}" style="flex:1;"/>
        <div class="rep-current" style="min-width:140px;">Current: <b>${LEVELS[current].label}</b></div>
      </div>
    `);
    if (!canEdit) control.find(".rep-slider").attr("disabled", true);
    control.find(".rep-slider").on("input", ev => {
      const v = Number(ev.target.value);
      control.find(".rep-current b").text(LEVELS[v].label);
    });
    control.find(".rep-slider").on("change", async ev => {
      const v = Number(ev.target.value);
      await actor.setFlag(MODULE_ID, "level", v).catch(()=>{});
      if (actor.prototypeToken) await actor.prototypeToken.setFlag(MODULE_ID, "level", v).catch(()=>{});
      const tokens = actor.getActiveTokens(true);
      for (const t of tokens) { try { await t.document.setFlag(MODULE_ID, "level", v); drawBadge(t); } catch(_){} }
    });

    const tabsNav = $root.find(".sheet-navigation .sheet-tabs, nav.sheet-tabs, .sheet-tabs").first();
    const sheetBody = $root.find(".sheet-body").first();

    let injected = false;
    if (tabsNav.length && sheetBody.length) {
      if ($root.find('a.item[data-tab="token-rep"]').length === 0) {
        const btn = $(`<a class="item" data-tab="token-rep"><i class="fa-solid fa-users"></i> Reputation</a>`);
        tabsNav.append(btn);
      }
      if ($root.find('section.tab[data-tab="token-rep"]').length === 0) {
        const panel = $(`<section class="tab" data-tab="token-rep"></section>`);
        panel.append(control);
        sheetBody.append(panel);
      } else {
        $root.find('section.tab[data-tab="token-rep"]').empty().append(control);
      }
      if (Array.isArray(app._tabs)) for (const t of app._tabs) { try { t.bind($root[0]); } catch(e){} }
      injected = true;
    }

    if (!injected) {
      const wc = $root.find(".window-content").first();
      if (wc.length && wc.find(".token-rep-sheet").length === 0) {
        wc.prepend(control);
      }
    }
  } catch (err) { console.error(`[${MODULE_ID}] inject5eReputationTab error`, err); }
}
Hooks.on("renderActorSheet5eCharacter", (app, html, data) => inject5eReputationTab(app, html, app.object));
Hooks.on("renderActorSheet5eNPC",       (app, html, data) => inject5eReputationTab(app, html, app.object));

// Dialog (also for unlinked tokens)


async function openReputationDialog(doc) {
  if (!doc) { ui.notifications?.warn("No token document available."); return; }
  const current = getLevel(doc);
  const canEdit = game.user.isGM;
  const content = `
    <div class="flexcol" style="gap:8px">
      <div>Reputation level for this token:</div>
      <input id="rep-slider-dialog" type="range" min="0" max="${LEVELS.length-1}" step="1" value="${current}" ${canEdit ? "" : "disabled"} />
      <div class="rep-labels" style="display:flex;justify-content:space-between;">
        <span>${LEVELS[0].label}</span>
        <span>${LEVELS[LEVELS.length-1].label}</span>
      </div>
      <div class="rep-current">Current: <b>${LEVELS[current].label}</b></div>
    </div>
  `;
  const d = new Dialog({
    title: "Token Reputation",
    content,
    buttons: { close: { label: "Close" } },
    default: "close",
    render: (html) => {
      const $html = html instanceof jQuery ? html : $(html);
      const slider = $html.find("#rep-slider-dialog");
      slider.on("input", ev => {
        const v = Number(ev.target.value);
        $html.find(".rep-current").html(`Current: <b>${LEVELS[v].label}</b>`);
      });
      slider.on("change", async ev => {
        if (!canEdit) return;
        await setLevel(doc, Number(ev.target.value));
      });
    }
  });
  d.render(true);
}
async function openActorReputationDialog(actor) {
  try {
    if (!actor) { ui.notifications?.warn("No actor available."); return; }
    const canEdit = game.user.isGM;
    const current = actor.getFlag(MODULE_ID, "level") ?? game.settings.get(MODULE_ID, "defaultLevel") ?? 3;
    const content = `
      <div class="flexcol" style="gap:8px">
        <div>Reputation level for this actor:</div>
        <input id="rep-slider-actor" type="range" min="0" max="${LEVELS.length-1}" step="1" value="${current}" ${canEdit ? "" : "disabled"} />
        <div class="rep-labels" style="display:flex;justify-content:space-between;">
          <span>${LEVELS[0].label}</span>
          <span>${LEVELS[LEVELS.length-1].label}</span>
        </div>
        <div class="rep-current">Current: <b>${LEVELS[current].label}</b></div>
      </div>
    `;
    const d = new Dialog({
      title: "Actor Reputation",
      content,
      buttons: { close: { label: "Close" } },
      default: "close",
      render: (html) => {
        const $html = html instanceof jQuery ? html : $(html);
        const slider = $html.find("#rep-slider-actor");
        slider.on("input", ev => {
          const v = Number(ev.target.value);
          $html.find(".rep-current").html(`Current: <b>${LEVELS[v].label}</b>`);
        });
        slider.on("change", async ev => {
          if (!canEdit) return;
          const v = Number(ev.target.value);
          await actor.setFlag(MODULE_ID, "level", v).catch(()=>{});
          if (actor.prototypeToken) await actor.prototypeToken.setFlag(MODULE_ID, "level", v).catch(()=>{});
          const tokens = actor.getActiveTokens(true);
          for (const t of tokens) { try { await t.document.setFlag(MODULE_ID, "level", v); drawBadge(t); } catch(_){} }
        });
      }
    });
    d.render(true);
  } catch (e) { console.warn(`[${MODULE_ID}] openActorReputationDialog failed`, e); }
}




// Auto-refresh on token lifecycle
Hooks.on("refreshToken", (token) => drawBadge(token));
Hooks.on("createToken",  (doc)   => { const t = canvas.tokens?.get(doc.id); if (t) drawBadge(t); });
Hooks.on("updateToken",  (doc)   => { const t = canvas.tokens?.get(doc.id); if (t) drawBadge(t); });

// --- v1.0.3: Right-click Reputation mini-menu + keyboard shortcuts ---
let __repMenuEl = null;
let __repMenuTokenId = null;

function closeReputationMenu() {
  if (__repMenuEl) {
    __repMenuEl.remove();
    __repMenuEl = null;
    __repMenuTokenId = null;
    document.removeEventListener("keydown", handleRepMenuKeys, true);
  }
}
function handleRepMenuKeys(ev) {
  if (!__repMenuEl) return;
  // ESC closes
  if (ev.key === "Escape") { ev.preventDefault(); closeReputationMenu(); return; }
  // H = Hostile
  if (/^[Hh]$/.test(ev.key)) {
    ev.preventDefault();
    const hostileIndex = Math.max(0, LEVELS.findIndex(l => (l?.flag || l?.label || "").toLowerCase().includes("hostile")));
    applyReputationIndex(hostileIndex);
    return;
  }
  // 0-9 direct select (clamped to max)
  if (/^\d$/.test(ev.key)) {
    ev.preventDefault();
    const idx = Math.min(parseInt(ev.key,10), LEVELS.length-1);
    applyReputationIndex(idx);
    return;
  }
}
function applyReputationIndex(idx) {
  const token = canvas.tokens?.get(__repMenuTokenId);
  if (!token) return closeReputationMenu();
  const doc = token.document;
  const current = getLevel(doc);
  if (idx === current) { closeReputationMenu(); return; }
  setLevel(doc, idx).then(() => {
    ui.notifications?.info(`Reputation: ${LEVELS[idx]?.label ?? idx}`);
    closeReputationMenu();
  });
}

function openReputationMenuForToken(token, x, y) {
  closeReputationMenu();
  __repMenuTokenId = token.id;
  // Build menu element
  const list = LEVELS.map((l,i) => {
    const key = i; const lab = l.label ?? String(i);
    return `<li data-idx="${i}"><span class="key">${key}</span><span class="label">${lab}</span></li>`;
  }).join("");
  const hostileIndex = Math.max(0, LEVELS.findIndex(l => (l?.flag || l?.label || "").toLowerCase().includes("hostile")));
  const hostileLabel = LEVELS[hostileIndex]?.label ?? "Hostile";
  const html = document.createElement("div");
  html.className = "reputation-menu";
  html.innerHTML = `
    <div class="header"><span class="key">R</span><span class="label">Reputation</span></div>
    <ul class="items">${list}</ul>
    <div class="footer"><span class="key">H</span><span class="label">${hostileLabel}</span></div>
  `;
  document.body.appendChild(html);
  // Position (keep in viewport)
  const rect = html.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const posX = Math.min(Math.max(8, x), vw - rect.width - 8);
  const posY = Math.min(Math.max(8, y), vh - rect.height - 8);
  html.style.left = posX + "px";
  html.style.top  = posY + "px";
  __repMenuEl = html;

  // Click handlers
  html.addEventListener("click", (ev) => {
    const li = ev.target.closest("li[data-idx]");
    if (!li) return;
    applyReputationIndex(Number(li.dataset.idx));
  }, { passive: true });
  html.addEventListener("contextmenu", (ev) => { ev.preventDefault(); closeReputationMenu(); });

  // Global keys when menu open
  document.addEventListener("keydown", handleRepMenuKeys, true);
}

// Bind right-click on tokens & global R shortcut for selected token
Hooks.on("canvasReady", () => {
  if (!game.settings.get(MODULE_ID, "enableContextMenu")) return; // disabled by default
  for (const t of canvas.tokens.placeables) {
    try { t.off?.("rightdown", t._repRightDown); } catch(e){}
    t._repRightDown = (ev) => {
      if (!t.controlled) return;
      const cvs = globalThis.canvas; if (!cvs || !cvs.ready) return;
      let g = ev?.data?.global; let mx = g?.x, my = g?.y;
      if (mx == null || my == null) { const c = t.center; const gp = cvs.stage?.toGlobal ? cvs.stage.toGlobal(new PIXI.Point(c.x, c.y)) : {x:c.x,y:c.y}; mx = gp.x; my = gp.y; }
      openReputationMenuForToken(t, mx, my);
    };
    t.on?.("rightdown", t._repRightDown);
  }
});
// Also allow pressing "R" to open the menu for the first controlled token
document.addEventListener("keydown", (ev) => {
  if (!game.settings.get(MODULE_ID, "enableContextMenu")) return; // disabled by default
  if (ev.repeat) return;
  if (["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (ev.key?.toLowerCase() !== "r") return;
  const cvs = globalThis.canvas; if (!cvs || !cvs.ready) return;
  const t = cvs.tokens?.controlled?.[0]; if (!t) return;
  ev.preventDefault();
  const c = t.center; const gp = cvs.stage?.toGlobal ? cvs.stage.toGlobal(new PIXI.Point(c.x, c.y)) : { x: c.x, y: c.y };
  openReputationMenuForToken(t, gp.x, gp.y);
});
// --- end v1.0.3 additions ---
Hooks.on("canvasReady",  ()      => redrawAllBadges());
