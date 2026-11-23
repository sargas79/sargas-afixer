# Sargas Affixer: plan

A Foundry VTT V14 module for the PF2e system. It lets players affix spellhearts (and later talismans) to armor and weapons, and it shows the buff each one gives the character.

Status: **v0.1.0 built** (milestones M1–M3, spellhearts only). The JS code has been checked against PF2e 8.7.1 data, but it has **not been tested in a live Foundry world yet**.

Decisions made while building:
- Build our own module: **yes**.
- Talismans and innate spellcasting: **left for later** (M4).
- Benefits need equipped gear: **yes by default**, with a world setting to turn this off.
- Language: **English only**.
- Each PF2e spellheart effect is either *passive* (duration unlimited, applied automatically) or *activated* (timed, applied with an "Activate" button).

---

## 0. Before building: an existing module

**PF2e Talisman Manager** (Wayfinder Modules) already does most of this. It is verified on Foundry 14.368 and PF2e 8.5.1, and it needs Wayfinder Core. It has an Affix button, a picker for valid gear, attachments nested on the sheet, a spellheart Effect on the actor, and spellheart spellcasting (v1.2.0).

Its limits:
- It is **proprietary and closed source**. Forking it or reusing its code is not allowed.
- Rule elements exist for only about 10 spellhearts. The rest show their description with a "no mechanics" warning.
- Talismans have no rule elements.

Building our own module makes sense if you want open code, no Wayfinder dependency, more buffs that work automatically, or your own UI and house rules. Otherwise, try that module first.

---

## 1. How PF2e handles this today (confirmed in the `foundryvtt/pf2e` `v14-dev` branch)

| Topic | What the system does |
|---|---|
| Usage keys | `src/scripts/config/usage.ts` defines `affixed-to-armor`, `affixed-to-weapon`, `affixed-to-armor-or-a-weapon`, `affixed-to-metal-armor-or-a-weapon`, `affixed-to-a-shield`, `affixed-to-melee-weapon` and more. All of them are `type: "worn"`. |
| Affix link | **There isn't one.** A spellheart is an ordinary inventory item. Nothing records which item it is attached to. |
| `system.subitems` | Exists on physical items, but `acceptsSubitem()` only accepts *attached* weapons (crossbow/firearm accessories, shield attachments). Armor has no override. Rule elements on subitems are **not** collected into the actor's rules. |
| Spellheart buffs | The spellheart items themselves have `system.rules = []`. The buffs live in separate **Effect** items in the `pf2e.equipment-effects` compendium, for example `Effect: Spiny Lodestone - Armor` and `... - Weapon`. These effects use a `ChoiceSet` keyed on `parent:origin:item:slug:<slug>` to pick the lesser/greater/major tier. |

**What this means:** the system already holds most of the mechanics. What's missing is (a) a record of what is attached to what, (b) applying the right Effect automatically when you affix or detach, and (c) showing it on the sheet.

---

## 2. Design decisions

### 2.1 Storage: link with flags (recommended)
The spellheart **stays an ordinary actor item**. We add a flag that links it to its host:

```
spellheart.flags["sargas-affixer"].host   = "<hostItemId>"
spellheart.flags["sargas-affixer"].effect = "<actorEffectItemId>"
```

Each host's attachments are worked out at render time by checking which items point to it. No data is stored twice.

The alternative is moving the spellheart into the host's `system.subitems`, which would make it travel with the item for free. I rejected it for three reasons:
- We would have to patch `acceptsSubitem` on Armor and Weapon (libWrapper on system internals).
- Rules on subitems don't apply to the actor.
- System updates could break it.

### 2.2 Buffs: reuse the system's own Effects
When a spellheart is affixed:
1. The module finds the matching Effect in `pf2e.equipment-effects`:
   - an **armor** or **weapon** variant, based on the host type;
   - matched by name pattern `Effect: <Name> - Armor|Weapon`, or by the `@UUID[...]` links in the item description;
   - checked against a hand-written mapping table (`data/mapping.json`) for exceptions.
2. It creates the Effect on the actor with `system.context.origin.item = spellheart.uuid`, so the `parent:origin:item:slug:*` predicates choose the correct tier.
3. It sets `flags.pf2e.rulesSelections` ahead of time, so no ChoiceSet prompt appears. For buffs that only apply to one weapon, it also sets the weapon choice to the host.
4. It marks the Effect with the module flag, and gives it the spellheart's icon and the name `<Spellheart> (on <Host>)`.

If no Effect exists, the module still affixes the item, shows the description, and adds a "manual" badge. There is also an optional GM setting to build a simple Effect from a template.

