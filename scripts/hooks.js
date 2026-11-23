import { MODULE_ID } from "./constants.js";
import { moduleEffects, refreshOpenSheets, syncActor, syncAllActors } from "./effects.js";
import { getHostId, isHostType, isSpellheart } from "./validation.js";
import { decorateActorSheet, decorateItemSheet } from "./ui/sheet.js";

function isInternal(options) {
    return !!options?.[MODULE_ID]?.internal;
}

export function registerHooks() {
    // Copies of an affixed spellheart (duplicate, drag to another actor, split) start out unattached
    Hooks.on("preCreateItem", (item, _data, options) => {
        if (isInternal(options)) return;
        if (item.flags?.[MODULE_ID]?.host && item.type !== "effect") {
            item.updateSource({ [`flags.${MODULE_ID}.host`]: null });
        }
    });

    // Equip / unequip a host, or change an affix flag from outside the module API
    Hooks.on("updateItem", (item, changes, options, userId) => {
        if (userId !== game.user.id || isInternal(options) || !item.actor) return;
        const relevant =
            foundry.utils.hasProperty(changes, "system.equipped") ||
            foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) ||
            foundry.utils.hasProperty(changes, "system.traits") ||
            foundry.utils.hasProperty(changes, "system.usage");
        if (!relevant) return;
        if (isHostType(item) || isSpellheart(item)) {
            syncActor(item.actor).then(() => refreshOpenSheets(item.actor));
        }
    });

    // A host or spellheart was deleted (or sold / moved to another actor)
    Hooks.on("deleteItem", (item, options, userId) => {
        if (userId !== game.user.id || isInternal(options) || !item.actor) return;
        const actor = item.actor;
        const isAffixed = !!getHostId(item);
        const wasHost = isHostType(item) && actor.items.some((i) => getHostId(i) === item.id);
        const hasEffects = moduleEffects(actor).some((e) => e.flags[MODULE_ID].spellheart === item.id);
        if (isAffixed || wasHost || hasEffects) syncActor(actor).then(() => refreshOpenSheets(actor));
    });

    Hooks.on("renderCharacterSheetPF2e", (app, html) => {
        decorateActorSheet(app, html);
    });

    Hooks.on("renderItemSheetPF2e", (app, html) => {
        decorateItemSheet(app, html);
    });

    Hooks.once("ready", () => {
        // GM repair pass: fix links and effects left over from deleted items, settings changes or updates
        syncAllActors();
    });
}
