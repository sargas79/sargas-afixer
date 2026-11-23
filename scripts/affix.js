import { INTERNAL, MODULE_ID, esc, loc, setting } from "./constants.js";
import { activateEffect, refreshOpenSheets, syncActor } from "./effects.js";
import { canHost, getHost, isSpellheart } from "./validation.js";

/** Split one unit off a stack and return the new single item */
async function splitOne(item) {
    const source = item.toObject();
    delete source._id;
    source.system.quantity = 1;
    if (source.flags?.[MODULE_ID]) delete source.flags[MODULE_ID];
    await item.update({ "system.quantity": item.quantity - 1 }, INTERNAL);
    const [created] = await item.actor.createEmbeddedDocuments("Item", [source], INTERNAL);
    return created;
}

async function postChat(actor, content) {
    if (!setting("chatMessages")) return;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sargas-affixer-chat">${content}</div>`,
    });
}

/**
 * Affix a spellheart to a piece of armor, a weapon or a shield owned by the same actor.
 * @returns the affixed spellheart (may be a new item split from a stack), or null if cancelled
 */
export async function affix(spellheart, host, { skipConfirm = false } = {}) {
    const check = canHost(spellheart, host);
    if (!check.ok) {
        ui.notifications.warn(check.reason);
        return null;
    }
    if (check.needsConfirm && !skipConfirm) {
        const ok = await foundry.applications.api.DialogV2.confirm({
            window: { title: loc("Confirm.Title") },
            content: `<p>${esc(check.needsConfirm)}</p>`,
            rejectClose: false,
        });
        if (!ok) return null;
    }

    const actor = spellheart.actor;
    if (getHost(spellheart)) await detach(spellheart, { silent: true });

    const target = spellheart.quantity > 1 ? await splitOne(spellheart) : spellheart;
    const hostItem = host.quantity > 1 ? await splitOne(host) : host;

    await target.update({ [`flags.${MODULE_ID}.host`]: hostItem.id }, INTERNAL);
    await syncActor(actor);
    refreshOpenSheets(actor);

    await postChat(
        actor,
        loc("Chat.Affixed", { actor: esc(actor.name), spellheart: esc(target.name), host: esc(hostItem.name) }),
    );
    return target;
}

/** Detach a spellheart from its host. It stays in the inventory. */
export async function detach(spellheart, { silent = false } = {}) {
    const host = getHost(spellheart);
    await spellheart.update({ [`flags.${MODULE_ID}.host`]: null }, INTERNAL);
    await syncActor(spellheart.actor);
    refreshOpenSheets(spellheart.actor);
    if (!silent && host) {
        await postChat(
            spellheart.actor,
            loc("Chat.Detached", { actor: esc(spellheart.actor.name), spellheart: esc(spellheart.name), host: esc(host.name) }),
        );
    }
}

/** Apply one of the spellheart's activated (timed) benefits */
export async function activate(spellheart, effectUuid) {
    const host = getHost(spellheart);
    if (!host) {
        ui.notifications.warn(loc("Warn.NotAffixed", { name: spellheart.name }));
        return null;
    }
    if (setting("requireEquipped") && !host.isEquipped) {
        ui.notifications.warn(loc("Warn.HostNotEquipped", { host: host.name }));
        return null;
    }
    return activateEffect(spellheart, host, effectUuid);
}

export { isSpellheart };
