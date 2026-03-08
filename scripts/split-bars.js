const MODULE_ID = 'split-bars';

const MAX_THRESHOLDS = 50;

/**
 * Parse a single rule expression (e.g. "1/3", "75%", "12", "1/3:") into normalized
 * threshold value(s). Returns an array of numbers in (0, 1) or empty on invalid input.
 * @param {string} ex - Raw expression
 * @param {{ min: number, max: number }} attr - Bar attribute with min/max for absolute value conversion
 * @param {boolean} repeat - If true, repeat the threshold across the bar (e.g. 1/3: => [1/3, 2/3])
 * @param {"full"|"positive"} [negativeRange="full"] - "full" = fractions use min..max; "positive" = fractions use 0..max only
 * @returns {number[]} Normalized thresholds in (0, 1)
 */
function parseSingleExpression(ex, attr, repeat, negativeRange = "full") {
    if (ex.includes("%")) {
        ex = ex.replace(/%/g, "");
        ex = (Number(ex) / 100).toString();
    }
    if (ex.includes("/")) {
        const div = ex.split("/");
        const val = Number(div[0]) / Number(div[1]);
        if (val > 1 || val <= 0 || !Number.isFinite(val)) return [];
        ex = val.toString();
    }
    if (ex === "") return [];
    let pct = Number(ex);
    if (Number.isNaN(pct)) return [];

    const attrMin = Number.isFinite(Number(attr.min)) ? Number(attr.min) : 0;
    const attrMax = Number(attr.max);
    const attrRange = attrMax - attrMin;
    const isAbsolute = pct >= 1 || pct <= 0;

    if (isAbsolute) {
        if (pct < attrMin || pct > attrMax) return [];
        if (attrRange <= 0 || !Number.isFinite(attrRange)) return [];
        pct = (pct - attrMin) / attrRange;
    } else {
        if (pct <= 0 || pct >= 1) return [];
        const fractionInPositive = pct;
        if (negativeRange === "positive" && attrMin < 0) {
            const valueAtPct = fractionInPositive * attrMax;
            if (attrRange <= 0 || !Number.isFinite(attrRange)) return [];
            pct = (valueAtPct - attrMin) / attrRange;
            pct = Math.max(0, Math.min(1, pct));
            if (pct <= 0 || pct >= 1) return [];
        }
    }

    const thresholds = [];
    const stepSize = pct;
    let current = Math.round(pct * 100000) / 100000;
    const fractionInPositive = negativeRange === "positive" && attrMin < 0
        ? (current * attrRange + attrMin) / attrMax
        : pct;
    do {
        if (current > 0 && current < 1) thresholds.push(current);
        if (!repeat) break;
        if (negativeRange === "positive" && attrMin < 0) {
            const n = thresholds.length + 1;
            const nextVal = n * fractionInPositive * attrMax;
            if (nextVal >= attrMax) break;
            current = Math.round(((nextVal - attrMin) / attrRange) * 100000) / 100000;
        } else {
            current += stepSize;
            current = Math.round(current * 100000) / 100000;
        }
    } while (repeat && current < 1 && thresholds.length < MAX_THRESHOLDS);

    return thresholds;
}

/**
 * Parse a full rule string into a sorted, deduplicated array of normalized thresholds.
 * @param {string} rawRule - Rule string (e.g. "1/3: 0.5 75%")
 * @param {{ min: number, max: number }} attr - Bar attribute for absolute value conversion
 * @param {"full"|"positive"} [negativeRange="full"] - How fractional rules treat negative min
 * @returns {number[]} Sorted thresholds in (0, 1)
 */
