import { EFFECTS_PACK, INTERNAL, MODULE_ID, loc, setting } from "./constants.js";
import { OVERRIDES } from "./mapping.js";
import { getHostId, isHostType, isSpellheart } from "./validation.js";

const LINK_RE = /@UUID\[(Compendium\.pf2e\.equipment-effects\.(?:Item\.)?[^\]]+)\]/g;
const TIER_RE = /\s*\((?:Lesser|Minor|Moderate|Greater|Major|True)\)\s*$/i;

/** cache key → Promise<EffectInfo[]> */
const infoCache = new Map();

function sluggify(text) {
    return game.pf2e?.system?.sluggify?.(text) ?? String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function slugOf(item) {
    return item.slug ?? sluggify(item.name);
}

async function getSourceItem(item) {
    const uuid = item.sourceId ?? item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
    if (!uuid) return null;
    try {
        return await fromUuid(uuid);
    } catch {
        return null;
    }
}

/**
 * @typedef {object} EffectInfo
 * @property {string} uuid
 * @property {string} name
 * @property {string} img
 * @property {boolean} armor
 * @property {boolean} weapon
 * @property {boolean} melee   only for melee weapons
 * @property {boolean} ranged  only for ranged weapons
 * @property {boolean} passive always on while affixed (vs. applied on activation)
 * @property {object}  doc     the compendium effect document
 */

/** Find the PF2e equipment effects that implement a spellheart's benefits */
export function findEffectsFor(spellheart) {
    const key = spellheart.sourceId ?? spellheart.name;
    if (!infoCache.has(key)) {
        const promise = loadEffectInfos(spellheart).catch((err) => {
            console.error(`${MODULE_ID} | Failed to look up effects for ${spellheart.name}`, err);
            infoCache.delete(key);
            return [];
        });
        infoCache.set(key, promise);
    }
    return infoCache.get(key);
}

async function loadEffectInfos(spellheart) {
    const pack = game.packs.get(EFFECTS_PACK);
    if (!pack) return [];

    const sourceItem = await getSourceItem(spellheart);
    const baseName = (sourceItem?.name ?? spellheart.name).replace(TIER_RE, "").trim();
    const overrides = OVERRIDES[baseName] ?? {};

    const uuids = new Set(overrides.include ?? []);
    const descriptions = [spellheart._source.system.description?.value, sourceItem?._source?.system?.description?.value];
    for (const text of descriptions) {
        for (const match of (text ?? "").matchAll(LINK_RE)) uuids.add(match[1]);
    }

    const prefix = `Effect: ${baseName}`;
    const index = await pack.getIndex();
    for (const entry of index) {
        if (entry.name === prefix || entry.name.startsWith(`${prefix} `)) {
            uuids.add(entry.uuid ?? `Compendium.${EFFECTS_PACK}.Item.${entry._id}`);
        }
    }

    const docs = new Map();
    for (const uuid of uuids) {
        let doc = null;
        try {
            doc = await fromUuid(uuid);
        } catch {
            doc = null;
        }
        if (!doc || doc.type !== "effect") continue;
        if ((overrides.exclude ?? []).includes(doc.name)) continue;
        docs.set(doc.uuid, doc);
    }

    return [...docs.values()].map((doc) => {
        const suffix = doc.name.toLowerCase().replace(prefix.toLowerCase(), "");
        let armor = suffix.includes("armor");
        let weapon = suffix.includes("weapon");
        if (!armor && !weapon) armor = weapon = true;
        const forced = overrides.passive?.[doc.name];
        return {
            uuid: doc.uuid,
            name: doc.name,
            img: doc.img,
            armor,
            weapon,
            melee: suffix.includes("melee weapon"),
            ranged: suffix.includes("ranged weapon"),
            passive: typeof forced === "boolean" ? forced : doc.system.duration?.unit === "unlimited",
            doc,
        };
    });
}

export function effectMatchesHost(info, host) {
    if (host.type === "armor") return info.armor;
    if (host.type === "weapon") {
        if (!info.weapon) return false;
        if (info.melee && !host.isMelee) return false;
        if (info.ranged && !host.isRanged) return false;
        return true;
    }
    return false;
}

/** Effects for this spellheart that apply to its current host, split by passive/activated */
export async function effectsForHost(spellheart, host) {
    const infos = (await findEffectsFor(spellheart)).filter((i) => effectMatchesHost(i, host));
    return { passive: infos.filter((i) => i.passive), activated: infos.filter((i) => !i.passive) };
}

function predicateMentions(predicate, atom) {
    return JSON.stringify(predicate ?? []).includes(JSON.stringify(atom));
}

/** Tier slug used by the effect's ChoiceSet ("flaming-star-greater"), preferring the compendium original */
async function tierSlugFor(spellheart, rules) {
    const own = slugOf(spellheart);
    const mentions = (slug) =>
        rules.some(
            (r) =>
                r.key === "ChoiceSet" &&
                Array.isArray(r.choices) &&
                r.choices.some((c) => predicateMentions(c.predicate, `parent:origin:item:slug:${slug}`)),
        );
    if (mentions(own)) return own;
    const source = await getSourceItem(spellheart);
    const sourceSlug = source ? slugOf(source) : null;
    return sourceSlug && mentions(sourceSlug) ? sourceSlug : own;
}

/** Build an effect source with origin context and ChoiceSet pre-selections filled in */
export async function buildEffectSource(info, spellheart, host, { passive }) {
    const actor = spellheart.actor;
    const source = info.doc.toObject();
    delete source._id;
    source._stats ??= {};
    source._stats.compendiumSource = info.uuid;

    const rules = source.system.rules ?? [];
    const tierSlug = await tierSlugFor(spellheart, rules);
    const rollOptions = spellheart.getOriginData?.().rollOptions ?? [];
    const tierOption = `origin:item:slug:${tierSlug}`;
    if (!rollOptions.includes(tierOption)) rollOptions.push(tierOption);

    source.system.context = {
        origin: {
            actor: actor.uuid,
            token: null,
            item: spellheart.uuid,
            spellcasting: null,
            rollOptions,
        },
        target: null,
        roll: null,
    };

    for (const rule of rules) {
        if (rule.key !== "ChoiceSet" || rule.selection !== undefined) continue;
        if (Array.isArray(rule.choices)) {
            const match = rule.choices.find((c) => predicateMentions(c.predicate, `parent:origin:item:slug:${tierSlug}`));
            if (match) rule.selection = match.value;
        } else if (rule.choices?.ownedItems && (rule.choices.types ?? []).includes(host.type)) {
            rule.selection = host.id;
        }
    }

    source.flags ??= {};
    source.flags[MODULE_ID] = { spellheart: spellheart.id, host: host.id, effect: info.uuid, passive };
    return source;
}

export function moduleEffects(actor) {
    return (actor.itemTypes?.effect ?? []).filter((e) => e.flags?.[MODULE_ID]?.spellheart);
}

export function effectsOf(spellheart) {
    return moduleEffects(spellheart.actor).filter((e) => e.flags[MODULE_ID].spellheart === spellheart.id);
}

/* -------------------------------------------- */
/*  Sync                                        */
/* -------------------------------------------- */

const queues = new Map();

/**
 * Bring an actor's spellheart effects in line with what is affixed and equipped. Calls for the same actor are
 * queued so they never run concurrently.
 */
export function syncActor(actor) {
    if (!actor) return Promise.resolve();
    const key = actor.uuid;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous
        .catch(() => {})
        .then(() => doSync(actor))
        .catch((err) => console.error(`${MODULE_ID} | Sync failed for ${actor.name}`, err));
    queues.set(key, next);
    next.finally(() => {
        if (queues.get(key) === next) queues.delete(key);
    });
    return next;
}

function hostIsActive(host) {
    return !setting("requireEquipped") || host.isEquipped;
}

async function doSync(actor) {
    if (!actor.isOwner) return;
    const items = actor.items;

    // 1. Detach spellhearts whose host is gone or invalid
    const detached = [];
    for (const item of items) {
        const hostId = getHostId(item);
        if (!hostId) continue;
        const host = items.get(hostId);
        if (!isSpellheart(item) || !host || !isHostType(host) || host.id === item.id) detached.push(item);
    }
    if (detached.length) {
        await actor.updateEmbeddedDocuments(
            "Item",
            detached.map((i) => ({ _id: i.id, [`flags.${MODULE_ID}.host`]: null })),
            INTERNAL,
        );
        for (const item of detached) ui.notifications.info(loc("Info.HostRemoved", { name: item.name }));
    }

    // 2. Remove effects that no longer belong
    const existing = moduleEffects(actor);
    const toDelete = new Set();
    for (const effect of existing) {
        const flags = effect.flags[MODULE_ID];
        const spellheart = items.get(flags.spellheart);
        const hostId = spellheart ? getHostId(spellheart) : null;
        const host = hostId ? items.get(hostId) : null;
        if (!spellheart || !host || flags.host !== host.id || !hostIsActive(host)) toDelete.add(effect.id);
    }

    // 3. Create missing passive effects
    const toCreate = [];
    for (const spellheart of items.filter((i) => isSpellheart(i) && getHostId(i))) {
        const host = items.get(getHostId(spellheart));
        if (!host || !hostIsActive(host)) continue;
        const { passive } = await effectsForHost(spellheart, host);
        for (const info of passive) {
            const present = existing.some(
                (e) =>
                    !toDelete.has(e.id) &&
                    e.flags[MODULE_ID].spellheart === spellheart.id &&
                    e.flags[MODULE_ID].effect === info.uuid,
            );
            if (!present) toCreate.push(await buildEffectSource(info, spellheart, host, { passive: true }));
        }
    }

    if (toDelete.size) {
        const ids = [...toDelete].filter((id) => actor.items.has(id));
        if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids, INTERNAL);
    }
    if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate, INTERNAL);
}

