/*
 * LocalForge 3D Browser Runtime
 */

import {
  openDatabase,
  loadRuntimeState,
  saveRuntimeState
} from "./storage/database.js";

import {
  startAutosave
} from "./storage/autosave.js";

const runtime = {
  database: null,
  capabilities: {},
  initialized: false
};

export async function initializeRuntime() {
  if (runtime.initialized) return runtime;

  console.log("[LocalForge] Initializing runtime");

  runtime.capabilities = detectCapabilities();

  runtime.database = await openDatabase();

  const previousState = await loadRuntimeState();

  if (previousState) {
    window.LocalForge.previousState = previousState;
  }

  window.LocalForge.runtime = runtime;

  startAutosave();

  await registerServiceWorker();

  window.addEventListener("pagehide", () => {
    saveRuntimeState({
      timestamp: Date.now(),
      workspace:
        window.LocalForge?.workspace || "object"
    }).catch(console.error);
  });

  runtime.initialized = true;

  console.log(
    "[LocalForge] Runtime initialized",
    runtime.capabilities
  );

  return runtime;
}

function detectCapabilities() {
  const canvas = document.createElement("canvas");

  const webgl2 = !!canvas.getContext("webgl2");

  const webgl =
    webgl2 ||
    !!canvas.getContext("webgl") ||
    !!canvas.getContext("experimental-webgl");

  return {
    webgl,
    webgl2,

    webgpu:
      typeof navigator !== "undefined" &&
      "gpu" in navigator,

    indexedDB:
      typeof indexedDB !== "undefined",

    serviceWorker:
      "serviceWorker" in navigator,

    touch:
      navigator.maxTouchPoints > 0,

    standalone:
      window.matchMedia?.(
        "(display-mode: standalone)"
      ).matches || window.navigator.standalone === true,

    memory:
      navigator.deviceMemory || null,

    cores:
      navigator.hardwareConcurrency || null
  };
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const root =
      window.LocalForge?.root ||
      new URL("../../", import.meta.url);

    const workerURL =
      new URL("sw.js", root);

    await navigator.serviceWorker.register(
      workerURL.href,
      {
        scope: root.pathname
      }
    );

    console.log(
      "[LocalForge] Offline runtime registered"
    );
  } catch (error) {
    console.warn(
      "[LocalForge] Service worker unavailable:",
      error
    );
  }
}

export function getRuntime() {
  return runtime;
}
