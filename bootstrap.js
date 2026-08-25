/*
==============================================================
 LocalForge 3D
 bootstrap.js

 Single application startup controller

 index.html
   ↓
 bootstrap.js
   ├─ build.json
   ├─ runtime.js
   ├─ database.js
   ├─ autosave.js
   ├─ app.js
   ├─ features.js
   │    └─ updates.js
   └─ sw.js
==============================================================
*/

const ROOT =
    document.getElementById("forge3d");

const STATUS =
    document.getElementById("f-status");

const ENGINE_STATE =
    document.getElementById("f-engine-state");

const ENGINE_DOT =
    document.getElementById("f-engine-dot");


let booting = false;
let booted = false;


/* =========================================================
   STATUS
========================================================= */

function setStatus(
    message,
    state = "loading"
) {

    console.log(
        "[LocalForge Bootstrap]",
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

function fail(error) {

    const message =
        error?.message ||
        String(error) ||
        "Unknown startup error";


    console.error(
        "[LocalForge Bootstrap]",
        error
    );


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


    window.__LOCALFORGE_BOOT_ERROR__ =
        error;
}


/* =========================================================
   BUILD INFORMATION
========================================================= */

async function loadBuild() {

    try {

        const url =
            new URL(
                "./build.json",
                location.href
            );


        /*
         Prevent stale build.json from causing
         update detection problems.
        */

        url.searchParams.set(
            "_lf",
            String(Date.now())
        );


        const response =
            await fetch(
                url.href,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `build.json returned ${response.status}`
            );
        }


        const build =
            await response.json();


        /*
         Both names are supported because updates.js
         understands either form.
        */

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
         Build metadata must never stop
         the modeling engine.
        */

        console.warn(
            "[LocalForge] build.json unavailable:",
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

        return null;
    }


    /*
     Service workers require HTTPS,
     except localhost.
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
         Ask for a fresh copy, but don't
         hold up application startup.
        */

        registration
            .update()
            .catch(
                error => {

                    console.warn(
                        "[LocalForge] SW update check:",
                        error
                    );
                }
            );


        return registration;
    }

    catch (error) {

        /*
         A PWA failure must never stop
         the actual 3D editor.
        */

        console.warn(
            "[LocalForge] Service worker unavailable:",
            error
        );


        return null;
    }
}


/* =========================================================
   APPLICATION READINESS
========================================================= */

function waitForApplication(
    timeout = 20000
) {

    return new Promise(
        (resolve, reject) => {

            /*
             app.js may already have completed.
            */

            if (
                window.__LOCALFORGE_READY__
            ) {

                resolve(
                    window.LocalForge3D ||
                    true
                );

                return;
            }


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
                        event.detail?.error ||
                        window.__LOCALFORGE_ERROR__ ||
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


                        const canvas =
                            document.querySelector(
                                "#f-view canvas"
                            );


                        /*
                         If the canvas exists, app.js
                         successfully initialized even if
                         the event was somehow missed.
                        */

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
                                "The 3D engine did not create a WebGL viewport within 20 seconds."
                            )
                        );
                    },
                    timeout
                );
        }
    );
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


        if (
            typeof
                database.openDatabase ===
            "function"
        ) {

            await database
                .openDatabase();
        }


        window.LocalForgeModules =
            window.LocalForgeModules ||
            {};


        window.LocalForgeModules.database =
            database;


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


        if (
            typeof
                autosave.startAutosave ===
            "function"
        ) {

            await autosave
                .startAutosave();
        }


        window.LocalForgeModules =
            window.LocalForgeModules ||
            {};


        window.LocalForgeModules.autosave =
            autosave;


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
     Database should initialize before
     autosave tries to use it.
    */

    await startDatabase();

    await startAutosave();
}


/* =========================================================
   FEATURE SYSTEM
========================================================= */

