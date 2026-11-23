import { loc } from "./constants.js";
import { slugOf } from "./effects.js";

/**
 * Turn an effect's rule elements into short, readable lines ("+1 item bonus to Athletics", "Resistance 5 fire").
 * Works on rule *sources*, so it can describe an effect before it is applied. Tier-specific rules for other
 * tiers of the spellheart are dropped; rules whose predicate depends on the situation are tagged.
 * Pass `tierSlug` (from effects.tierSlugFor) so the described tier matches the one applied.
 *
 * @returns {{text: string, situational: boolean}[]}
 */
export function summarizeEffect(effectDoc, { spellheart, host, tierSlug }) {
    const rules = foundry.utils.deepClone(effectDoc._source?.system?.rules ?? effectDoc.system?.rules ?? []);
    const actor = spellheart.actor;
    const slug = tierSlug ?? slugOf(spellheart);

    // Tier roll options set by the effect's ChoiceSet (e.g. "flaming-star:flaming-star-greater")
    const tierPrefixes = rules
        .filter((r) => r.key === "ChoiceSet" && Array.isArray(r.choices) && typeof r.rollOption === "string")
        .map((r) => r.rollOption);
    const options = new Set([
        ...(actor?.getRollOptions?.() ?? []),
        ...tierPrefixes.map((p) => `${p}:${slug}`),
        "parent:origin",
        "parent:origin:item",
        `parent:origin:item:slug:${slug}`,
    ]);

    const Predicate = game.pf2e?.Predicate;
    const evaluate = (predicate) => {
        if (!predicate || (Array.isArray(predicate) && predicate.length === 0)) return { applies: true, situational: false };
        let passes = false;
        try {
            passes = Predicate ? new Predicate(predicate).test(options) : true;
        } catch {
            passes = true;
        }
        if (passes) return { applies: true, situational: false };
        const atoms = collectAtoms(predicate);
        const tierAtoms = atoms.filter((a) => tierPrefixes.some((p) => a.startsWith(`${p}:`)));
        if (tierAtoms.length && !tierAtoms.some((a) => options.has(a))) return { applies: false, situational: false };
        return { applies: true, situational: true };
    };

    // Collect active AdjustModifier rules so upgraded values are shown
    const adjustments = [];
    for (const rule of rules) {
        if (rule.key !== "AdjustModifier" || !evaluate(rule.predicate).applies) continue;
        if (evaluate(rule.predicate).situational) continue;
        adjustments.push(rule);
    }

    const lines = [];
    for (const rule of rules) {
        const { applies, situational } = evaluate(rule.predicate);
        if (!applies) continue;
        const text = describeRule(rule, { adjustments, host });
        if (text) lines.push({ text, situational });
    }
    return dedupe(lines);
}

