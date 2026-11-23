import { HOST_TYPES, esc, loc } from "../constants.js";
import { affix } from "../affix.js";
import { canHost, getAttachments, getHost } from "../validation.js";

/** Open a dialog listing the actor's armor/weapons/shields and affix the spellheart to the chosen one */
export async function openAffixPicker(spellheart) {
    const actor = spellheart.actor;
    if (!actor) return null;

    const current = getHost(spellheart);
    const candidates = actor.items
        .filter((i) => HOST_TYPES.includes(i.type))
        .map((host) => {
            const check = canHost(spellheart, host);
            const attached = getAttachments(host).filter((i) => i.id !== spellheart.id);
            return { host, check, attached };
        })
        .sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || a.host.name.localeCompare(b.host.name));

    if (!candidates.some((c) => c.check.ok)) {
        ui.notifications.warn(loc("Warn.NoValidHosts", { name: spellheart.name }));
        return null;
    }

    const firstValid = candidates.find((c) => c.check.ok)?.host.id;
    const rows = candidates
        .map(({ host, check, attached }) => {
            const disabled = !check.ok;
            const badges = attached
                .map((a) => `<img class="sargas-mini" src="${esc(a.img)}" data-tooltip="${esc(a.name)}" alt="">`)
                .join("");
            const hint = disabled
                ? esc(check.reason)
                : [
                      loc(`HostType.${host.type}`),
                      host.isEquipped ? loc("Picker.Equipped") : loc("Picker.NotEquipped"),
                      host.id === current?.id ? loc("Picker.Current") : "",
                  ]
                      .filter(Boolean)
                      .join(" · ");
            return `<label class="sargas-host${disabled ? " disabled" : ""}">
                <input type="radio" name="host" value="${host.id}"${disabled ? " disabled" : ""}${host.id === firstValid ? " checked" : ""}>
                <img src="${esc(host.img)}" alt="">
                <span class="sargas-host-name">${esc(host.name)}</span>
                <span class="sargas-host-badges">${badges}</span>
                <span class="sargas-host-hint">${hint}</span>
            </label>`;
        })
        .join("");

    const content = `<p>${loc("Picker.Prompt", { name: esc(spellheart.name) })}</p>
        <div class="sargas-picker">${rows}</div>
        <p class="sargas-picker-note">${loc("Picker.ActivityNote")}</p>`;

    const hostId = await foundry.applications.api.DialogV2.wait({
        window: { title: loc("Picker.Title", { name: spellheart.name }), icon: "fa-solid fa-link" },
        classes: ["sargas-affixer-picker"],
        content,
        buttons: [
            {
                action: "affix",
                label: loc("Picker.Affix"),
                icon: "fa-solid fa-link",
                default: true,
                callback: (_event, button) => button.form?.elements?.host?.value || null,
            },
            { action: "cancel", label: loc("Picker.Cancel"), icon: "fa-solid fa-xmark", callback: () => null },
        ],
        rejectClose: false,
    });

    const host = hostId ? actor.items.get(hostId) : null;
    if (!host) return null;
    return affix(spellheart, host);
}
