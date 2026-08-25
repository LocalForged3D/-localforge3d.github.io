/*
==============================================================
 LocalForge 3D
 runtime.js

 Browser runtime / capability / lifecycle layer

 Startup ownership:
 index.html
   -> bootstrap.js
      -> runtime.js
      -> database.js
      -> autosave.js
      -> app.js

 runtime.js DOES NOT import app.js or Three.js.
==============================================================
*/

const GLOBAL = window;

const RUNTIME_KEY = "__LOCALFORGE_RUNTIME__";
const STARTED_KEY = "__LOCALFORGE_RUNTIME_STARTED__";

/* =========================================================
   EXISTING RUNTIME GUARD
   ========================================================= */

if (!GLOBAL[RUNTIME_KEY]) {
    GLOBAL[RUNTIME_KEY] = {
        version: "1.1.0",

        initialized: false,
        initializing: false,

        startedAt: 0,
        readyAt: 0,

        state: "created",

        capabilities: {},
        performance: {},
        device: {},

        listeners: new Map(),

        lastError: null
    };
}

const runtime = GLOBAL[RUNTIME_KEY];


/* =========================================================
   DOM HELPERS
   ========================================================= */

function getRoot() {
    return document.getElementById("forge3d");
}

function getStatus() {
    return document.getElementById("f-status");
}

function getEngineState() {
    return document.getElementById("f-engine-state");
}

function getViewport() {
    return document.getElementById("f-view");
}


/* =========================================================
   STATUS
   ========================================================= */

function report(message) {

    console.log(
        "[LocalForge Runtime]",
        message
    );


    /*
     Prefer the bridge supplied by index.html if present.
    */

    if (
        GLOBAL.LocalForgeUI &&
        typeof GLOBAL.LocalForgeUI.status === "function"
    ) {

        try {
            GLOBAL.LocalForgeUI.status(message);
        }
        catch (_) {}
    }


    const status =
        getStatus();

    if (
        status &&
        !GLOBAL.__LOCALFORGE_READY__
    ) {
        status.textContent = message;
    }
}


function setRuntimeState(state) {

    runtime.state = state;


    const root =
        getRoot();

    if (root) {
        root.dataset.runtimeState =
            state;
    }


    emit(
        "state",
        {
            state
        }
    );
}


/* =========================================================
   EVENTS
   ========================================================= */

function on(name, callback) {

    if (
        typeof callback !== "function"
    ) {
        return () => {};
    }


    if (
        !runtime.listeners.has(name)
    ) {
        runtime.listeners.set(
            name,
            new Set()
        );
    }


    const handlers =
        runtime.listeners.get(name);


    handlers.add(callback);


    return () => {
        handlers.delete(callback);
    };
}


function emit(name, detail = {}) {

    const handlers =
        runtime.listeners.get(name);


    if (handlers) {

        for (const callback of handlers) {

            try {
                callback(detail);
            }

            catch (error) {
                console.warn(
                    "[LocalForge Runtime] Event listener failed:",
                    error
                );
            }
        }
    }


    try {

        GLOBAL.dispatchEvent(
            new CustomEvent(
                "localforge:runtime:" + name,
                {
                    detail
                }
            )
        );
    }

    catch (_) {}
}


/* =========================================================
   DEVICE DETECTION
   ========================================================= */

function detectDevice() {

    const ua =
        navigator.userAgent || "";


    const touch =
        navigator.maxTouchPoints > 0;


    const iPhone =
        /iPhone/i.test(ua);


    const iPadUA =
        /iPad/i.test(ua);


    /*
     Modern iPadOS may identify itself as Macintosh.
    */

    const iPadDesktopUA =
        /Macintosh/i.test(ua) &&
        navigator.maxTouchPoints > 1;


    const iPad =
        iPadUA ||
        iPadDesktopUA;


    const iOS =
        iPhone ||
        iPad ||
        /iPod/i.test(ua);


    const mobile =
        iOS ||
        /Android|Mobile/i.test(ua) ||
        Math.min(
            screen.width,
            screen.height
        ) < 700;


    const standalone =
        Boolean(
            GLOBAL.matchMedia?.(
                "(display-mode: standalone)"
            ).matches ||
            navigator.standalone === true
        );


    return {
        touch,
        mobile,

        iOS,
        iPhone,
        iPad,

        standalone,

        userAgent: ua,

        language:
            navigator.language || "en",

        logicalCores:
            navigator.hardwareConcurrency ||
            null,

        deviceMemory:
            navigator.deviceMemory ||
            null,

        pixelRatio:
            GLOBAL.devicePixelRatio ||
            1,

        screenWidth:
            screen.width,

        screenHeight:
            screen.height
    };
}