async function startFeatures() {

    try {

        console.log(
            "[LocalForge] Loading feature center…"
        );


        const features =
            await import(
                "./features.js"
            );


        if (
            typeof
                features.initializeFeatures ===
            "function"
        ) {

            await features
                .initializeFeatures();
        }


        window.LocalForgeModules =
            window.LocalForgeModules ||
            {};


        window.LocalForgeModules.features =
            features;


        console.log(
            "[LocalForge] Feature center ready."
        );


        return features;
    }

    catch (error) {

        /*
         Feature extensions are optional.

         Failure here should not destroy
         the modeling application.
        */

        console.warn(
            "[LocalForge] Feature center unavailable:",
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


    if (
        typeof
            runtime.initializeRuntime ===
        "function"
    ) {

        const result =
            await runtime
                .initializeRuntime();


        /*
         An explicit "no WebGL" result is
         a real engine blocker.
        */

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


    window.LocalForgeModules =
        window.LocalForgeModules ||
        {};


    window.LocalForgeModules.runtime =
        runtime;


    return runtime;
}


/* =========================================================
   APPLICATION
========================================================= */

async function startApplication() {

    /*
     Begin listening BEFORE app.js executes.

     app.js can become ready extremely quickly,
     and this prevents us from missing its event.
    */

    const readyPromise =
        waitForApplication();


    setStatus(
        "Starting 3D engine…"
    );


    const appModule =
        await import(
            "./app.js"
        );


    window.LocalForgeModules =
        window.LocalForgeModules ||
        {};


    window.LocalForgeModules.app =
        appModule;


    await readyPromise;


    return appModule;
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


    try {

        console.log(
            "=========================================="
        );

        console.log(
            " LocalForge 3D"
        );

        console.log(
            " Starting application"
        );

        console.log(
            "=========================================="
        );


        setStatus(
            "Starting LocalForge…"
        );


        /*
        ------------------------------------------------------
        STEP 1
        BUILD METADATA

        Does not block startup if missing.
        ------------------------------------------------------
        */

        await loadBuild();


        /*
        ------------------------------------------------------
        STEP 2
        RUNTIME
        ------------------------------------------------------
        */

        await startRuntime();


        /*
        ------------------------------------------------------
        STEP 3
        STORAGE

        Begin asynchronously.

        IndexedDB should never delay the 3D renderer.
        ------------------------------------------------------
        */

        const storagePromise =
            startStorage();


        /*
        ------------------------------------------------------
        STEP 4
        THREE.JS + MODELING APPLICATION
        ------------------------------------------------------
        */

        await startApplication();


        /*
        ------------------------------------------------------
        STEP 5
        APP IS READY
        ------------------------------------------------------
        */

        booted =
            true;


        ROOT?.classList.add(
            "forge-ready"
        );


        setStatus(
            "Ready",
            "ready"
        );


        /*
        ------------------------------------------------------
        STEP 6
        NEW FEATURE CENTER

        Creates:
        - Check Updates button
        - Features button
        - viewport tools
        - performance modes
        - screenshot
        - diagnostics
        ------------------------------------------------------
        */

        await startFeatures();


        /*
        ------------------------------------------------------
        STEP 7
        PWA SERVICE WORKER

        Register AFTER the editor is usable.
        ------------------------------------------------------
        */

        registerServiceWorker();


        /*
        ------------------------------------------------------
        STORAGE COMPLETION

        We deliberately don't make editor readiness depend
        upon storage initialization.
        ------------------------------------------------------
        */

        storagePromise
            .catch(
                error => {

                    console.warn(
                        "[LocalForge] Storage startup:",
                        error
                    );
                }
            );


        console.log(
            "[LocalForge] Complete."
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
            event.message
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
   DEBUG API
========================================================= */

window.LocalForgeBootstrap = {

    get booted() {
        return booted;
    },

    get booting() {
        return booting;
    },

    boot,

    checkUpdates() {

        return window
            .LocalForgeUpdates
            ?.check?.();
    },

    openFeatures() {

        window
            .LocalForgeFeatures
            ?.open?.();
    }
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
