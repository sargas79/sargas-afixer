import { HOST_TYPES, MODULE_ID, loc, setting } from "./constants.js";

/** Precious materials that are metal. Anything else is checked against NON_METAL_MATERIALS. */
const METAL_MATERIALS = new Set([
    "abysium",
    "adamantine",
    "cold-iron",
    "dawnsilver",
    "djezet",
    "inubrix",
    "mithral",
    "noqual",
    "orichalcum",
    "siccatite",
    "silver",
    "sovereign-steel",
]);
const NON_METAL_MATERIALS = new Set([
    "darkwood",
    "duskwood",
    "dragonhide",
    "grisantian-pelt",
    "peachwood",
    "sisterstone",
    "sloughstone",
    "warpglass",
    "wood",
]);

export function isSpellheart(item) {
    return !!item?.isOfType?.("physical") && (item.system.traits?.value ?? []).includes("spellheart");
}

export function isHostType(item) {
    return !!item && HOST_TYPES.includes(item.type);
}

/**
 * Parse a PF2e usage key such as "affixed-to-metal-armor-or-a-weapon" into host requirements.
 * Returns null if the key is not an "affixed-to" usage.
 */
export function parseUsage(usageKey) {
    if (typeof usageKey !== "string" || !usageKey.startsWith("affixed-to-")) return null;
    const rest = usageKey.slice("affixed-to-".length);
    const req = { armor: null, weapon: null, shield: false };
    for (const raw of rest.split("-or-")) {
        const segment = raw.replace(/^(?:a|an)-/, "");
        const metal = segment.startsWith("non-metal-") ? false : segment.startsWith("metal-") ? true : null;
        if (segment.includes("armor")) req.armor = { metal };
        if (segment.includes("shield")) req.shield = true;
        if (segment.includes("weapon")) {
            req.weapon = {
                metal,
                melee: segment.includes("melee"),
                ranged: segment.includes("ranged"),
                groups: null,
            };
        }
        const groups = ["firearm", "crossbow", "bow"].filter((g) => new RegExp(`(^|-)${g}($|-)`).test(segment));
        if (groups.length) {
            req.weapon ??= { metal: null, melee: false, ranged: false, groups: [] };
            req.weapon.groups = [...(req.weapon.groups ?? []), ...groups];
        }
    }
    return req;
}

/** true = metal, false = not metal, null = can't tell */
export function isMetal(item) {
    const material = item.system.material?.type;
    const traits = item.system.traits?.value ?? [];
    if (traits.includes("metal") || METAL_MATERIALS.has(material)) return true;
    if (traits.includes("wood") || NON_METAL_MATERIALS.has(material)) return false;
    return null;
}

export function slotLimit(actor) {
    let limit = setting("maxAffixes");
    if (setting("talismanicSage") && actor?.itemTypes?.feat?.some((f) => f.slug === "talismanic-sage")) limit += 1;
    return limit;
}

export function getHostId(item) {
    return item?.flags?.[MODULE_ID]?.host ?? null;
}

export function getHost(item) {
    const id = getHostId(item);
    return id ? (item.actor?.items.get(id) ?? null) : null;
}

export function getAttachments(host) {
    if (!host?.actor) return [];
    return host.actor.items.filter((i) => getHostId(i) === host.id);
}

/** "armor" | "weapon" | "shield" — which benefit of the spellheart applies */
export function hostMode(host) {
    return host.type;
}

/**
 * Check whether `spellheart` may be affixed to `host`.
 * @returns {{ok: boolean, reason?: string, needsConfirm?: string}}
 */
export function canHost(spellheart, host) {
    if (!isSpellheart(spellheart)) return { ok: false, reason: loc("Warn.NotSpellheart", { name: spellheart?.name }) };
    if (!host?.actor || host.actor !== spellheart.actor) return { ok: false, reason: loc("Warn.DifferentActor") };
    if (!isHostType(host)) return { ok: false, reason: loc("Warn.InvalidHostType", { host: host.name }) };

    const req = parseUsage(spellheart.system.usage?.value) ?? { armor: { metal: null }, weapon: { metal: null }, shield: false };
    let needsConfirm;

    const checkMetal = (wanted) => {
        if (wanted === null || wanted === undefined) return null;
        const metal = isMetal(host);
        if (metal === null) {
            needsConfirm = loc(wanted ? "Confirm.Metal" : "Confirm.NonMetal", { host: host.name });
            return null;
        }
        return metal === wanted ? null : loc(wanted ? "Warn.NeedsMetal" : "Warn.NeedsNonMetal", { host: host.name });
    };

    if (host.type === "armor") {
        if (!req.armor) return { ok: false, reason: loc("Warn.NotForArmor", { name: spellheart.name }) };
        const err = checkMetal(req.armor.metal);
        if (err) return { ok: false, reason: err };
    } else if (host.type === "weapon") {
        if (!req.weapon) return { ok: false, reason: loc("Warn.NotForWeapon", { name: spellheart.name }) };
        if (req.weapon.melee && !host.isMelee) return { ok: false, reason: loc("Warn.NeedsMelee", { host: host.name }) };
        if (req.weapon.ranged && !host.isRanged) return { ok: false, reason: loc("Warn.NeedsRanged", { host: host.name }) };
        if (req.weapon.groups?.length && !req.weapon.groups.includes(host.system.group)) {
            return { ok: false, reason: loc("Warn.WrongGroup", { host: host.name }) };
        }
        const err = checkMetal(req.weapon.metal);
        if (err) return { ok: false, reason: err };
    } else if (host.type === "shield") {
        if (!req.shield) return { ok: false, reason: loc("Warn.NotForShield", { name: spellheart.name }) };
    }

    const others = getAttachments(host).filter((i) => i.id !== spellheart.id);
    const limit = slotLimit(host.actor);
    if (others.length >= limit) return { ok: false, reason: loc("Warn.NoSlots", { host: host.name, limit }) };

    return { ok: true, needsConfirm };
}
