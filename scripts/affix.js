import { INTERNAL, MODULE_ID, esc, loc, setting } from "./constants.js";
import { activateEffect, refreshOpenSheets, syncActor } from "./effects.js";
import { canHost, getHost, isSpellheart } from "./validation.js";

/**
 * Reduce a stack to a single unit and move the rest into a new item. The original keeps its id and equipped
 * state, so it becomes the affixed unit; with `unequipRest` the split-off remainder is stowed rather than a
 * second held or worn copy.
 */
async function isolateOne(item, { unequipRest = false } = {}) {
    if (!(item.quantity > 1)) return item;
    const rest = item.toObject();
    delete rest._id;
    rest.system.quantity = item.quantity - 1;
    if (rest.flags?.[MODULE_ID]) delete rest.flags[MODULE_ID];
    if (unequipRest && rest.system.equipped) {
        rest.system.equipped.carryType = "worn";
        rest.system.equipped.handsHeld = 0;
        rest.system.equipped.inSlot = false;
    }
    await item.update({ "system.quantity": 1 }, INTERNAL);
    await item.actor.createEmbeddedDocuments("Item", [rest], INTERNAL);
    return item;
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

    const target = await isolateOne(spellheart);
    const hostItem = await isolateOne(host, { unequipRest: true });

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
