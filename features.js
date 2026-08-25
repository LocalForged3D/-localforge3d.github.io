/*
==============================================================
 LocalForge 3D
 features.js
 Feature Center + update button + utility features
==============================================================
*/

import {
    checkForUpdates,
    applyUpdate
} from "./updates.js";

let initialized = false;
let panel = null;
let updateButton = null;

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function getApp() {
    return window.LocalForge3D || null;
}

function getRenderer() {
    return getApp()?.renderer || null;
}

function findSceneObject(name) {
    return getApp()?.scene?.getObjectByName?.(name) || null;
}

function setButtonState(button, active) {
    button.classList.toggle("active", Boolean(active));
    button.setAttribute("aria-pressed", active ? "true" : "false");
}

function makeAction(label, action, options = {}) {
    const button = el("button", "lf-feature-action", label);
    button.type = "button";

    if (options.title) {
        button.title = options.title;
    }

    button.addEventListener("click", async () => {
        if (button.disabled) return;

        try {
            await action(button);
        } catch (error) {
            console.error("[LocalForge Features]", error);
            showToast(error?.message || String(error), "error");
        }
    });

    return button;
}

function showToast(message, state = "info") {
    let host = document.getElementById("lf-feature-toast");

    if (!host) {
        host = el("div", "lf-feature-toast");
        host.id = "lf-feature-toast";
        document.body.appendChild(host);
    }

    host.dataset.state = state;
    host.textContent = message;
    host.classList.add("show");

    clearTimeout(host.__timer);

    host.__timer = setTimeout(() => {
        host.classList.remove("show");
    }, 2600);
}

function setPanelOpen(open) {
    if (!panel) return;

    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
}

function createStyles() {
    if (document.getElementById("lf-features-style")) return;

    const style = document.createElement("style");
    style.id = "lf-features-style";

    style.textContent = `
        .lf-feature-launchers{
            display:flex;
            align-items:center;
            gap:7px;
            margin-left:auto;
        }

        .lf-feature-header-btn{
            min-height:36px;
            padding:0 12px;
            border:1px solid #303b4d;
            border-radius:11px;
            background:#151c27;
            color:#dbe4ef;
            font:inherit;
            font-size:11px;
            font-weight:800;
            cursor:pointer;
            touch-action:manipulation;
        }

        .lf-feature-header-btn:hover,
        .lf-feature-header-btn:focus-visible{
            border-color:#168fff;
            outline:none;
        }

        .lf-feature-header-btn[data-state="available"]{
            border-color:#30d158;
        }

        .lf-feature-header-btn[data-state="error"]{
            border-color:#ff453a;
        }

        .lf-feature-panel{
            position:fixed;
            top:max(12px, env(safe-area-inset-top));
            right:max(12px, env(safe-area-inset-right));
            z-index:100000;
            width:min(390px, calc(100vw - 24px));
            max-height:calc(100dvh - 24px);
            overflow:auto;
            padding:14px;
            border:1px solid #2b3748;
            border-radius:18px;
            background:rgba(11,16,24,.96);
            color:#edf3fa;
            box-shadow:0 22px 70px rgba(0,0,0,.45);
            backdrop-filter:blur(18px);
            -webkit-backdrop-filter:blur(18px);
            opacity:0;
            visibility:hidden;
            transform:translateY(-8px) scale(.98);
            transition:.16s ease;
        }

        .lf-feature-panel.open{
            opacity:1;
            visibility:visible;
            transform:none;
        }

        .lf-feature-titlebar{
            display:flex;
            align-items:center;
            gap:10px;
            margin-bottom:14px;
        }

        .lf-feature-titlebar strong{
            flex:1;
            font-size:15px;
        }

        .lf-feature-close{
            width:34px;
            height:34px;
            border:1px solid #303b4d;
            border-radius:10px;
            background:#151c27;
            color:#fff;
            font:inherit;
            cursor:pointer;
        }

        .lf-feature-section{
            padding:12px;
            margin-top:10px;
            border:1px solid #263143;
            border-radius:14px;
            background:#101720;
        }

        .lf-feature-section h3{
            margin:0 0 9px;
            font-size:11px;
            letter-spacing:1px;
            text-transform:uppercase;
            color:#aab5c5;
        }

        .lf-feature-grid{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:7px;
        }

        .lf-feature-action{
            min-height:44px;
            padding:7px 9px;
            border:1px solid #303b4d;
            border-radius:10px;
            background:#151c27;
            color:#e8eef6;
            font:inherit;
            font-size:11px;
            font-weight:750;
            cursor:pointer;
            touch-action:manipulation;
        }

        .lf-feature-action.active{
            border-color:#168fff;
            background:#10253a;
        }

        .lf-feature-action:disabled{
            opacity:.45;
            cursor:default;
        }

        .lf-feature-info{
            margin-top:8px;
            font-size:10px;
            line-height:1.45;
            color:#8e9aac;
            overflow-wrap:anywhere;
        }

        .lf-feature-toast{
            position:fixed;
            left:50%;
            bottom:max(18px, env(safe-area-inset-bottom));
            z-index:100001;
            max-width:calc(100vw - 28px);
            transform:translate(-50%,18px);
            padding:10px 14px;
            border:1px solid #344155;
            border-radius:12px;
            background:#111925;
            color:#edf4fb;
            font:600 12px/1.35 system-ui,sans-serif;
            opacity:0;
            pointer-events:none;
            transition:.18s ease;
            box-shadow:0 15px 45px rgba(0,0,0,.35);
        }

        .lf-feature-toast.show{
            opacity:1;
            transform:translate(-50%,0);
        }

        .lf-feature-toast[data-state="error"]{
            border-color:#ff453a;
        }

        .lf-feature-toast[data-state="success"]{
            border-color:#30d158;
        }

        @media(max-width:640px){
            .lf-feature-header-btn{
                padding:0 9px;
            }

            .lf-feature-panel{
                top:auto;
                left:8px;
                right:8px;
                bottom:max(8px, env(safe-area-inset-bottom));
                width:auto;
                max-height:72dvh;
                border-radius:18px;
            }
        }
    `;

    document.head.appendChild(style);
}