/* =========================================================
   WEBGL CAPABILITIES
   ========================================================= */

function detectWebGL() {

    const canvas =
        document.createElement("canvas");


    let gl2 = null;
    let gl1 = null;


    try {

        gl2 =
            canvas.getContext(
                "webgl2",
                {
                    failIfMajorPerformanceCaveat: false
                }
            );
    }

    catch (_) {}


    if (!gl2) {

        try {

            gl1 =
                canvas.getContext(
                    "webgl",
                    {
                        failIfMajorPerformanceCaveat: false
                    }
                ) ||
                canvas.getContext(
                    "experimental-webgl"
                );
        }

        catch (_) {}
    }


    const gl =
        gl2 || gl1;


    let renderer = null;
    let vendor = null;
    let maxTextureSize = null;
    let maxRenderbufferSize = null;


    if (gl) {

        try {

            maxTextureSize =
                gl.getParameter(
                    gl.MAX_TEXTURE_SIZE
                );


            maxRenderbufferSize =
                gl.getParameter(
                    gl.MAX_RENDERBUFFER_SIZE
                );


            const debugInfo =
                gl.getExtension(
                    "WEBGL_debug_renderer_info"
                );


            if (debugInfo) {

                renderer =
                    gl.getParameter(
                        debugInfo
                            .UNMASKED_RENDERER_WEBGL
                    );


                vendor =
                    gl.getParameter(
                        debugInfo
                            .UNMASKED_VENDOR_WEBGL
                    );
            }
        }

        catch (_) {}
    }


    return {
        available: Boolean(gl),

        webgl1:
            Boolean(gl1 || gl2),

        webgl2:
            Boolean(gl2),

        renderer,
        vendor,

        maxTextureSize,
        maxRenderbufferSize
    };
}


/* =========================================================
   GENERAL CAPABILITIES
   ========================================================= */

function detectCapabilities() {

    const webgl =
        detectWebGL();


    return {

        webgl,

        indexedDB:
            "indexedDB" in GLOBAL,

        serviceWorker:
            "serviceWorker" in navigator,

        cacheStorage:
            "caches" in GLOBAL,

        fileSystemAccess:
            "showOpenFilePicker" in GLOBAL,

        webShare:
            "share" in navigator,

        clipboard:
            Boolean(
                navigator.clipboard
            ),

        pointerEvents:
            "PointerEvent" in GLOBAL,

        resizeObserver:
            "ResizeObserver" in GLOBAL,

        mutationObserver:
            "MutationObserver" in GLOBAL,

        webGPU:
            "gpu" in navigator,

        offscreenCanvas:
            "OffscreenCanvas" in GLOBAL,

        workers:
            "Worker" in GLOBAL,

        requestIdleCallback:
            "requestIdleCallback" in GLOBAL
    };
}


/* =========================================================
   PERFORMANCE PROFILE
   ========================================================= */

function choosePerformanceProfile(
    device,
    capabilities
) {

    let profile =
        "high";


    /*
     iPhones/iPads benefit from conservative defaults for
     renderer pixel ratio and expensive geometry operations.
    */

    if (device.mobile) {
        profile = "balanced";
    }


    if (
        device.deviceMemory !== null &&
        device.deviceMemory <= 4
    ) {
        profile = "mobile";
    }


    if (
        device.logicalCores !== null &&
        device.logicalCores <= 4
    ) {
        profile = "mobile";
    }


    if (
        !capabilities.webgl.webgl2
    ) {
        profile = "compatibility";
    }


    let maxPixelRatio = 2;
    let maxSubdivisionTriangles = 40000;
    let shadowMapSize = 1024;


    if (profile === "balanced") {

        maxPixelRatio = 1.5;
        maxSubdivisionTriangles = 30000;
        shadowMapSize = 1024;
    }


    else if (
        profile === "mobile"
    ) {

        maxPixelRatio = 1.25;
        maxSubdivisionTriangles = 20000;
        shadowMapSize = 512;
    }


    else if (
        profile === "compatibility"
    ) {

        maxPixelRatio = 1;
        maxSubdivisionTriangles = 12000;
        shadowMapSize = 512;
    }


    return {
        profile,

        maxPixelRatio,

        maxSubdivisionTriangles,

        shadowMapSize,

        antialias:
            profile !==
            "compatibility",

        shadows:
            capabilities
                .webgl
                .available,

        targetFPS:
            profile === "compatibility"
                ? 30
                : 60
    };
}


/* =========================================================
   CSS RUNTIME FLAGS
   ========================================================= */

