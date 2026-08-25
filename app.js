/*
==============================================================
 LocalForge 3D
 bootstrap.js
 Unified Startup Controller
==============================================================

 index.html
    ↓
 bootstrap.js
    ├── build.json
    ├── runtime.js
    ├── database.js
    ├── autosave.js
    ├── app.js
    │    └── Three.js modeling engine
    ├── features.js
    │    └── updates.js
    ├── advanced-tools.js
    │    ├── 288 brush presets
    │    ├── sculpt tools
    │    ├── modifier presets
    │    └── node stacks
    └── sw.js

==============================================================
*/

"use strict";


/* =========================================================
   DOM
========================================================= */

const ROOT =
    document.getElementById(
        "forge3d"
    );

const STATUS =
    document.getElementById(
        "f-status"
    );

const ENGINE_STATE =
    document.getElementById(
        "f-engine-state"
    );

const ENGINE_DOT =
    document.getElementById(
        "f-engine-dot"
    );


/* =========================================================
   STATE
========================================================= */

let booting =
    false;

let booted =
    false;

let bootError =
    null;


window.LocalForgeModules =
    window.LocalForgeModules ||
    {};


/* =========================================================
   STATUS
========================================================= */

function setStatus(
    message,
    state = "loading"
) {

    console.log(
        "[LocalForge]",
        message
    );


    if (STATUS) {

        STATUS.textContent =
            message;
    }


    if (ENGINE_STATE) {

        ENGINE_STATE.textContent =
            message;
    }


    if (ENGINE_DOT) {

        ENGINE_DOT.dataset.state =
            state;
    }


    if (ROOT) {

        ROOT.dataset.forgeState =
            state;
    }
}


/* =========================================================
   FAILURE
========================================================= */

function fail(
    error
) {

    bootError =
        error;


    const message =
        error?.message ||
        String(error) ||
        "Unknown startup error";


    console.error(
        "[LocalForge Bootstrap]",
        error
    );


    window.__LOCALFORGE_BOOT_ERROR__ =
        error;


    if (ROOT) {

        ROOT.dataset.forgeState =
            "error";
    }


    if (ENGINE_STATE) {

        ENGINE_STATE.textContent =
            "Engine Error";
    }


    if (ENGINE_DOT) {

        ENGINE_DOT.dataset.state =
            "error";
    }


    if (STATUS) {

        STATUS.textContent =
            "Engine Error: " +
            message;
    }
}


/* =========================================================
   SAFE OPTIONAL IMPORT
========================================================= */

async function optionalModule(
    path,
    name = path
) {

    try {

        const module =
            await import(
                path
            );


        console.log(
            `[LocalForge] ${name} loaded.`
        );


        return module;
    }

    catch (error) {

        console.warn(
            `[LocalForge] ${name} unavailable:`,
            error
        );


        return null;
    }
}


/* =========================================================
   BUILD.JSON
========================================================= */

