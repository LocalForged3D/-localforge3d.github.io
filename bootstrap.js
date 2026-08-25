/*
 * LocalForge 3D Bootstrap
 * Starts the browser runtime before loading the editor.
 */

const LF = {
  version: "1.0.0",
  root: new URL("../../", import.meta.url),
  started: false
};

window.LocalForge = window.LocalForge || {};
Object.assign(window.LocalForge, LF);

function setStatus(message) {
  const status = document.getElementById("f-status");
  if (status) status.textContent = message;
}

async function loadModule(path) {
  return import(new URL(path, import.meta.url).href);
}

async function boot() {
  if (LF.started) return;
  LF.started = true;

  try {
    setStatus("Starting LocalForge runtime…");

    const runtime = await loadModule("./runtime.js");

    await runtime.initializeRuntime();

    setStatus("Starting 3D engine…");

    await loadModule("./app.js");

    setStatus("LocalForge 3D ready");
  } catch (error) {
    console.error("[LocalForge] Boot failure:", error);

    setStatus(
      "LocalForge failed to start. Reload the page to retry."
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, {
    once: true
  });
} else {
  boot();
}