function parseRuleToThresholds(rawRule, attr, negativeRange = "full") {
    if (!rawRule || typeof rawRule !== "string") return [];
    const statements = rawRule.split(/[; ,]+/).filter(Boolean);
    const all = [];
    for (const st of statements) {
        const repeat = st.includes(":");
        const ex = st.replace(/:/g, "");
        if (!ex) continue;
        const t = parseSingleExpression(ex, attr, repeat, negativeRange);
        all.push(...t);
    }
    const unique = [...new Set(all.map((v) => Math.round(v * 100000) / 100000))];
    unique.sort((a, b) => a - b);
    return unique.filter((v) => v > 0 && v < 1);
}

/**
 * Compute raw and floor-snapped fill percentage for a bar.
 * @param {{ value: number, min?: number, max: number }} attr - Bar attribute from getBarAttribute
 * @param {number[]} thresholds - Sorted normalized thresholds in (0, 1)
 * @returns {{ rawPct: number, snappedPct: number }}
 */
function computeSnappedPct(attr, thresholds) {
    const attrMin = Number.isFinite(Number(attr.min)) ? Number(attr.min) : 0;
    const attrMax = Number(attr.max);
    const attrRange = attrMax - attrMin;
    const value = Number(attr.value);

    let rawPct = 0;
    if (attrRange > 0 && Number.isFinite(attrRange)) {
        rawPct = (value - attrMin) / attrRange;
        rawPct = Math.max(0, Math.min(1, rawPct));
    }

    if (thresholds.length === 0) {
        return { rawPct, snappedPct: rawPct };
    }

    let snappedPct = 0;
    for (const t of thresholds) {
        if (rawPct >= t) snappedPct = t;
        else break;
    }
    return { rawPct, snappedPct };
}

function getNegativeRangeMode(doc, barIndex) {
    const key = barIndex === 1 ? "negativeRange1" : "negativeRange2";
    const v = doc.getFlag(MODULE_ID, key);
    return v === "positive" ? "positive" : "full";
}

function _drawBar_Wrapper(wrapped, number, bar, data) {
    const barName = number === 1 ? "bar1" : "bar2";
    const ruleKey = number === 1 ? "rule1" : "rule2";
    const hasRule = foundry.utils.hasProperty(this.document, `flags.${MODULE_ID}.${ruleKey}`);

    if (hasRule && data && typeof data === "object") {
        const attr = this.document.getBarAttribute(barName);
        if (attr && attr.type === "bar") {
            const rawRule = this.document.getFlag(MODULE_ID, ruleKey);
            const negativeRange = getNegativeRangeMode(this.document, number);
            const thresholds = parseRuleToThresholds(rawRule, attr, negativeRange);
            if (thresholds.length > 0) {
                const { snappedPct } = computeSnappedPct(attr, thresholds);
                const attrMin = Number.isFinite(Number(attr.min)) ? Number(attr.min) : 0;
                const attrMax = Number(attr.max);
                const range = attrMax - attrMin;
                const displayValue = attrMin + snappedPct * range;
                data = { ...data, value: displayValue };
            }
        }
    }

    return wrapped(number, bar, data);
}

function getOrCreateOverlay(token, barName, bar) {
    const key = `_splitBarsOverlay_${barName}`;
    let overlay = token[key];
    if (!overlay) {
        overlay = new PIXI.Graphics();
        token[key] = overlay;
    }
    const parent = bar.parent;
    if (parent) {
        if (overlay.parent !== parent) {
            if (overlay.parent) overlay.parent.removeChild(overlay);
            const idx = parent.getChildIndex(bar);
            parent.addChildAt(overlay, idx + 1);
        }
        overlay.position.copyFrom(bar.position);
    }
    return overlay;
}

