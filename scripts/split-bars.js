const MODULE_ID = 'split-bars';


function drawBars_Wrapper(wrapped, ...args) {
    // Once everything else is done, draw segmentation on top
    const result = wrapped(...args);
    ["bar1", "bar2"].forEach((b, i) => {

        // Check if there's rules for the bar
        const hasRule = (i === 0 && foundry.utils.hasProperty(this.document, "flags.split-bars.rule1"))
            || (i === 1 && foundry.utils.hasProperty(this.document, "flags.split-bars.rule2"));
        if (!hasRule) return;

        if (this.hud?.bars || this.bars) {
            const bar = this.bars?.[b] ?? this.hud?.bars?.[b];
            if (!bar) return;

            const attr = this.document.getBarAttribute(b);
            if (!attr || (attr.type !== "bar")) {
                bar.visible = false;
                return;
            }

            // Get the appropriate rule
            const rawRule = this.document.getFlag(MODULE_ID, i === 0 ? "rule1" : "rule2");
            if (!rawRule || typeof rawRule !== "string") return;
            const statements = rawRule.split(/[; ,]+/);

            for (let ex of statements) {
                let repeat = false;
                if (ex.includes(":")) {
                    repeat = true;
                    ex = ex.replace(/:/g, "");
                }

                if (ex.includes("%")) {
                    ex = ex.replace(/%/g, "");
                    ex = (Number(ex) / 100).toString();
                }

                if (ex.includes("/")) {
                    let div = ex.split("/");
                    div = Number(div[0]) / Number(div[1]);
                    if ((div > 1) || (div <= 0) || !Number.isFinite(div)) {
                        console.warn(`Split Bars | Unsupported division argument: '${ex}'!`);
                    }
                    ex = div.toString();
                }

                if (ex === "") {
                    console.warn("Split Bars | Expression is empty or consists only of command characters. The ':', '/' and '%' characters only work in conjunction with numerical values.");
                    continue;
                }
                let pct = Number(ex);

                if (Number.isNaN(pct)) {
                    console.warn(`Split Bars | "${ex}" is not a supported expression!`);
                    continue;
                }
                const attrMin = Number.isFinite(Number(attr.min)) ? Number(attr.min) : 0;
                const attrMax = Number(attr.max);
                const attrRange = attrMax - attrMin;
                const isAbsolute = pct >= 1 || pct <= 0;

                if (isAbsolute) {
                    if ((pct < attrMin) || (pct > attrMax)) {
                        console.warn(`Split Bars | "${ex}" is outside permissible values!`);
                        continue;
                    }
                    if (attrRange <= 0 || !Number.isFinite(attrRange)) {
                        console.warn(`Split Bars | "${ex}" cannot be evaluated for this bar's range!`);
                        continue;
                    }
                    pct = (pct - attrMin) / attrRange;
                } else if ((pct <= 0) || (pct >= 1)) {
                    console.warn(`Split Bars | "${ex}" is outside permissible values!`);
                    continue;
                }

                const step = pct;
                do {
                    // Round to five decimal places to avoid floating point errors.
                    pct = Math.round(pct * 100000) / 100000;
                    if ((pct <= 0) || (pct >= 1)) break;
                    draw_line(this, bar, pct);
                    pct += step;
                }
                while (repeat && (pct < 1));
            }
        }
    });

    return result;
}

function draw_line(ref, bar, pct) {
    let h = bar.height || Math.max((canvas.dimensions.size / 12), 8);
    const w = bar.width || ref.w;
    const bs = Math.clamp(h / 8, 1, 2);
    if (ref.document.height >= 2) h *= 1.6;  // Enlarge the bar for large tokens

    // Determine the color to use
    const blk = 0x000000;

    // Draw the bar
    bar.lineStyle(bs, blk, 1).moveTo(pct*w, 0).lineTo(pct*w, h)
}

Hooks.once('setup', function () {
    if (!game.modules.get('lib-wrapper')?.active || !globalThis.libWrapper) return;
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

    const bar1Group = findFieldRow(bar1Select);
    const bar2Group = findFieldRow(bar2Select);
    if (!bar1Group || !bar2Group) return;

    bar1Group.insertAdjacentHTML(
        "afterend",
        `<div class="form-group split-bars-rule"><label>Bar 1 Split Rule</label><div class="form-fields"><input type="text" name="flags.${MODULE_ID}.rule1" value="${foundry.utils.escapeHTML(rule1 ?? "")}"></div></div>`
    );
    bar2Group.insertAdjacentHTML(
        "afterend",
        `<div class="form-group split-bars-rule"><label>Bar 2 Split Rule</label><div class="form-fields"><input type="text" name="flags.${MODULE_ID}.rule2" value="${foundry.utils.escapeHTML(rule2 ?? "")}"></div></div>`
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