/** Apply an activated benefit (replacing a still-running copy of the same one) */
export async function activateEffect(spellheart, host, effectUuid) {
    const info = (await findEffectsFor(spellheart)).find((i) => i.uuid === effectUuid);
    if (!info) return null;
    const actor = spellheart.actor;
    const running = effectsOf(spellheart).filter((e) => e.flags[MODULE_ID].effect === effectUuid);
    if (running.length) await actor.deleteEmbeddedDocuments("Item", running.map((e) => e.id), INTERNAL);
    const source = await buildEffectSource(info, spellheart, host, { passive: false });
    const [created] = await actor.createEmbeddedDocuments("Item", [source], INTERNAL);
    return created ?? null;
}

/** GM-only: resync every actor that has affixed spellhearts or module effects */
export async function syncAllActors() {
    if (game.user !== game.users.activeGM) return;
    const actors = new Set(game.actors.contents);
    for (const token of canvas?.scene?.tokens ?? []) {
        if (token.actor && !token.actorLink) actors.add(token.actor);
    }
    for (const actor of actors) {
        const relevant = actor.items.some((i) => getHostId(i)) || moduleEffects(actor).length > 0;
        if (relevant) await syncActor(actor);
    }
}

/** Re-render open item sheets belonging to this actor (actor sheets re-render on their own) */
export function refreshOpenSheets(actor) {
    const apps = [...Object.values(ui.windows ?? {}), ...(foundry.applications.instances?.values?.() ?? [])];
    for (const app of apps) {
        const doc = app.document ?? app.item ?? app.object;
        if (doc?.documentName === "Item" && doc.actor === actor && app.rendered) app.render(false);
    }
}