function drawBars_Wrapper(wrapped, ...args) {
    const result = wrapped(...args);

    ["bar1", "bar2"].forEach((b, i) => {
        const hasRule = (i === 0 && foundry.utils.hasProperty(this.document, "flags.split-bars.rule1"))
            || (i === 1 && foundry.utils.hasProperty(this.document, "flags.split-bars.rule2"));
        if (!hasRule) return;

        const bar = this.bars?.[b] ?? this.hud?.bars?.[b];
        if (!bar) return;

        const attr = this.document.getBarAttribute(b);
        if (!attr || (attr.type !== "bar")) return;

        const rawRule = this.document.getFlag(MODULE_ID, i === 0 ? "rule1" : "rule2");
        const negativeRange = getNegativeRangeMode(this.document, i + 1);
        const thresholds = parseRuleToThresholds(rawRule, attr, negativeRange);
        if (thresholds.length === 0) return;

        const overlay = getOrCreateOverlay(this, b, bar);
        const w = this.w;
        let h = bar.height ?? Math.max((canvas.dimensions.size / 12), 8);
        if (this.document.height >= 2) h *= 1.6;
        const bs = Math.clamp(h / 8, 1, 2);
        const blk = 0x000000;

        overlay.clear();
        for (const pct of thresholds) {
            const x = Math.round(pct * w);
            overlay.lineStyle(bs, blk, 1).moveTo(x, 0).lineTo(x, h);
        }
    });

    return result;
}

Hooks.once('setup', function () {
    if (!game.modules.get('lib-wrapper')?.active || !globalThis.libWrapper) return;
    libWrapper.register(MODULE_ID, 'foundry.canvas.placeables.Token.prototype._drawBar', _drawBar_Wrapper, "MIXED");
    libWrapper.register(MODULE_ID, 'foundry.canvas.placeables.Token.prototype.drawBars', drawBars_Wrapper, "WRAPPER");
});


Hooks.once('ready', () => {
    if(!game.modules.get('lib-wrapper')?.active && game.user.isGM)
        ui.notifications.error("Module Split-Bars requires the 'libWrapper' module. Please install and activate it.");
});

function getRootElement(html) {
    if (html instanceof HTMLElement) return html;
    if (html?.[0] instanceof HTMLElement) return html[0];
    return null;
}

function findFieldRow(field) {
    let current = field?.parentElement ?? null;
    while (current) {
        const hasLabel = !!current.querySelector(":scope > label");
        const hasField = !!current.querySelector(":scope input, :scope select, :scope textarea");
        if (hasLabel && hasField) return current;
        if (current.matches("form, section, [data-application-part], .tab")) break;
        current = current.parentElement;
    }
    return field?.closest(".form-group") ?? field?.parentElement ?? null;
}

function findBarAttributeField(root, index) {
    const byName = root.querySelector(`select[name='bar${index}.attribute']`)
        ?? root.querySelector(`[name='bar${index}.attribute']`);
    if (byName) return byName;

    const wantedLabel = `bar ${index} attribute`;
    const label = Array.from(root.querySelectorAll("label")).find((el) =>
        el.textContent?.trim().toLowerCase() === wantedLabel
    );
    if (!label) return null;

    const row = findFieldRow(label);
    return row?.querySelector("select, input[list]") ?? null;
}

function logSelectorDebug(root, app) {
    if (root.dataset.splitBarsDebugLogged === "true") return;
    root.dataset.splitBarsDebugLogged = "true";

    const fieldNames = Array.from(root.querySelectorAll("select, input, textarea"))
        .map((el) => `${el.tagName.toLowerCase()}:${el.getAttribute("name") ?? ""}`)
        .filter((value) => value !== "input:" && value !== "textarea:")
        .slice(0, 40);
    const labels = Array.from(root.querySelectorAll("label"))
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 20);

    console.warn("Split Bars | Could not find token bar attribute fields in this render.", {
        application: app?.constructor?.name,
        fieldNames,
        labels
    });
}

