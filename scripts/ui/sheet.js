import { esc, loc, setting } from "../constants.js";
import { activate, detach } from "../affix.js";
import { effectsForHost, effectsOf, refreshOpenSheets, syncActor, tierSlugFor } from "../effects.js";
import { summarizeEffect } from "../summary.js";
import { getAttachments, getHost, isHostType, isSpellheart } from "../validation.js";
import { openAffixPicker } from "./picker.js";

function rootOf(app, html) {
    if (html instanceof HTMLElement) return html;
    if (html?.[0] instanceof HTMLElement) return html[0];
    const el = app?.element;
    return el instanceof HTMLElement ? el : (el?.[0] ?? null);
}

function hostIsActive(host) {
    return !setting("requireEquipped") || host.isEquipped;
}

function html(strings) {
    const template = document.createElement("template");
    template.innerHTML = strings.trim();
    return template.content.firstElementChild;
}

function durationLabel(doc) {
    const d = doc.system?.duration;
    if (!d || d.unit === "unlimited") return "";
    if (d.unit === "encounter") return loc("Duration.Encounter");
    return loc("Duration.Value", { value: d.value, unit: game.i18n.localize(CONFIG.PF2E?.timeUnits?.[d.unit] ?? d.unit) });
}

async function summaryList(info, live, spellheart, host) {
    const tierSlug = await tierSlugFor(spellheart, info.doc._source?.system?.rules ?? info.doc.system?.rules ?? []);
    const lines = summarizeEffect(live ?? info.doc, { spellheart, host, tierSlug });
    if (!lines.length) return `<li class="sargas-buff muted">${loc("Panel.SeeDescription")}</li>`;
    return lines
        .map(
            (l) =>
                `<li class="sargas-buff${l.situational ? " situational" : ""}"${
                    l.situational ? ` data-tooltip="${esc(loc("Panel.Situational"))}"` : ""
                }>${esc(l.text)}${l.situational ? ' <i class="fa-solid fa-circle-question"></i>' : ""}</li>`,
        )
        .join("");
}

