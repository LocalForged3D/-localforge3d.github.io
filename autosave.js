/*
 * LocalForge Autosave Runtime
 */

import {
  saveAutosave,
  loadAutosave
} from "./database.js";

let timer = null;

export async function startAutosave() {
  try {
    const previous =
      await loadAutosave();

    if (previous) {
      window.LocalForge.autosaveRecovery =
        previous;

      console.log(
        "[LocalForge] Recovery snapshot found"
      );
    }
  } catch (error) {
    console.warn(
      "[LocalForge] Recovery read failed",
      error
    );
  }

  if (timer) clearInterval(timer);

  timer = setInterval(() => {
    createAutosave();
  }, 30000);
}

export async function createAutosave() {
  try {
    const snapshot = {
      version:
        window.LocalForge?.version || "1",

      timestamp: Date.now(),

      workspace:
        window.LocalForge?.workspace ||
        "object"
    };

    /*
     * app.js can expose:
     *
     * window.LocalForge.serializeProject()
     *
     * and the complete model will then
     * automatically be included here.
     */

    if (
      typeof window.LocalForge
        ?.serializeProject === "function"
    ) {
      snapshot.project =
        window.LocalForge.serializeProject();
    }

    await saveAutosave(snapshot);

    console.log("[LocalForge] Autosaved");
  } catch (error) {
    console.warn(
      "[LocalForge] Autosave failed",
      error
    );
  }
}
