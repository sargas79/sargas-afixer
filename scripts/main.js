import { MODULE_ID } from "./constants.js";
import { activate, affix, detach } from "./affix.js";
import { findEffectsFor, syncActor, syncAllActors } from "./effects.js";
import { registerHooks } from "./hooks.js";
import { registerSettings } from "./settings.js";
import { summarizeEffect } from "./summary.js";
import { openAffixPicker } from "./ui/picker.js";
import { canHost, getAttachments, getHost, isSpellheart } from "./validation.js";

Hooks.once("init", () => {
    if (game.system.id !== "pf2e") {
        console.warn(`${MODULE_ID} | This module requires the Pathfinder 2e system.`);
        return;
    }
    registerSettings();
    registerHooks();

    game.modules.get(MODULE_ID).api = {
        affix,
        detach,
        activate,
        openAffixPicker,
        canHost,
        getHost,
        getAttachments,
        isSpellheart,
        findEffectsFor,
        summarizeEffect,
        syncActor,
        syncAllActors,
    };
});