/** Build the "affixed spellhearts and what they grant" panel for a host item */
export async function buildHostPanel(host, { editable }) {
    const attachments = getAttachments(host);
    if (!attachments.length) return null;
    const active = hostIsActive(host);

    const entries = [];
    for (const spellheart of attachments) {
        const { passive, activated } = await effectsForHost(spellheart, host);
        const applied = effectsOf(spellheart);
        const stateKey = active ? "Panel.Active" : "Panel.Inactive";
        const stateTip = active ? "" : ` data-tooltip="${esc(loc("Panel.InactiveHint", { host: host.name }))}"`;

        const passiveParts = [];
        for (const info of passive) {
            const live = applied.find((e) => e.flags["sargas-affixer"].effect === info.uuid);
            const missing = active && !live;
            const reapply = editable
                ? `<button type="button" class="sargas-activate" data-sargas-action="reapply"><i class="fa-solid fa-rotate"></i> ${loc("Panel.Reapply")}</button>`
                : "";
            const missingHtml = missing
                ? `<span class="sargas-missing" data-tooltip="${esc(loc("Panel.MissingHint"))}"><i class="fa-solid fa-triangle-exclamation"></i> ${loc("Panel.Missing")}</span>${reapply}`
                : "";
            passiveParts.push(`<div class="sargas-effect passive${live ? " applied" : ""}${missing ? " missing" : ""}">
                    <div class="sargas-effect-head">
                        <img src="${esc(info.img)}" alt="">
                        <a class="sargas-effect-name" data-sargas-action="open-effect" data-effect-id="${live?.id ?? ""}" data-effect-uuid="${esc(info.uuid)}">${esc(info.name)}</a>
                        <span class="sargas-tag">${loc("Panel.Passive")}</span>
                        ${missingHtml}
                    </div>
                    <ul class="sargas-buffs">${await summaryList(info, live, spellheart, host)}</ul>
                </div>`);
        }
        const passiveHtml = passiveParts.join("");

        const activatedParts = [];
        for (const info of activated) {
            const live = applied.find((e) => e.flags["sargas-affixer"].effect === info.uuid);
            const duration = durationLabel(info.doc);
            const button =
                editable && active
                    ? `<button type="button" class="sargas-activate" data-sargas-action="activate" data-effect-uuid="${esc(info.uuid)}">
                        <i class="fa-solid fa-bolt"></i> ${live ? loc("Panel.Reactivate") : loc("Panel.Activate")}</button>`
                    : "";
            activatedParts.push(`<div class="sargas-effect activated${live ? " applied" : ""}">
                <div class="sargas-effect-head">
                    <img src="${esc(info.img)}" alt="">
                    <a class="sargas-effect-name" data-sargas-action="open-effect" data-effect-id="${live?.id ?? ""}" data-effect-uuid="${esc(info.uuid)}">${esc(info.name)}</a>
                    <span class="sargas-tag">${live ? loc("Panel.Running") : loc("Panel.OnActivation")}${duration ? ` · ${esc(duration)}` : ""}</span>
                    ${button}
                </div>
                <ul class="sargas-buffs">${await summaryList(info, live, spellheart, host)}</ul>
            </div>`);
        }
        const activatedHtml = activatedParts.join("");

        const manual =
            !passive.length && !activated.length ? `<p class="sargas-manual">${loc("Panel.NoAutomation")}</p>` : "";

        const controls = editable
            ? `<a data-sargas-action="chat" data-tooltip="${esc(loc("Panel.PostToChat"))}"><i class="fa-solid fa-message"></i></a>
               <a data-sargas-action="detach" data-tooltip="${esc(loc("Panel.Detach"))}"><i class="fa-solid fa-link-slash"></i></a>`
            : "";

        entries.push(`<div class="sargas-entry" data-spellheart-id="${spellheart.id}">
            <div class="sargas-entry-head">
                <img src="${esc(spellheart.img)}" alt="">
                <a class="sargas-entry-name" data-sargas-action="open-spellheart">${esc(spellheart.name)}</a>
                <span class="sargas-mode">${loc(`HostType.${host.type}`)}</span>
                <span class="sargas-state ${active ? "active" : "inactive"}"${stateTip}>${loc(stateKey)}</span>
                <span class="sargas-entry-controls">${controls}</span>
            </div>
            ${passiveHtml}${activatedHtml}${manual}
        </div>`);
    }

    const panel = html(`<div class="sargas-affix-panel">${entries.join("")}</div>`);
    panel.addEventListener("click", (event) => onPanelClick(event, host));
    return panel;
}

async function onPanelClick(event, host) {
    const target = event.target.closest("[data-sargas-action]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const entry = target.closest("[data-spellheart-id]");
    const spellheart = entry ? host.actor?.items.get(entry.dataset.spellheartId) : null;
    if (!spellheart) return;

    switch (target.dataset.sargasAction) {
        case "open-spellheart":
            return spellheart.sheet.render(true);
        case "open-effect": {
            const live = target.dataset.effectId ? host.actor.items.get(target.dataset.effectId) : null;
            const doc = live ?? (await fromUuid(target.dataset.effectUuid));
            return doc?.sheet.render(true);
        }
        case "chat":
            return spellheart.toMessage?.(event);
        case "detach":
            return detach(spellheart);
        case "activate":
            return activate(spellheart, target.dataset.effectUuid);
        case "reapply":
            await syncActor(host.actor);
            return refreshOpenSheets(host.actor);
    }
}

function decorateSpellheartRow(li, item, editable) {
    const host = getHost(item);
    const nameBox = li.querySelector(":scope > .data .item-name");
    if (host && nameBox) {
        nameBox.append(
            html(`<span class="sargas-affixed-to" data-tooltip="${esc(loc("Row.AffixedTo", { host: host.name }))}">
                <i class="fa-solid fa-link"></i> ${esc(host.name)}</span>`),
        );
    }

    const controls = li.querySelector(":scope > .data .item-controls");
    if (!editable || !controls) return;
    const control = host
        ? html(`<a class="sargas-control" data-tooltip="${esc(loc("Row.Detach"))}"><i class="fa-solid fa-link-slash fa-fw"></i></a>`)
        : html(`<a class="sargas-control" data-tooltip="${esc(loc("Row.Affix"))}"><i class="fa-solid fa-link fa-fw"></i></a>`);
    control.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (getHost(item)) detach(item);
        else openAffixPicker(item);
    });
    controls.prepend(control);
}

