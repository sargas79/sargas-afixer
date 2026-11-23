# Sargas Affixer

A Foundry VTT **V14** module for the **Pathfinder 2e** system (8.7+). It lets players affix spellhearts to armor and weapons, applies the buffs each spellheart gives automatically, and shows those buffs on the character sheet.

## Install

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/sargas79/sargas-afixer/releases/latest/download/module.json
```

Then enable **Sargas Affixer** in a PF2e world.

## What it does

- **Affix / Detach.** Every spellheart in a character's inventory gets a 🔗 button. It opens a picker with all of that character's armor, weapons and shields. Items that can't take the spellheart are greyed out with the reason, for example "not metal" or "already has the maximum number of affixed items".
- **Rules checks.** The spellheart's PF2e usage decides what it can go on (`affixed-to-armor-or-a-weapon`, `affixed-to-metal-armor-or-a-weapon`, …). An item holds one affixed item, or one more with *Talismanic Sage*. Stacks are split so only one spellheart is affixed.
- **Automatic buffs.** The module finds the PF2e system's own benefit effects (the `Equipment Effects` compendium, for example *Effect: Flaming Star - Armor*). It then:
  - picks the **armor** or **weapon** version based on the host item;
  - adds the **passive** benefits to the character as real PF2e effects, at the correct tier (lesser/greater/major), with the weapon choice already filled in;
  - removes them when the armor is taken off or the weapon is no longer held (there is a setting to change this), and when the spellheart is detached or deleted.
- **Activated benefits** (the ones that last a round after casting a spell, for example) get an **Activate** button. It applies the timed effect, and PF2e expires it as usual.
- **Shows the buffs:**
  - spellheart icons next to the armor/weapon name in the inventory (greyed out when inactive);
  - a panel under each armor/weapon listing every affixed spellheart, whether it is active, and short lines such as *Resistance 5 to Fire* or *+1d6 Fire damage on Strikes with Longsword*;
  - the effects themselves in the PF2e effects panel, on the token, and in roll breakdowns;
  - an "Affixed spellhearts" section on the armor/weapon item sheet.

Spellhearts that have no PF2e effect still affix and show a "no automated benefit" note.

## Settings

| Setting | Default | |
|---|---|---|
| Benefits require equipped gear | on | Armor must be worn and weapons held for passive benefits to apply |
| Spellhearts per item | 1 | |
| Talismanic Sage adds a slot | on | |
| Post affix messages to chat | on | |
| Show benefit panel in inventory | on | Per client |

## API

`game.modules.get("sargas-affixer").api` provides `affix(spellheart, host)`, `detach(spellheart)`, `activate(spellheart, effectUuid)`, `openAffixPicker(spellheart)`, `canHost`, `getHost`, `getAttachments`, `findEffectsFor`, `summarizeEffect`, `syncActor(actor)` and `syncAllActors()`.

## How it works

- The link is a flag on the spellheart, `flags["sargas-affixer"].host = <host item id>`. The spellheart stays a normal inventory item.
- Module-created effects carry `flags["sargas-affixer"] = { spellheart, host, effect, passive }` and an origin context that points at the spellheart. That is how PF2e's `parent:origin:item:slug:*` predicates select the right tier.
- Sync runs on the client of the user who made the change, and once on the GM's client at startup as a repair pass.
- Exceptions to the automatic effect lookup go in [scripts/mapping.js](scripts/mapping.js).

## Releasing

Releases are built by [.github/workflows/release.yml](.github/workflows/release.yml):

1. Bump `version` in `module.json` and merge the change to `main`.
2. Tag that commit and push the tag:
   ```
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow checks that the tag matches `module.json` and validates the JSON and scripts. It then sets the `manifest` and `download` URLs for that tag, builds `sargas-affixer.zip`, and publishes a GitHub release with the zip, `module.json` and generated notes.
- A tag with a suffix, such as `v0.2.0-beta.1`, becomes a pre-release. Foundry's `latest` manifest URL does not offer pre-releases.
- Re-running the workflow on an existing release replaces its files.

## Not included yet

- Talismans (affix → use → consume).
- Spellheart innate spellcasting entries.
- Moving an armor or weapon to another character carries its spellheart along. Today the spellheart is detached instead.
- Languages other than English.

## Known PF2e data issue

In PF2e 8.7.1, *Effect: Rime Crystal - Armor* has a typo in its Major-tier predicate (`rime-crysta-majorl`). Because of it, the Major cold resistance never applies. This is a bug in the system's data, not in this module.
