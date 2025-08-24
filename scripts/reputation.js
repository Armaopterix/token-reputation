
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
    if (html.find('a.item[data-tab="token-rep"]').length) return;

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
      for (const t of tokens) { await t.document.setFlag(MODULE_ID, "level", v).catch(()=>{}); drawBadge(t); }
    });

    const tabsNav = html.find(".sheet-navigation .sheet-tabs, nav.sheet-tabs, .sheet-tabs").first();
    if (tabsNav.length) {
      const btn = $(`<a class="item" data-tab="token-rep"><i class="fa-solid fa-users"></i> Reputation</a>`);
      tabsNav.append(btn);
    }
    const sheetBody = html.find(".sheet-body").first();
    if (sheetBody.length) {
      const panel = $(`<section class="tab" data-tab="token-rep"></section>`);
      panel.append(`<div style="margin:6px 0 12px; opacity:.8;">Set the attitude of this character towards the party. Changes sync to prototype token and active tokens.</div>`);
      panel.append(control);
      sheetBody.append(panel);
    }
    if (Array.isArray(app._tabs)) for (const t of app._tabs) { try { t.bind(html[0]); } catch(e){} }
  } catch (err) { console.error(`[${MODULE_ID}] inject5eReputationTab error`, err); }
}
Hooks.on("renderActorSheet5eCharacter", (app, html, data) => inject5eReputationTab(app, html, app.object));
Hooks.on("renderActorSheet5eNPC",       (app, html, data) => inject5eReputationTab(app, html, app.object));

// Dialog (also for unlinked tokens)
async function openReputationDialog(doc) {
  const current = getLevel(doc);
  const canEdit = game.user.isGM;
  const content = `
    <div class="flexcol" style="gap:8px">
      <div>Reputation level for this token:</div>
      <input id="rep-slider-dialog" type="range" min="0" max="${LEVELS.length-1}" step="1" value="${current}" ${canEdit ? "" : "disabled"} />
      <div>Current: <b id="rep-current-dialog">${LEVELS[current].label}</b></div>
      <div style="display:grid; grid-template-columns: repeat(${LEVELS.length},1fr); gap:4px;">
        ${LEVELS.map((l, i) => `<button type="button" class="rep-btn-dialog" data-v="${i}" ${canEdit ? "" : "disabled"}>${l.short}</button>`).join("")}
      </div>
    </div>`;

  const d = new Dialog({
    title: "NPC Reputation", content,
    buttons: { close: { label: "Close" } },
    render: (html) => {
      const slider = html[0].querySelector("#rep-slider-dialog");
      const label  = html[0].querySelector("#rep-current-dialog");
      const commit = async (v) => {
        await doc.setFlag(MODULE_ID, "level", Number(v));
        const token = canvas.tokens?.get(doc.id);
        if (token) drawBadge(token);
      };
      slider?.addEventListener("input", ev => { const v = Number(ev.target.value); if (label) label.textContent = LEVELS[v].label; });
      slider?.addEventListener("change", async ev => { if (!canEdit) return; await commit(ev.target.value); });
      html.find(".rep-btn-dialog").on("click", async (ev) => {
        if (!canEdit) return;
        const v = Number(ev.currentTarget.dataset.v);
        slider.value = v; if (label) label.textContent = LEVELS[v].label;
        await commit(v);
      });
    },
    default: "close"
  });
  d.render(true);
}

// Auto-refresh on token lifecycle
Hooks.on("refreshToken", (token) => drawBadge(token));
Hooks.on("createToken",  (doc)   => { const t = canvas.tokens?.get(doc.id); if (t) drawBadge(t); });
Hooks.on("updateToken",  (doc)   => { const t = canvas.tokens?.get(doc.id); if (t) drawBadge(t); });
Hooks.on("canvasReady",  ()      => redrawAllBadges());