async function decorateHostRow(li, host, editable) {
    const attachments = getAttachments(host);
    const h4 = li.querySelector(":scope > .data .item-name h4");
    if (h4) {
        const active = hostIsActive(host);
        const badges = attachments
            .map(
                (a) =>
                    `<img class="sargas-badge${active ? "" : " inactive"}" src="${esc(a.img)}" alt="" data-tooltip="${esc(
                        `${a.name} — ${loc(active ? "Panel.Active" : "Panel.Inactive")}`,
                    )}">`,
            )
            .join("");
        h4.after(html(`<span class="sargas-badges">${badges}</span>`));
    }

    if (!setting("showPanel")) return;
    const panel = await buildHostPanel(host, { editable });
    const data = li.querySelector(":scope > .data");
    if (panel && data?.isConnected) data.after(panel);
}

/** renderCharacterSheetPF2e */
export async function decorateActorSheet(app, htmlArg) {
    const root = rootOf(app, htmlArg);
    const actor = app.actor;
    if (!root || !actor) return;
    const editable = app.isEditable ?? actor.isOwner;

    const rows = root.querySelectorAll("[data-inventory] li[data-item-id], .inventory-list li[data-item-id]");
    for (const li of rows) {
        if (li.dataset.sargasDecorated) continue;
        li.dataset.sargasDecorated = "true";
        const item = actor.items.get(li.dataset.itemId);
        if (!item) continue;
        try {
            if (isSpellheart(item)) decorateSpellheartRow(li, item, editable);
            if (isHostType(item) && getAttachments(item).length) await decorateHostRow(li, item, editable);
        } catch (err) {
            console.error("sargas-affixer | Failed to decorate inventory row", item.name, err);
        }
    }
}

/** renderItemSheetPF2e */
export async function decorateItemSheet(app, htmlArg) {
    const root = rootOf(app, htmlArg);
    const item = app.item ?? app.document;
    if (!root || !item?.actor) return;
    const target = root.querySelector(".sheet-body section.tab.description") ?? root.querySelector(".sheet-body");
    if (!target || target.querySelector(":scope > .sargas-item-sheet")) return;
    const editable = app.isEditable ?? item.isOwner;

    const wrapper = html(`<section class="sargas-item-sheet"></section>`);
    if (isHostType(item) && getAttachments(item).length) {
        wrapper.append(html(`<h3 class="sargas-heading"><i class="fa-solid fa-link"></i> ${loc("ItemSheet.Affixed")}</h3>`));
        const panel = await buildHostPanel(item, { editable });
        if (panel) wrapper.append(panel);
    } else if (isSpellheart(item)) {
        const host = getHost(item);
        const line = host
            ? html(`<p class="sargas-item-line"><i class="fa-solid fa-link"></i> ${loc("Row.AffixedTo", { host: esc(host.name) })}
                ${editable ? `<button type="button" class="sargas-inline-button">${loc("Row.Detach")}</button>` : ""}</p>`)
            : html(`<p class="sargas-item-line"><i class="fa-solid fa-link-slash"></i> ${loc("ItemSheet.NotAffixed")}
                ${editable ? `<button type="button" class="sargas-inline-button">${loc("Row.Affix")}</button>` : ""}</p>`);
        line.querySelector("button")?.addEventListener("click", (event) => {
            event.preventDefault();
            if (getHost(item)) detach(item);
            else openAffixPicker(item);
        });
        wrapper.append(line);
    } else {
        return;
    }
    if (target.isConnected) target.prepend(wrapper);
}