function applyEnvironmentClasses() {

    const root =
        getRoot();


    if (!root) {
        return;
    }


    const device =
        runtime.device;


    root.classList.toggle(
        "lf-touch",
        device.touch
    );


    root.classList.toggle(
        "lf-mobile",
        device.mobile
    );


    root.classList.toggle(
        "lf-ios",
        device.iOS
    );


    root.classList.toggle(
        "lf-iphone",
        device.iPhone
    );


    root.classList.toggle(
        "lf-ipad",
        device.iPad
    );


    root.classList.toggle(
        "lf-standalone",
        device.standalone
    );


    root.dataset.performanceProfile =
        runtime
            .performance
            .profile;
}


/* =========================================================
   VISIBILITY
   ========================================================= */

function installVisibilityHandling() {

    document.addEventListener(
        "visibilitychange",
        () => {

            const visible =
                !document.hidden;


            runtime.visible =
                visible;


            emit(
                visible
                    ? "resume"
                    : "suspend",
                {
                    visible
                }
            );


            /*
             app.js may optionally listen for these events.
             We deliberately do NOT destroy the renderer.
            */

            if (visible) {

                GLOBAL.dispatchEvent(
                    new Event(
                        "localforge:resume"
                    )
                );
            }

            else {

                GLOBAL.dispatchEvent(
                    new Event(
                        "localforge:suspend"
                    )
                );
            }
        }
    );
}


/* =========================================================
   PAGE LIFECYCLE
   ========================================================= */

function installPageLifecycle() {

    GLOBAL.addEventListener(
        "pageshow",
        event => {

            emit(
                "pageshow",
                {
                    persisted:
                        event.persisted
                }
            );


            /*
             iOS can restore a PWA from the back-forward cache.
             Tell the renderer to resize/repaint.
            */

            if (event.persisted) {

                requestAnimationFrame(
                    () => {

                        GLOBAL.dispatchEvent(
                            new Event(
                                "resize"
                            )
                        );
                    }
                );
            }
        }
    );


    GLOBAL.addEventListener(
        "pagehide",
        event => {

            emit(
                "pagehide",
                {
                    persisted:
                        event.persisted
                }
            );
        }
    );
}


/* =========================================================
   ORIENTATION / VISUAL VIEWPORT
   ========================================================= */

function installViewportHandling() {

    let timer = 0;


    const update = () => {

        clearTimeout(timer);


        timer =
            setTimeout(
                () => {

                    const root =
                        getRoot();


                    if (
                        root &&
                        GLOBAL.visualViewport
                    ) {

                        root.style.setProperty(
                            "--lf-viewport-height",

                            `${GLOBAL.visualViewport.height}px`
                        );
                    }


                    GLOBAL.dispatchEvent(
                        new CustomEvent(
                            "localforge:viewportchange"
                        )
                    );
                },

                40
            );
    };


    GLOBAL.addEventListener(
        "orientationchange",
        update,
        {
            passive: true
        }
    );


    GLOBAL.visualViewport
        ?.addEventListener(
            "resize",
            update,
            {
                passive: true
            }
        );


    update();
}


/* =========================================================
   WEBGL CONTEXT EVENTS
   ========================================================= */

function installContextRecoveryWatch() {

    const viewport =
        getViewport();


    if (!viewport) {
        return;
    }


    /*
     app.js adds the actual canvas later.

     Watch for it and install context loss handlers once.
    */

    const installOnCanvas =
        canvas => {

            if (
                !canvas ||
                canvas.dataset
                    .lfContextWatch ===
                    "1"
            ) {
                return;
            }


            canvas.dataset
                .lfContextWatch =
                "1";


            canvas.addEventListener(
                "webglcontextlost",
                event => {

                    event.preventDefault();


                    runtime.state =
                        "context-lost";


                    report(
                        "3D context paused…"
                    );


                    emit(
                        "contextlost"
                    );
                }
            );


            canvas.addEventListener(
                "webglcontextrestored",
                () => {

                    runtime.state =
                        "ready";


                    report(
                        "3D context restored"
                    );


                    emit(
                        "contextrestored"
                    );


                    GLOBAL.dispatchEvent(
                        new Event(
                            "resize"
                        )
                    );
                }
            );
        };


    const existing =
        viewport.querySelector(
            "canvas"
        );


    if (existing) {
        installOnCanvas(existing);
    }


    if (
        "MutationObserver" in
        GLOBAL
    ) {

        const observer =
            new MutationObserver(
                () => {

                    const canvas =
                        viewport.querySelector(
                            "canvas"
                        );


                    if (canvas) {
                        installOnCanvas(
                            canvas
                        );
                    }
                }
            );


        observer.observe(
            viewport,
            {
                childList: true,
                subtree: true
            }
        );
    }
}


