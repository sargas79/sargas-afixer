export const MODULE_ID = "sargas-affixer";

/** Compendium holding the PF2e system's spellheart benefit effects */
export const EFFECTS_PACK = "pf2e.equipment-effects";

/** Item types that can carry an affixed spellheart */
export const HOST_TYPES = ["armor", "weapon", "shield"];

/** Update/create option used to mark changes made by this module so our own hooks skip them */
export const INTERNAL = { [MODULE_ID]: { internal: true } };

export function setting(key) {
    return game.settings.get(MODULE_ID, key);
}

export function loc(key, data) {
    const full = `SARGAS_AFFIXER.${key}`;
    return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function esc(value) {
    return Handlebars.escapeExpression(String(value ?? ""));
}