### 2.3 When the buff is active
By default, the Effect exists only while the host is in use:
- armor must be **worn**;
- a weapon must be **held/wielded**.

This follows the rule text, for example "The spell ends if you stop wielding the affixed weapon". An `updateItem` hook watches `system.equipped` and adds or removes the Effect. A world setting can switch this to "always on while affixed".

### 2.4 Rules checks
- Valid hosts come from the usage key: armor, weapon, shield, metal (`traits` includes `metal`, or the material is metal), and melee.
- **One** spellheart *or* talisman per item. **Two** if the actor has Talismanic Sage (checked by feat slug, with a setting to override).
- The item must be in the same actor's inventory. A stack is split to quantity 1 before it is affixed.
- Affixing posts a chat card: "Affix a Spellheart (10 minutes)". It does not track time.

---

## 3. How it looks: showing the buff

1. **Character sheet inventory** (`renderCharacterSheetPF2e` hook, DOM injection):
   - an **Affix** button on each spellheart/talisman row;
   - on each host row, a **badge** with the spellheart icon. Hovering it shows a tooltip with the spellheart name, armor/weapon mode, the active/inactive state, and a short list of modifiers (for example "+1 item Athletics, nonlethal resistance 5");
   - affixed spellhearts appear indented under their host, with Detach and Open controls.
2. **Effects panel and token HUD.** The Effect is a real PF2e effect, so it already shows in the actor's effects panel and on the token with its icon. You don't need to do anything for this.
3. **Host item sheet.** An "Affixed" section lists the attachments and their benefits.
4. **Strike and check breakdowns.** The modifiers use their own slugs, such as `spiny-lodestone-armor-bonus`, so they already show by name in roll breakdowns.

The modifier summary in the tooltip is read from the Effect's prepared rule elements (`FlatModifier`, `Resistance`, `Weakness`, `Note`, `DamageDice`) and shown as short text. Anything it can't parse is shown as "see description".

---

## 4. Module layout

```
module.json                 id "sargas-affixer", compatibility min 14, verified 14.x,
                            relationships.systems: pf2e (V14-compatible release)
scripts/
  main.js                   init/ready hooks, settings, exposes game.modules.get(...).api
  affix.js                  affix(), detach(), getAttachments(host), getHost(item)
  validation.js             usage → valid host types, slot limits, metal/melee checks
  effects.js                Effect lookup, create/remove, equip-state sync
  summary.js                rule elements → readable list of buffs
  hooks.js                  updateItem / deleteItem / createItem / transfer handling
  ui/sheet-inject.js        inventory buttons, badges, indented rows, tooltips
  ui/affix-picker.js        ApplicationV2 (HandlebarsApplicationMixin) host picker
  ui/item-sheet-inject.js   "Affixed" section on the host item sheet
data/mapping.json           slug → { armorEffect, weaponEffect, preselections } overrides
templates/*.hbs
styles/affixer.css
lang/en.json
```

There are no runtime dependencies (no libWrapper, no socketlib). Players can only edit items they own, so all updates are made by the owning client.

---

## 5. Edge cases

- **Host deleted or sold** → the spellheart is detached (it stays in inventory) and its Effect is removed.
- **Spellheart deleted** → its Effect is removed.
- **Effect deleted by hand** → the link stays and the badge shows a warning with a "Re-apply" button.
- **Host moved to another actor** (drag/drop or the PF2e transfer dialog) → v1 detaches it and shows a warning. v2 moves the spellheart along with it.
- **Swapping armor or weapon sets** → handled by the equip-state sync.
- **System or module updates** → on `ready`, a GM check scans the actors and fixes broken links or orphaned Effects.

---

## 6. Milestones

1. **M1, core:** module setup, flag link, affix/detach API, validation, picker, inventory badge and indented rows.
2. **M2, buffs:** automatic Effect lookup and creation, ChoiceSet pre-selection, equip-state gating, tooltip summary, item sheet section.
3. **M3, robustness:** cleanup hooks, GM repair check, moving items between actors, settings, localization.
4. **M4, optional:** talismans (affix, then "Use" from the badge or strike chat card, consume, detach), and spellheart innate spells as a spellcasting entry.

**Testing:** a manual checklist in a V14 + PF2e test world, plus optional automated tests with the **Quench** module (affix/detach, gating, cleanup). The mapping table is checked by a script that confirms every UUID it lists exists in the compendium.

---

## 7. Open questions

1. Build our own module, or use PF2e Talisman Manager?
2. Spellhearts only, or talismans as well (M4)?
3. Should buffs need the host to be equipped (rules-accurate), or apply whenever the spellheart is affixed?
4. Should innate spellcasting from spellhearts be in scope?
5. Languages besides English (for example pt-BR)?
