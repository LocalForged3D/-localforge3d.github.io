/*
==============================================================
 LocalForge 3D
 bootstrap.js
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
   UI STATUS
========================================================= */

function status(
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
   ERROR
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


    status(
        "Engine Error: " + message,
        "error"
    );


    window.__LOCALFORGE_BOOT_ERROR__ =
        error;
}


/* =========================================================
   BUILD INFO
========================================================= */

async function loadBuild() {

    try {

        const response =
            await fetch(
                "./build.json",
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {
            return null;
        }


        const data =
            await response.json();


        window.LocalForgeBuild =
            data;


        console.log(
            "[LocalForge] Build",
            data
        );


        return data;
    }

    catch (error) {

        console.warn(
            "[LocalForge] build.json:",
            error
        );


        return null;
    }
}


/* =========================================================
   SERVICE WORKER

   Never block Three.js startup.
========================================================= */

async function registerServiceWorker() {

    if (
        !("serviceWorker" in navigator)
    ) {
        return;
    }


    if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost"
    ) {
        return;
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


        registration.update()
            .catch(() => {});


        console.log(
            "[LocalForge] Service worker:",
            registration.scope
        );
    }

    catch (error) {

        console.warn(
            "[LocalForge] Service worker not active:",
            error
        );
    }
}


/* =========================================================
   WAIT FOR APP EVENT
========================================================= */

function waitForApplication(
    timeout = 20000
) {

    return new Promise(
        (resolve, reject) => {

            if (
                window.__LOCALFORGE_READY__
            ) {

                resolve();

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


            const cleanup =
                () => {

                    window.removeEventListener(
                        "localforge:ready",
                        ready
                    );


                    window.removeEventListener(
                        "localforge:error",
                        error
                    );
                };


            const ready =
                () => {

                    if (finished) {
                        return;
                    }


                    finished =
                        true;


                    cleanup();

                    resolve();
                };


            const error =
                event => {

                    if (finished) {
                        return;
                    }


                    finished =
                        true;


                    cleanup();


                    reject(
                        event.detail?.error ||
                        new Error(
                            "LocalForge app initialization failed."
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
                error,
                {
                    once: true
                }
            );


            setTimeout(
                () => {

                    if (finished) {
                        return;
                    }


                    const canvas =
                        document.querySelector(
                            "#f-view canvas"
                        );


                    if (canvas) {

                        finished =
                            true;

                        cleanup();

                        resolve();

                        return;
                    }


                    finished =
                        true;

                    cleanup();


                    reject(
                        new Error(
                            "app.js did not create a WebGL canvas within 20 seconds."
                        )
                    );
                },

                timeout
            );
        }
    );
}


/* =========================================================
   STORAGE

   Storage failure must NOT kill the renderer.
========================================================= */

async function startStorage() {

    try {

        const database =
            await import(
                "./database.js"
            );


        if (
            typeof database.openDatabase ===
            "function"
        ) {

            await database
                .openDatabase();
        }


        console.log(
            "[LocalForge] Database ready."
        );
    }

    catch (error) {

        console.warn(
            "[LocalForge] Database unavailable:",
            error
        );
    }


    try {

        const autosave =
            await import(
                "./autosave.js"
            );


        if (
            typeof autosave.startAutosave ===
            "function"
        ) {

            await autosave
                .startAutosave();
        }


        console.log(
            "[LocalForge] Autosave ready."
        );
    }

    catch (error) {

        console.warn(
            "[LocalForge] Autosave unavailable:",
            error
        );
    }
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


    booting = true;


    try {

        status(
            "Starting LocalForge…"
        );


        /*
        ----------------------------------------------
        Build metadata is optional.
        ----------------------------------------------
        */

        loadBuild();


        /*
        ----------------------------------------------
        Runtime environment.
        ----------------------------------------------
        */

        status(
            "Preparing runtime…"
        );


        const runtime =
            await import(
                "./runtime.js"
            );


        if (
            typeof runtime.initializeRuntime ===
            "function"
        ) {

            const result =
                await runtime
                    .initializeRuntime();


            /*
             Do not continue if runtime explicitly
             determined WebGL is unavailable.
            */

            if (
                result?.capabilities?.webgl &&
                result.capabilities.webgl.available ===
                    false
            ) {

                throw new Error(
                    "WebGL is unavailable on this device."
                );
            }
        }


        /*
        ----------------------------------------------
        Persistence begins asynchronously.

        Do NOT await this before the 3D engine.
        ----------------------------------------------
        */

        startStorage();


        /*
        ----------------------------------------------
        Begin listening BEFORE app.js is imported.

        This prevents missing an immediate ready/error
        event emitted during app startup.
        ----------------------------------------------
        */

        const applicationReady =
            waitForApplication();


        status(
            "Starting 3D engine…"
        );


        /*
        ----------------------------------------------
        Single application entry.
        ----------------------------------------------
        */

        await import(
            "./app.js"
        );


        /*
        ----------------------------------------------
        Wait for app.js itself to report readiness.
        ----------------------------------------------
        */

        await applicationReady;


        booted =
            true;


        status(
            "Ready",
            "ready"
        );


        ROOT?.classList.add(
            "forge-ready"
        );


        console.log(
            "[LocalForge] Complete."
        );


        /*
        ----------------------------------------------
        PWA comes last.
        ----------------------------------------------
        */

        registerServiceWorker();
    }

    catch (error) {

        fail(error);
    }

    finally {

        booting = false;
    }
}


/* =========================================================
   ERROR REPORTING
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