async function loadBuild() {

    try {

        const url =
            new URL(
                "./build.json",
                location.href
            );


        /*
         Avoid stale build information.
        */

        url.searchParams.set(
            "_lf",
            Date.now().toString()
        );


        const response =
            await fetch(
                url.href,
                {
                    cache:
                        "no-store",

                    headers: {
                        "Cache-Control":
                            "no-cache, no-store, max-age=0"
                    }
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `build.json returned HTTP ${response.status}`
            );
        }


        const build =
            await response.json();


        window.LocalForgeBuild =
            build;

        window.LOCALFORGE_BUILD =
            build;


        console.log(
            "[LocalForge] Build:",
            build
        );


        return build;
    }

    catch (error) {

        /*
         Build metadata should never
         stop the modeling application.
        */

        console.warn(
            "[LocalForge] Build metadata unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   RUNTIME
========================================================= */

async function startRuntime() {

    setStatus(
        "Preparing runtime…"
    );


    const runtime =
        await import(
            "./runtime.js"
        );


    window.LocalForgeModules.runtime =
        runtime;


    if (
        typeof runtime
            .initializeRuntime ===
        "function"
    ) {

        const result =
            await runtime
                .initializeRuntime();


        if (
            result
                ?.capabilities
                ?.webgl
                ?.available ===
            false
        ) {

            throw new Error(
                "WebGL is unavailable on this device."
            );
        }
    }


    console.log(
        "[LocalForge] Runtime ready."
    );


    return runtime;
}


/* =========================================================
   DATABASE
========================================================= */

async function startDatabase() {

    try {

        const database =
            await import(
                "./database.js"
            );


        window.LocalForgeModules.database =
            database;


        if (
            typeof database
                .openDatabase ===
            "function"
        ) {

            await database
                .openDatabase();
        }


        console.log(
            "[LocalForge] Database ready."
        );


        return database;
    }

    catch (error) {

        console.warn(
            "[LocalForge] Database unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   AUTOSAVE
========================================================= */

async function startAutosave() {

    try {

        const autosave =
            await import(
                "./autosave.js"
            );


        window.LocalForgeModules.autosave =
            autosave;


        if (
            typeof autosave
                .startAutosave ===
            "function"
        ) {

            await autosave
                .startAutosave();
        }


        console.log(
            "[LocalForge] Autosave ready."
        );


        return autosave;
    }

    catch (error) {

        console.warn(
            "[LocalForge] Autosave unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   STORAGE
========================================================= */

async function startStorage() {

    /*
     Database initializes first.
    */

    await startDatabase();

    await startAutosave();
}


/* =========================================================
   WAIT FOR APP
========================================================= */

function waitForApplication(
    timeout = 25000
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {


            /* ----------------------------------------------
               Already ready
            ---------------------------------------------- */

            if (
                window.__LOCALFORGE_READY__
            ) {

                resolve(
                    window.LocalForge3D ||
                    true
                );

                return;
            }


            /* ----------------------------------------------
               Already failed
            ---------------------------------------------- */

            if (
                window.__LOCALFORGE_ERROR__
            ) {

                reject(
                    window.__LOCALFORGE_ERROR__
                );

                return;
            }


            let finished =
                false;


            let timer =
                null;


            const cleanup =
                () => {

                    window.removeEventListener(
                        "localforge:ready",
                        ready
                    );


                    window.removeEventListener(
                        "localforge:error",
                        failed
                    );


                    if (timer) {

                        clearTimeout(
                            timer
                        );
                    }
                };


            const ready =
                () => {

                    if (finished) {
                        return;
                    }


                    finished =
                        true;


                    cleanup();


                    resolve(
                        window.LocalForge3D ||
                        true
                    );
                };


            const failed =
                event => {

                    if (finished) {
                        return;
                    }


                    finished =
                        true;


                    cleanup();


                    reject(

                        event.detail
                            ?.error ||

                        window
                            .__LOCALFORGE_ERROR__ ||

                        new Error(
                            "LocalForge application initialization failed."
                        )
                    );
                };


            window.addEventListener(
                "localforge:ready",
                ready,
                {
                    once: true
                }
            );


            window.addEventListener(
                "localforge:error",
                failed,
                {
                    once: true
                }
            );


            timer =
                setTimeout(
                    () => {

                        if (finished) {
                            return;
                        }


                        /*
                         Canvas fallback.

                         If Three.js rendered successfully
                         but the event somehow disappeared,
                         accept the actual renderer.
                        */

                        const canvas =
                            document.querySelector(
                                "#f-view canvas"
                            );


                        if (canvas) {

                            finished =
                                true;


                            cleanup();


                            resolve(
                                window.LocalForge3D ||
                                true
                            );


                            return;
                        }


                        finished =
                            true;


                        cleanup();


                        reject(
                            new Error(
                                "The modeling engine did not create a WebGL viewport."
                            )
                        );
                    },

                    timeout
                );
        }
    );
}


/* =========================================================
   MODELING ENGINE
========================================================= */

async function startApplication() {

    /*
     Listen BEFORE app.js executes.
    */

    const ready =
        waitForApplication();


    setStatus(
        "Starting 3D engine…"
    );


    const application =
        await import(
            "./app.js"
        );


    window.LocalForgeModules.app =
        application;


    await ready;


    console.log(
        "[LocalForge] Modeling engine ready."
    );


    return application;
}


/* =========================================================
   FEATURE CENTER
========================================================= */

async function startFeatures() {

    try {

        setStatus(
            "Loading features…"
        );


        const features =
            await import(
                "./features.js"
            );


        window.LocalForgeModules.features =
            features;


        if (
            typeof features
                .initializeFeatures ===
            "function"
        ) {

            await features
                .initializeFeatures();
        }


        console.log(
            "[LocalForge] Feature Center ready."
        );


        return features;
    }

    catch (error) {

        /*
         Features are optional.
        */

        console.warn(
            "[LocalForge] Feature Center unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   ADVANCED TOOL SYSTEM
========================================================= */

async function startAdvancedTools() {

    try {

        setStatus(
            "Loading advanced tools…"
        );


        const advanced =
            await import(
                "./advanced-tools.js"
            );


        window.LocalForgeModules.advancedTools =
            advanced;


        if (
            typeof advanced
                .initializeAdvancedTools ===
            "function"
        ) {

            advanced
                .initializeAdvancedTools();
        }


        console.log(
            "[LocalForge] Advanced tools ready."
        );


        /*
         Useful development diagnostic.
        */

        if (
            window
                .LocalForgeAdvancedTools
                ?.counts
        ) {

            console.log(
                "[LocalForge] Advanced tool catalog:",
                window
                    .LocalForgeAdvancedTools
                    .counts
            );
        }


        return advanced;
    }

    catch (error) {

        /*
         Never kill the actual modeler because
         an extension failed.
        */

        console.warn(
            "[LocalForge] Advanced tools unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   SERVICE WORKER
========================================================= */

async function registerServiceWorker() {

    if (
        !(
            "serviceWorker"
            in navigator
        )
    ) {

        console.log(
            "[LocalForge] Service workers unsupported."
        );


        return null;
    }


    /*
     HTTPS required except localhost.
    */

    if (
        location.protocol !==
            "https:" &&

        location.hostname !==
            "localhost" &&

        location.hostname !==
            "127.0.0.1"
    ) {

        return null;
    }


    try {

        const registration =
            await navigator
                .serviceWorker
                .register(
                    "./sw.js",
                    {
                        scope: "./"
                    }
                );


        console.log(
            "[LocalForge] Service worker:",
            registration.scope
        );


        /*
         Trigger update detection without
         blocking application startup.
        */

        registration
            .update()
            .catch(
                error => {

                    console.warn(
                        "[LocalForge] SW update:",
                        error
                    );
                }
            );


        return registration;
    }

    catch (error) {

        console.warn(
            "[LocalForge] Service worker unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   READY
========================================================= */

function finishStartup() {

    booted =
        true;


    if (ROOT) {

        ROOT.classList.add(
            "forge-ready"
        );


        ROOT.dataset.forgeState =
            "ready";
    }


    if (ENGINE_STATE) {

        ENGINE_STATE.textContent =
            "Ready";
    }


    if (ENGINE_DOT) {

        ENGINE_DOT.dataset.state =
            "ready";
    }


    if (STATUS) {

        STATUS.textContent =
            "LocalForge 3D ready";
    }


    window.__LOCALFORGE_BOOT_READY__ =
        true;


    window.dispatchEvent(
        new CustomEvent(
            "localforge:boot-complete"
        )
    );


    console.log(
        "=========================================="
    );

    console.log(
        " LocalForge 3D READY"
    );

    console.log(
        "=========================================="
    );
}


/* =========================================================
   BOOT
========================================================= */

async function boot() {

    if (
        booting ||
        booted
    ) {

        return;
    }


    booting =
        true;


    bootError =
        null;


    try {

        console.log(
            "=========================================="
        );

        console.log(
            " LocalForge 3D"
        );

        console.log(
            " Unified Startup"
        );

        console.log(
            "=========================================="
        );


        setStatus(
            "Starting LocalForge…"
        );


        /* -------------------------------------------------
           1. Build metadata
        ------------------------------------------------- */

        const buildPromise =
            loadBuild();


        /* -------------------------------------------------
           2. Runtime
        ------------------------------------------------- */

        await startRuntime();


        /* -------------------------------------------------
           3. Storage

           Start asynchronously so IndexedDB cannot
           delay Three.js rendering.
        ------------------------------------------------- */

        const storagePromise =
            startStorage();


        /* -------------------------------------------------
           4. Three.js / modeler
        ------------------------------------------------- */

        await startApplication();


        /*
         Engine is now usable.
        */

        if (ROOT) {

            ROOT.classList.add(
                "forge-engine-ready"
            );
        }


        /* -------------------------------------------------
           5. Normal feature center
        ------------------------------------------------- */

        await startFeatures();


        /* -------------------------------------------------
           6. Hundreds of advanced tools
        ------------------------------------------------- */

        await startAdvancedTools();


        /* -------------------------------------------------
           7. Complete startup
        ------------------------------------------------- */

        finishStartup();


        /* -------------------------------------------------
           8. Register PWA

           Deliberately last.
        ------------------------------------------------- */

        registerServiceWorker();


        /* -------------------------------------------------
           Finish optional background startup
        ------------------------------------------------- */

        Promise.allSettled([
            buildPromise,
            storagePromise
        ]).then(
            results => {

                console.log(
                    "[LocalForge] Background systems complete.",
                    results
                );
            }
        );
    }

    catch (error) {

        fail(
            error
        );
    }

    finally {

        booting =
            false;
    }
}


/* =========================================================
   GLOBAL ERROR REPORTING
========================================================= */

window.addEventListener(
    "error",
    event => {

        console.error(
            "[LocalForge Global Error]",
            event.error ||
            event.message ||
            event
        );
    }
);


window.addEventListener(
    "unhandledrejection",
    event => {

        console.error(
            "[LocalForge Promise Error]",
            event.reason
        );
    }
);


/* =========================================================
   PAGE RESTORE
========================================================= */

window.addEventListener(
    "pageshow",
    event => {

        /*
         Particularly useful for iOS PWA/Safari
         back-forward cache restoration.
        */

        if (
            event.persisted &&
            booted
        ) {

            requestAnimationFrame(
                () => {

                    window.dispatchEvent(
                        new Event(
                            "resize"
                        )
                    );


                    window
                        .LocalForge3D
                        ?.renderer
                        ?.render?.(

                            window
                                .LocalForge3D
                                .scene,

                            window
                                .LocalForge3D
                                .camera
                        );
                }
            );
        }
    }
);


/* =========================================================
   PUBLIC BOOTSTRAP API
========================================================= */

window.LocalForgeBootstrap = {

    boot,


    get booted() {

        return booted;
    },


    get booting() {

        return booting;
    },


    get error() {

        return bootError;
    },


    openFeatures() {

        window
            .LocalForgeFeatures
            ?.open?.();
    },


    openAdvancedTools() {

        window
            .LocalForgeAdvancedTools
            ?.open?.();
    },


    checkUpdates() {

        return window
            .LocalForgeUpdates
            ?.check?.();
    },


    applyUpdate() {

        return window
            .LocalForgeUpdates
            ?.apply?.();
    },


    modules:

        window.LocalForgeModules
};


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        boot,
        {
            once: true
        }
    );
}

else {

    boot();
}