function addHeaderButtons() {
    const header =
        document.querySelector(".f-header") ||
        document.querySelector(".f-brandbar") ||
        document.querySelector("header");

    if (!header) return;

    let launchers =
        document.getElementById("lf-feature-launchers");

    if (!launchers) {
        launchers = el("div", "lf-feature-launchers");
        launchers.id = "lf-feature-launchers";
        header.appendChild(launchers);
    }

    updateButton = makeAction("Check Updates", async button => {
        button.disabled = true;
        button.textContent = "Checking…";
        button.dataset.state = "checking";

        try {
            const result = await checkForUpdates();

            if (result.available) {
                button.textContent = "Update Ready";
                button.dataset.state = "available";
                showToast(
                    `Update available: ${result.currentVersion} → ${result.latestVersion}`,
                    "success"
                );
                setPanelOpen(true);
            } else {
                button.textContent = "Up to Date";
                button.dataset.state = "current";
                showToast(`LocalForge ${result.currentVersion} is current.`, "success");

                setTimeout(() => {
                    button.textContent = "Check Updates";
                }, 2200);
            }
        } catch (error) {
            button.textContent = "Update Check Failed";
            button.dataset.state = "error";

            setTimeout(() => {
                button.textContent = "Check Updates";
                button.dataset.state = "";
            }, 2600);

            throw error;
        } finally {
            button.disabled = false;
        }
    });

    updateButton.classList.add("lf-feature-header-btn");
    launchers.appendChild(updateButton);

    const featuresButton =
        makeAction("Features", () => {
            setPanelOpen(!panel?.classList.contains("open"));
        });

    featuresButton.classList.add("lf-feature-header-btn");
    launchers.appendChild(featuresButton);
}

function addUpdateSection(host) {
    const section = el("section", "lf-feature-section");
    section.innerHTML = `
        <h3>Updates</h3>
        <div class="lf-feature-grid" id="lf-update-actions"></div>
        <div class="lf-feature-info" id="lf-update-info">
            Check build.json and the service worker for a newer LocalForge release.
        </div>
    `;

    const actions = section.querySelector("#lf-update-actions");
    const info = section.querySelector("#lf-update-info");

    actions.appendChild(
        makeAction("Check Now", async button => {
            button.disabled = true;
            button.textContent = "Checking…";

            try {
                const result = await checkForUpdates();

                info.textContent =
                    result.available
                        ? `Update available. Current ${result.currentVersion}; latest ${result.latestVersion}.`
                        : `Up to date. Version ${result.currentVersion}.`;
            } finally {
                button.disabled = false;
                button.textContent = "Check Now";
            }
        })
    );

    actions.appendChild(
        makeAction("Apply Update", async () => {
            showToast("Reloading LocalForge with the newest files…");
            await applyUpdate();
        })
    );

    host.appendChild(section);
}

function addViewportSection(host) {
    const section = el("section", "lf-feature-section");
    section.innerHTML = `
        <h3>Viewport</h3>
        <div class="lf-feature-grid" id="lf-view-actions"></div>
    `;

    const actions = section.querySelector("#lf-view-actions");

    actions.appendChild(
        makeAction("Frame Object", () => {
            getApp()?.frame?.();
        })
    );

    actions.appendChild(
        makeAction("Toggle Grid", button => {
            const grid = findSceneObject("LocalForgeGrid");

            if (!grid) {
                throw new Error("Grid object is not available yet.");
            }

            grid.visible = !grid.visible;
            setButtonState(button, !grid.visible);
            button.textContent = grid.visible ? "Hide Grid" : "Show Grid";
        })
    );

    actions.appendChild(
        makeAction("Toggle Axes", button => {
            const axes = findSceneObject("LocalForgeAxes");

            if (!axes) {
                throw new Error("Axes object is not available yet.");
            }

            axes.visible = !axes.visible;
            setButtonState(button, !axes.visible);
            button.textContent = axes.visible ? "Hide Axes" : "Show Axes";
        })
    );

    actions.appendChild(
        makeAction("Fullscreen", async () => {
            const viewport = document.getElementById("f-view");

            if (!viewport) {
                throw new Error("Viewport not found.");
            }

            if (document.fullscreenElement) {
                await document.exitFullscreen?.();
            } else {
                await viewport.requestFullscreen?.();
            }
        })
    );

    host.appendChild(section);
}