function collectAtoms(predicate) {
    const atoms = [];
    const walk = (node) => {
        if (typeof node === "string") atoms.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(predicate);
    return atoms;
}

function dedupe(lines) {
    const seen = new Set();
    return lines.filter((l) => {
        const key = `${l.text}|${l.situational}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function applyAdjustments(rule, adjustments) {
    let value = rule.value;
    if (typeof value !== "number") return value;
    for (const adj of adjustments) {
        const matches = adj.slug ? adj.slug === rule.slug : false;
        if (!matches || typeof adj.value !== "number") continue;
        if (adj.mode === "upgrade") value = Math.max(value, adj.value);
        else if (adj.mode === "downgrade") value = Math.min(value, adj.value);
        else if (adj.mode === "override") value = adj.value;
        else if (adj.mode === "add") value += adj.value;
        else if (adj.mode === "subtract") value -= adj.value;
    }
    return value;
}

function signed(n) {
    return n >= 0 ? `+${n}` : `${n}`;
}

function titleCase(text) {
    return String(text)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function localizeMaybe(text) {
    if (typeof text !== "string") return "";
    return game.i18n.has?.(text) ? game.i18n.localize(text) : text;
}

function labelFrom(record, key) {
    const entry = record?.[key];
    if (!entry) return null;
    return localizeMaybe(typeof entry === "string" ? entry : (entry.label ?? ""));
}

/** Human label for a selector such as "athletics", "saving-throw" or "{item|...}-damage" */
function selectorLabel(selector, host) {
    const list = Array.isArray(selector) ? selector : [selector];
    return list
        .map((raw) => {
            if (typeof raw !== "string") return "";
            const s = raw.trim();
            if (/^\{item\|.*\}-damage$/.test(s) || s === "strike-damage") return loc("Summary.Selector.Damage", { host: host.name });
            if (/^\{item\|.*\}-attack$/.test(s) || s === "strike-attack-roll") return loc("Summary.Selector.Attack", { host: host.name });
            if (/^\{item\|/.test(s)) return host.name;
            const known =
                labelFrom(CONFIG.PF2E?.skills, s) ??
                labelFrom(CONFIG.PF2E?.saves, s) ??
                {
                    ac: loc("Summary.Selector.AC"),
                    perception: loc("Summary.Selector.Perception"),
                    "saving-throw": loc("Summary.Selector.Saves"),
                    "skill-check": loc("Summary.Selector.Skills"),
                    "spell-attack-roll": loc("Summary.Selector.SpellAttack"),
                    "spell-dc": loc("Summary.Selector.SpellDC"),
                    "all-speeds": loc("Summary.Selector.Speeds"),
                    "land-speed": loc("Summary.Selector.LandSpeed"),
                    initiative: loc("Summary.Selector.Initiative"),
                }[s];
            return known ?? titleCase(s);
        })
        .filter(Boolean)
        .join(", ");
}

function typesLabel(type, record, rule = {}) {
    if (type === "custom" && rule.label) return localizeMaybe(rule.label);
    const list = Array.isArray(type) ? type : [type];
    return list.map((t) => labelFrom(record, t) ?? titleCase(t ?? "")).join(", ");
}

function valueText(value) {
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && !/[{}@]/.test(value)) return value;
    return loc("Summary.Varies");
}

/** Text that may hold an unresolved "{item|...}" injection; falls back when it does */
function plainText(text, fallback) {
    const localized = localizeMaybe(text);
    return localized && !/[{}]/.test(localized) ? localized : fallback;
}

function describeRule(rule, { adjustments, host }) {
    switch (rule.key) {
        case "FlatModifier": {
            const value = applyAdjustments(rule, adjustments);
            const type = rule.type ?? "untyped";
            const selector = selectorLabel(rule.selector, host);
            if (typeof value !== "number") return loc("Summary.ModifierVaries", { type, selector });
            const key = value >= 0 ? "Summary.Bonus" : "Summary.Penalty";
            return loc(key, { value: signed(value), type, selector });
        }
        case "Resistance":
            return loc("Summary.Resistance", {
                value: valueText(applyAdjustments(rule, adjustments)),
                type: typesLabel(rule.type, CONFIG.PF2E?.resistanceTypes, rule),
            });
        case "Weakness":
            return loc("Summary.Weakness", {
                value: valueText(rule.value),
                type: typesLabel(rule.type, CONFIG.PF2E?.weaknessTypes, rule),
            });
        case "Immunity":
            return loc("Summary.Immunity", { type: typesLabel(rule.type, CONFIG.PF2E?.immunityTypes, rule) });
        case "DamageDice": {
            const dice = `${rule.diceNumber ?? 1}${rule.dieSize ?? ""}`;
            const type = rule.damageType ? typesLabel(rule.damageType, CONFIG.PF2E?.damageTypes) : "";
            const selectors = Array.isArray(rule.selector) ? rule.selector : [rule.selector];
            const onStrikes = selectors.every((s) => typeof s === "string" && /^(\{item\|.*\}|strike)-damage$/.test(s));
            const where = onStrikes
                ? loc("Summary.OnStrikes", { host: host.name })
                : loc("Summary.OnSelector", { selector: selectorLabel(rule.selector, host) });
            return loc("Summary.DamageDice", { dice, type, where }).replace(/\s+/g, " ");
        }
        case "Sense":
            return loc("Summary.Sense", {
                sense: titleCase(rule.selector),
                acuity: rule.acuity ? ` (${rule.acuity})` : "",
                range: rule.range ? ` ${rule.range} ft.` : "",
            });
        case "Note":
            return loc("Summary.Note", { title: plainText(rule.title, selectorLabel(rule.selector, host)) });
        case "AdjustStrike": {
            const value = titleCase(plainText(rule.value, ""));
            const property = titleCase(rule.property ?? "");
            const change = rule.mode === "remove" ? `−${value} (${property})` : `+${value} (${property})`;
            return loc("Summary.AdjustStrike", { host: host.name, change });
        }
        case "AdjustDegreeOfSuccess":
            return loc("Summary.AdjustDegree", { selector: selectorLabel(rule.selector, host) });
        case "Aura":
            return loc("Summary.Aura", { radius: valueText(rule.radius) });
        case "BaseSpeed":
            return loc("Summary.Speed", { type: titleCase(rule.selector), value: valueText(rule.value) });
        case "ItemAlteration":
            return loc("Summary.ItemAlteration", { property: titleCase(rule.property ?? "") });
        case "ActiveEffectLike":
            return loc("Summary.ActiveEffectLike", { path: String(rule.path ?? "").split(".").slice(-2).join(".") });
        default:
            return null;
    }
}
