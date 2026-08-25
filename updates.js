/*
==============================================================
 LocalForge 3D
 updates.js
 Update detection / service-worker refresh helper
==============================================================
*/

const UPDATE_EVENT = "localforge:update-status";
let checking = false;

function dispatch(state, detail = {}) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, {
        detail: { state, ...detail }
    }));
}

function parseVersion(value) {
    return String(value || "0.0.0")
        .trim()
        .replace(/^v/i, "")
        .split(".")
        .map(part => {
            const n = parseInt(part, 10);
            return Number.isFinite(n) ? n : 0;
        });
}

function compareVersions(a, b) {
    const A = parseVersion(a);
    const B = parseVersion(b);
    const length = Math.max(A.length, B.length);

    for (let i = 0; i < length; i++) {
        const av = A[i] || 0;
        const bv = B[i] || 0;

        if (av > bv) return 1;
        if (av < bv) return -1;
    }

    return 0;
}

async function fetchLatestBuild() {
    const url = new URL("./build.json", location.href);
    url.searchParams.set("_lf_update", String(Date.now()));

    const response = await fetch(url.href, {
        cache: "no-store",
        headers: {
            "Cache-Control": "no-cache, no-store, max-age=0"
        }
    });

    if (!response.ok) {
        throw new Error(`Update manifest request failed (${response.status}).`);
    }

    return response.json();
}

async function updateServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;

    const registration = await navigator.serviceWorker.getRegistration("./");

    if (!registration) return null;

    try {
        await registration.update();
    } catch (error) {
        console.warn("[LocalForge Updates] Service worker update check failed:", error);
    }

    return registration;
}

export async function checkForUpdates() {
    if (checking) {
        return {
            checking: true
        };
    }

    checking = true;
    dispatch("checking");

    try {
        const current =
            window.LocalForgeBuild ||
            window.LOCALFORGE_BUILD ||
            { version: "0.0.0" };

        const [latest, registration] = await Promise.all([
            fetchLatestBuild(),
            updateServiceWorker()
        ]);

        const waitingWorker = Boolean(registration?.waiting);
        const latestVersion = latest?.version || "0.0.0";
        const currentVersion = current?.version || "0.0.0";

        const manifestUpdate =
            compareVersions(latestVersion, currentVersion) > 0;

        const available =
            waitingWorker ||
            manifestUpdate;

        const result = {
            available,
            waitingWorker,
            currentVersion,
            latestVersion,
            latest
        };

        dispatch(
            available ? "available" : "current",
            result
        );

        return result;
    }

    catch (error) {
        console.error("[LocalForge Updates] Check failed:", error);

        dispatch("error", {
            error,
            message: error?.message || String(error)
        });

        throw error;
    }

    finally {
        checking = false;
    }
}

export async function applyUpdate() {
    const registration =
        "serviceWorker" in navigator
            ? await navigator.serviceWorker.getRegistration("./")
            : null;

    if (registration?.waiting) {
        registration.waiting.postMessage({
            type: "SKIP_WAITING"
        });

        await new Promise(resolve => {
            const timer = setTimeout(resolve, 1200);

            navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => {
                    clearTimeout(timer);
                    resolve();
                },
                { once: true }
            );
        });
    }

    location.reload();
}

window.LocalForgeUpdates = {
    check: checkForUpdates,
    apply: applyUpdate,
    compareVersions
};