function addPerformanceSection(host) {
    const section = el("section", "lf-feature-section");
    section.innerHTML = `
        <h3>Performance</h3>
        <div class="lf-feature-grid" id="lf-performance-actions"></div>
        <div class="lf-feature-info" id="lf-performance-info"></div>
    `;

    const actions = section.querySelector("#lf-performance-actions");
    const info = section.querySelector("#lf-performance-info");

    function setScale(scale) {
        const renderer = getRenderer();

        if (!renderer) {
            throw new Error("Renderer not available.");
        }

        const ratio = Math.max(
            0.75,
            Math.min(
                2,
                (window.devicePixelRatio || 1) * scale
            )
        );

        renderer.setPixelRatio(ratio);
        window.dispatchEvent(new Event("resize"));

        info.textContent = `Renderer pixel ratio: ${ratio.toFixed(2)}`;
    }

    actions.appendChild(
        makeAction("Fast", () => setScale(0.55))
    );

    actions.appendChild(
        makeAction("Balanced", () => setScale(0.8))
    );

    actions.appendChild(
        makeAction("Quality", () => setScale(1))
    );

    actions.appendChild(
        makeAction("Refresh View", () => {
            window.dispatchEvent(new Event("resize"));
            getApp()?.frame?.();
        })
    );

    host.appendChild(section);
}

function addCaptureSection(host) {
    const section = el("section", "lf-feature-section");
    section.innerHTML = `
        <h3>Tools</h3>
        <div class="lf-feature-grid" id="lf-tool-actions"></div>
        <div class="lf-feature-info" id="lf-diagnostics"></div>
    `;

    const actions = section.querySelector("#lf-tool-actions");
    const diagnostics = section.querySelector("#lf-diagnostics");

    actions.appendChild(
        makeAction("Screenshot", () => {
            const renderer = getRenderer();

            if (!renderer) {
                throw new Error("Renderer not available.");
            }

            renderer.render(
                getApp().scene,
                getApp().camera
            );

            const link = document.createElement("a");
            link.download = `LocalForge-${Date.now()}.png`;
            link.href = renderer.domElement.toDataURL("image/png");
            link.click();

            showToast("Viewport screenshot created.", "success");
        })
    );

    actions.appendChild(
        makeAction("Diagnostics", () => {
            const renderer = getRenderer();
            const gl = renderer?.getContext?.();
            const runtime = window.LocalForgeRuntime?.getRuntime?.();

            const rendererName = (() => {
                try {
                    const ext = gl?.getExtension("WEBGL_debug_renderer_info");

                    if (!ext) return "WebGL";

                    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "WebGL";
                } catch {
                    return "WebGL";
                }
            })();

            const version =
                window.LocalForgeBuild?.version ||
                window.LOCALFORGE_BUILD?.version ||
                "unknown";

            diagnostics.textContent =
                `Version ${version} · Three r${getApp()?.THREE?.REVISION || "?"} · ${rendererName}` +
                (runtime?.performance?.profile
                    ? ` · ${runtime.performance.profile}`
                    : "");
        })
    );

    host.appendChild(section);
}

function createPanel() {
    panel = el("aside", "lf-feature-panel");
    panel.id = "lf-feature-panel";
    panel.setAttribute("aria-hidden", "true");

    const titlebar = el("div", "lf-feature-titlebar");
    const title = el("strong", "", "LocalForge Features");

    const close = el("button", "lf-feature-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close Features");
    close.addEventListener("click", () => setPanelOpen(false));

    titlebar.append(title, close);
    panel.appendChild(titlebar);

    addUpdateSection(panel);
    addViewportSection(panel);
    addPerformanceSection(panel);
    addCaptureSection(panel);

    document.body.appendChild(panel);
}

export async function initializeFeatures() {
    if (initialized) return;

    initialized = true;

    createStyles();
    createPanel();
    addHeaderButtons();

    window.addEventListener("localforge:update-status", event => {
        const state = event.detail?.state;

        if (!updateButton) return;

        updateButton.dataset.state = state || "";

        if (state === "available") {
            updateButton.textContent = "Update Ready";
        }
    });

    console.log("[LocalForge Features] Ready.");
}

if (window.__LOCALFORGE_READY__) {
    initializeFeatures();
} else {
    window.addEventListener(
        "localforge:ready",
        initializeFeatures,
        { once: true }
    );
}

window.LocalForgeFeatures = {
    initialize: initializeFeatures,
    open() {
        setPanelOpen(true);
    },
    close() {
        setPanelOpen(false);
    }
};
