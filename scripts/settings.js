import { MODULE_ID } from "./constants.js";
import { syncAllActors } from "./effects.js";

export function registerSettings() {
    game.settings.register(MODULE_ID, "requireEquipped", {
        name: "SARGAS_AFFIXER.Settings.RequireEquipped.Name",
        hint: "SARGAS_AFFIXER.Settings.RequireEquipped.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => syncAllActors(),
    });

    game.settings.register(MODULE_ID, "maxAffixes", {
        name: "SARGAS_AFFIXER.Settings.MaxAffixes.Name",
        hint: "SARGAS_AFFIXER.Settings.MaxAffixes.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 1, max: 3, step: 1 },
        default: 1,
    });

    game.settings.register(MODULE_ID, "talismanicSage", {
        name: "SARGAS_AFFIXER.Settings.TalismanicSage.Name",
        hint: "SARGAS_AFFIXER.Settings.TalismanicSage.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register(MODULE_ID, "chatMessages", {
        name: "SARGAS_AFFIXER.Settings.ChatMessages.Name",
        hint: "SARGAS_AFFIXER.Settings.ChatMessages.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register(MODULE_ID, "showPanel", {
        name: "SARGAS_AFFIXER.Settings.ShowPanel.Name",
        hint: "SARGAS_AFFIXER.Settings.ShowPanel.Hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            for (const app of Object.values(ui.windows)) {
                if (app.actor?.type === "character") app.render(false);
            }
        },
    });
}