/* =========================================================
   RUNTIME FAILURE
   ========================================================= */

function runtimeFailure(error) {

    runtime.lastError =
        error;


    runtime.initializing =
        false;


    setRuntimeState(
        "error"
    );


    console.error(
        "[LocalForge Runtime] Initialization failure:",
        error
    );


    emit(
        "error",
        {
            error
        }
    );


    /*
     Runtime errors should not block app.js unless WebGL itself
     is unavailable. bootstrap.js can still continue.
    */

    return runtime;
}


/* =========================================================
   INITIALIZE
   ========================================================= */

export async function initializeRuntime() {

    if (
        runtime.initialized
    ) {
        return runtime;
    }


    if (
        runtime.initializing
    ) {

        /*
         Wait for the current initialization pass.
        */

        return new Promise(
            resolve => {

                const check =
                    () => {

                        if (
                            !runtime.initializing
                        ) {

                            resolve(runtime);

                            return;
                        }


                        setTimeout(
                            check,
                            10
                        );
                    };


                check();
            }
        );
    }


    runtime.initializing =
        true;


    runtime.startedAt =
        performance.now();


    setRuntimeState(
        "initializing"
    );


    try {

        report(
            "Preparing LocalForge runtime…"
        );


        runtime.device =
            detectDevice();


        runtime.capabilities =
            detectCapabilities();


        runtime.performance =
            choosePerformanceProfile(
                runtime.device,
                runtime.capabilities
            );


        applyEnvironmentClasses();


        installVisibilityHandling();

        installPageLifecycle();

        installViewportHandling();

        installContextRecoveryWatch();


        /*
         Expose data globally for app.js.
        */

        GLOBAL.LocalForge =
            GLOBAL.LocalForge ||
            {};


        GLOBAL.LocalForge.runtime =
            runtime;


        GLOBAL.LocalForge.capabilities =
            runtime.capabilities;


        GLOBAL.LocalForge.performance =
            runtime.performance;


        GLOBAL.LocalForge.device =
            runtime.device;


        /*
         Important:
         Do not throw just because WebGL2 is unavailable.
         app.js can still use WebGL1 where Three.js supports it.

         No WebGL at all is a real problem.
        */

        if (
            !runtime
                .capabilities
                .webgl
                .available
        ) {

            throw new Error(
                "This browser does not provide a usable WebGL context."
            );
        }


        runtime.initialized =
            true;


        runtime.initializing =
            false;


        runtime.readyAt =
            performance.now();


        runtime.initDuration =
            runtime.readyAt -
            runtime.startedAt;


        setRuntimeState(
            "ready"
        );


        emit(
            "ready",
            {
                runtime
            }
        );


        console.log(
            "[LocalForge Runtime] Ready",
            {
                device:
                    runtime.device,

                capabilities:
                    runtime.capabilities,

                performance:
                    runtime.performance,

                startupMs:
                    Math.round(
                        runtime.initDuration
                    )
            }
        );


        return runtime;
    }


    catch (error) {

        return runtimeFailure(
            error
        );
    }
}


/* =========================================================
   PUBLIC API
   ========================================================= */

export function getRuntime() {
    return runtime;
}


export function getCapabilities() {
    return runtime.capabilities;
}


export function getDeviceInfo() {
    return runtime.device;
}


export function getPerformanceProfile() {
    return runtime.performance;
}


export function onRuntimeEvent(
    name,
    callback
) {
    return on(
        name,
        callback
    );
}


/* =========================================================
   GLOBAL API
   ========================================================= */

GLOBAL.LocalForgeRuntime = {

    initialize:
        initializeRuntime,

    getRuntime,

    getCapabilities,

    getDeviceInfo,

    getPerformanceProfile,

    on:
        onRuntimeEvent,

    emit
};


/* =========================================================
   AUTO INITIALIZE

   bootstrap.js currently imports runtime.js but does not need
   to call a specific function. Therefore importing this module
   automatically prepares the runtime.

   It DOES NOT load app.js.
   ========================================================= */

if (
    !GLOBAL[STARTED_KEY]
) {

    GLOBAL[STARTED_KEY] =
        true;


    initializeRuntime()
        .catch(error => {

            /*
             initializeRuntime already handles expected failures.
             This is only a final protection against an unexpected
             rejected promise.
            */

            console.error(
                "[LocalForge Runtime] Fatal runtime error:",
                error
            );
        });
}