function injectSplitBarFields(app, html) {
    const root = getRootElement(html);
    if (!root) return;

    root.querySelectorAll(".split-bars-rule").forEach((el) => el.remove());

    const bar1Select = findBarAttributeField(root, 1);
    const bar2Select = findBarAttributeField(root, 2);
    if (!bar1Select || !bar2Select) {
        logSelectorDebug(root, app);
        return;
    }

    const target = app.token ?? app.document?.prototypeToken ?? app.document;
    const rule1 = foundry.utils.hasProperty(target, "flags.split-bars.rule1")
        ? target.getFlag(MODULE_ID, "rule1")
        : "";
    const rule2 = foundry.utils.hasProperty(target, "flags.split-bars.rule2")
        ? target.getFlag(MODULE_ID, "rule2")
        : "";
    const negRange1 = target.getFlag(MODULE_ID, "negativeRange1");
    const negRange2 = target.getFlag(MODULE_ID, "negativeRange2");
    const neg1Val = negRange1 === "positive" ? "positive" : "full";
    const neg2Val = negRange2 === "positive" ? "positive" : "full";

    const bar1Group = findFieldRow(bar1Select);
    const bar2Group = findFieldRow(bar2Select);
    if (!bar1Group || !bar2Group) return;

    bar1Group.insertAdjacentHTML(
        "afterend",
        `<div class="form-group split-bars-rule"><label title="Bar fill snaps down to these thresholds (e.g. 1/3: for thirds)">Bar 1 Threshold Rule</label><div class="form-fields"><input type="text" name="flags.${MODULE_ID}.rule1" value="${foundry.utils.escapeHTML(rule1 ?? "")}"></div></div>
        <div class="form-group split-bars-rule"><label title="When Positive only, fractional rules split only 0..max">Bar 1 Fraction Range</label><div class="form-fields"><select name="flags.${MODULE_ID}.negativeRange1"><option value="full" ${neg1Val === "full" ? "selected" : ""}>Full (min..max)</option><option value="positive" ${neg1Val === "positive" ? "selected" : ""}>Positive only (0..max)</option></select></div></div>`
    );
    bar2Group.insertAdjacentHTML(
        "afterend",
        `<div class="form-group split-bars-rule"><label title="Bar fill snaps down to these thresholds (e.g. 1/3: for thirds)">Bar 2 Threshold Rule</label><div class="form-fields"><input type="text" name="flags.${MODULE_ID}.rule2" value="${foundry.utils.escapeHTML(rule2 ?? "")}"></div></div>
        <div class="form-group split-bars-rule"><label title="When 'Positive only', fractional rules like 1/3: split only 0..max, not the negative winded range">Bar 2 Fraction Range</label><div class="form-fields"><select name="flags.${MODULE_ID}.negativeRange2"><option value="full" ${neg2Val === "full" ? "selected" : ""}>Full (min..max)</option><option value="positive" ${neg2Val === "positive" ? "selected" : ""}>Positive only (0..max)</option></select></div></div>`
    );
}

function scheduleSplitBarInjection(app, html) {
    const root = getRootElement(html);
    if (!root) return;

    for (const delay of [0, 50, 150, 300]) {
        globalThis.setTimeout(() => injectSplitBarFields(app, root), delay);
    }

    if (root.dataset.splitBarsTabWatcher === "true") return;
    root.dataset.splitBarsTabWatcher = "true";

    root.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-tab]") : null;
        if (!target || target.dataset.tab !== "resources") return;
        for (const delay of [0, 50, 150, 300]) {
            globalThis.setTimeout(() => injectSplitBarFields(app, root), delay);
        }
    });
}

function isTokenConfigApplication(app) {
    const appName = app?.constructor?.name;
    return appName === "TokenConfig" || appName === "PrototypeTokenConfig";
}

Hooks.on("renderApplicationV2", (app, html) => {
    if (!isTokenConfigApplication(app)) return;
    scheduleSplitBarInjection(app, html);
});

Hooks.on("renderTokenApplication", (app, html) => {
    scheduleSplitBarInjection(app, html);
});

Hooks.on("renderTokenConfig", (app, html) => {
    scheduleSplitBarInjection(app, html);
});

Hooks.on("renderPrototypeTokenConfig", (app, html) => {
    scheduleSplitBarInjection(app, html);
});