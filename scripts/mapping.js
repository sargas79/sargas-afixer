/**
 * Hand-maintained exceptions to the automatic spellheart → effect lookup.
 * Keys are the spellheart's base name (without "(Greater)", "(Major)", ...).
 *
 *  exclude:  effect names that match the name search but are not a direct benefit
 *  include:  extra effect UUIDs to consider
 *  passive:  force an effect (by name) to be treated as passive (true) or activated (false)
 */
export const OVERRIDES = {
    "Clay Sphere": {
        // Granted by "Effect: Clay Sphere - Weapon" itself; not a separate benefit
        exclude: ["Effect: Clay Sphere - Weapon Damage Increase"],
    },
};
