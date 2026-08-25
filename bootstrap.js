/*
==============================================================
 LocalForge 3D — bootstrap.js
 Application bootstrap / startup coordinator
==============================================================
*/

const ROOT = document.getElementById("forge3d");
const STATUS = document.getElementById("f-status");
const ENGINE_STATE = document.getElementById("f-engine-state");
const ENGINE_DOT = document.getElementById("f-engine-dot");

const BASE = new URL("./", window.location.href);

function setStatus(message, state = "loading") {
    if (STATUS) STATUS.textContent = message;
    if (ENGINE_STATE) ENGINE_STATE.textContent = message;

    if (ROOT) {
        ROOT.dataset.forgeState = state;
    }

    if (ENGINE_DOT) {
        ENGINE_DOT.dataset.state = state;
    }

    console.log(`[LocalForge] ${message}`);
}

function resolve(file) {
    return new URL(file, BASE).href;
}

async function fileExists(file) {
    try {
        const response = await fetch(resolve(file), {
            method: "HEAD",
            cache: "no-store"
        });

        return response.ok;
    } catch {
        return false;
    }
}

async function loadBuildInfo() {
    try {
        const response = await fetch(resolve("build.json"), {
            cache: "no-store"
        });

        if (!response.ok) return null;

        const build = await response.json();

        window.LOCALFORGE_BUILD = build;

        console.log("[LocalForge] Build:", build);

        return build;
    } catch (error) {
        console.warn("[LocalForge] build.json unavailable:", error);

        return null;
    }
}

async function importOptional(file) {
    try {
        if (!(await fileExists(file))) {
            console.warn(`[LocalForge] Optional module missing: ${file}`);
            return null;
        }

        const module = await import(resolve(file));

        console.log(`[LocalForge] Loaded ${file}`);

        return module;
    } catch (error) {
        console.warn(`[LocalForge] ${file} failed:`, error);

        return null;
    }
}

async function importRequired(file) {
    try {
        const module = await import(resolve(file));

        console.log(`[LocalForge] Loaded ${file}`);

        return module;
    } catch (error) {
        console.error(`[LocalForge] Required module failed: ${file}`, error);

        throw error;
    }
}

async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    /*
     GitHub repository preview environments can behave differently
     from the deployed GitHub Pages site.

     Only register SW from http/https.
    */

    if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost"
    ) {
        return;
    }

    try {
        const registration =
            await navigator.serviceWorker.register(
                resolve("sw.js"),
                {
                    scope: "./"
                }
            );

        console.log(
            "[LocalForge] Service worker registered:",
            registration.scope
        );
    } catch (error) {
        /*
         Service worker failure must NEVER stop the editor.
        */

        console.warn(
            "[LocalForge] Service worker unavailable:",
            error
        );
    }
}

function waitForCanvas(timeout = 15000) {
    return new Promise((resolvePromise) => {

        const existing =
            document.querySelector("#f-view canvas");

        if (existing) {
            resolvePromise(existing);
            return;
        }

        const viewport =
            document.getElementById("f-view");

        if (!viewport) {
            resolvePromise(null);
            return;
        }

        const observer =
            new MutationObserver(() => {

                const canvas =
                    viewport.querySelector("canvas");

                if (!canvas) return;

                observer.disconnect();

                resolvePromise(canvas);
            });

        observer.observe(
            viewport,
            {
                childList: true,
                subtree: true
            }
        );

        setTimeout(() => {
            observer.disconnect();

            resolvePromise(
                viewport.querySelector("canvas")
            );
        }, timeout);
    });
}

function engineReady() {

    const shell =
        document.getElementById("f-shell-scene");

    const message =
        document.getElementById("f-shell-message");

    if (shell) shell.remove();
    if (message) message.remove();

    if (ROOT) {
        ROOT.dataset.forgeState = "ready";
        ROOT.classList.add("forge-ready");
    }

    if (ENGINE_STATE) {
        ENGINE_STATE.textContent = "Ready";
    }

    if (STATUS) {
        STATUS.textContent =
            "LocalForge 3D ready";
    }

    console.log(
        "[LocalForge] 3D workspace ready."
    );
}

function engineFailed(error) {

    console.error(
        "[LocalForge] Startup failure:",
        error
    );

    if (ROOT) {
        ROOT.dataset.forgeState = "error";
    }

    if (ENGINE_STATE) {
        ENGINE_STATE.textContent =
            "Engine Error";
    }

    if (STATUS) {
        STATUS.textContent =
            "3D engine failed to start. Check app.js / Three.js imports.";
    }
}


/*
==============================================================
 STARTUP
==============================================================
*/

async function boot() {

    try {

        setStatus(
            "Starting LocalForge…",
            "loading"
        );


        /*
        ------------------------------------------------------
        BUILD METADATA
        ------------------------------------------------------
        */

        await loadBuildInfo();


        /*
        ------------------------------------------------------
        RUNTIME

        These are optional infrastructure layers.

        Failure here should not prevent app.js from starting.
        ------------------------------------------------------
        */

        setStatus(
            "Preparing runtime…"
        );

        const runtime =
            await importOptional(
                "runtime.js"
            );


        /*
        ------------------------------------------------------
        DATABASE
        ------------------------------------------------------
        */

        const database =
            await importOptional(
                "database.js"
            );


        /*
        ------------------------------------------------------
        AUTOSAVE
        ------------------------------------------------------
        */

        const autosave =
            await importOptional(
                "autosave.js"
            );


        /*
        Make modules available for debugging / integration.
        */

        window.LocalForgeModules = {
            runtime,
            database,
            autosave
        };


        /*
        ------------------------------------------------------
        START APPLICATION
        ------------------------------------------------------
        */

        setStatus(
            "Starting 3D engine…"
        );

        const app =
            await importRequired(
                "app.js"
            );

        window.LocalForgeApp =
            app;


        /*
        app.js from your existing project initializes itself.

        Therefore bootstrap does NOT call a made-up init()
        function unless one actually exists.
        */

        if (
            typeof app.initLocalForge ===
            "function"
        ) {
            await app.initLocalForge();
        }


        /*
        ------------------------------------------------------
        WAIT FOR REAL THREE.JS CANVAS
        ------------------------------------------------------
        */

        const canvas =
            await waitForCanvas();


        if (canvas) {

            engineReady();

        } else {

            /*
            app.js loaded but didn't create the renderer.
            */

            throw new Error(
                "app.js loaded but no Three.js canvas was created."
            );
        }


        /*
        ------------------------------------------------------
        SERVICE WORKER

        Do this LAST.

        A broken/stale service worker must not block editor startup.
        ------------------------------------------------------
        */

        registerServiceWorker();

    }

    catch (error) {

        engineFailed(error);

    }
}


/*
==============================================================
 PAGE READY
==============================================================
*/

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        boot,
        {
            once: true
        }
    );

} else {

    boot();

}


/*
==============================================================
 GLOBAL ERROR REPORTING
==============================================================
*/

window.addEventListener(
    "error",
    event => {

        console.error(
            "[LocalForge] Runtime error:",
            event.error || event.message
        );

    }
);


window.addEventListener(
    "unhandledrejection",
    event => {

        console.error(
            "[LocalForge] Promise error:",
            event.reason
        );

    }
);
