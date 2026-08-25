/*
==============================================================
 LocalForge 3D
 advanced-tools.js

 Mobile-first advanced tool catalog.

 Adds:
 - 200+ sculpt brush presets
 - sculpt workflow tools/macros
 - 120+ modifier-node presets
 - procedural node stacks
 - searchable/categorized mobile tool drawer

 This file EXTENDS the existing app.js without replacing it.
 It drives the existing LocalForge Sculpt/Nodes UI so the
 original geometry engine remains the single source of truth.
==============================================================
*/

const LF_ADVANCED_VERSION = "1.0.0";
const PAGE_SIZE = 48;

let initialized = false;
let launcher = null;
let drawer = null;
let content = null;
let searchInput = null;
let activeSection = "brushes";
let activeCategory = "All";
let page = 1;


/* =========================================================
   CATALOG GENERATORS
========================================================= */

const BRUSH_TYPES = [
    { type: "Draw", category: "Build", icon: "D" },
    { type: "Clay", category: "Build", icon: "C" },
    { type: "Inflate", category: "Volume", icon: "I" },
    { type: "Smooth", category: "Polish", icon: "S" },
    { type: "Flatten", category: "Hard Surface", icon: "F" },
    { type: "Pinch", category: "Detail", icon: "P" },
    { type: "Crease", category: "Detail", icon: "Cr" },
    { type: "Grab", category: "Move", icon: "G" },
    { type: "Scrape", category: "Hard Surface", icon: "Sc" }
];

const SIZE_PROFILES = [
    ["Micro", 0.10, 0.030],
    ["Fine", 0.18, 0.045],
    ["Detail", 0.28, 0.065],
    ["Small", 0.42, 0.080],
    ["Medium", 0.65, 0.110],
    ["Large", 0.95, 0.145],
    ["Broad", 1.35, 0.180],
    ["Massive", 1.90, 0.240]
];

const POWER_PROFILES = [
    ["Soft", 0.06, "Smooth"],
    ["Gentle", 0.10, "Smooth"],
    ["Standard", 0.18, "Smooth"],
    ["Firm", 0.28, "Linear"]
];

const BRUSHES = [];

for (const base of BRUSH_TYPES) {
    for (const [sizeName, radius, spacing] of SIZE_PROFILES) {
        for (const [powerName, strength, falloff] of POWER_PROFILES) {
            const tunedStrength =
                base.type === "Smooth" ? strength * 1.25 :
                base.type === "Grab" ? strength * 0.72 :
                base.type === "Crease" ? strength * 0.82 :
                base.type === "Scrape" ? strength * 0.90 :
                strength;

            BRUSHES.push({
                id: `brush-${base.type}-${sizeName}-${powerName}`.toLowerCase(),
                name: `${sizeName} ${powerName} ${base.type}`,
                type: base.type,
                category: base.category,
                radius,
                strength: +tunedStrength.toFixed(3),
                spacing,
                falloff,
                symX: false,
                symY: false,
                symZ: false,
                tags: `${base.type} ${base.category} ${sizeName} ${powerName}`.toLowerCase()
            });
        }
    }
}

/*
 9 base brushes × 8 sizes × 4 powers = 288 brush presets.
*/

const SCULPT_TOOLS = [
    ["Skin Polish", "Smooth", 0.42, 0.14, 0.07, "Smooth", "Polish"],
    ["Surface Relax", "Smooth", 0.82, 0.10, 0.09, "Smooth", "Polish"],
    ["Heavy Relax", "Smooth", 1.30, 0.22, 0.11, "Smooth", "Polish"],
    ["Hard Polish", "Scrape", 0.55, 0.16, 0.06, "Linear", "Hard Surface"],
    ["Plane Polish", "Flatten", 0.72, 0.16, 0.07, "Linear", "Hard Surface"],
    ["Panel Plane", "Flatten", 1.10, 0.25, 0.10, "Linear", "Hard Surface"],
    ["Edge Pinch", "Pinch", 0.22, 0.22, 0.04, "Sharp", "Detail"],
    ["Micro Pinch", "Pinch", 0.11, 0.15, 0.03, "Sharp", "Detail"],
    ["Primary Crease", "Crease", 0.30, 0.20, 0.04, "Sharp", "Detail"],
    ["Deep Crease", "Crease", 0.20, 0.34, 0.03, "Sharp", "Detail"],
    ["Skin Fold", "Crease", 0.48, 0.12, 0.05, "Smooth", "Organic"],
    ["Wrinkle Fine", "Crease", 0.12, 0.11, 0.02, "Sharp", "Organic"],
    ["Wrinkle Broad", "Crease", 0.28, 0.10, 0.04, "Smooth", "Organic"],
    ["Muscle Build", "Clay", 0.75, 0.17, 0.08, "Smooth", "Organic"],
    ["Muscle Mass", "Clay", 1.20, 0.22, 0.11, "Smooth", "Organic"],
    ["Bone Ridge", "Clay", 0.34, 0.22, 0.04, "Linear", "Organic"],
    ["Soft Tissue", "Inflate", 0.70, 0.10, 0.08, "Smooth", "Organic"],
    ["Volume Add", "Inflate", 1.20, 0.20, 0.12, "Smooth", "Volume"],
    ["Volume Fine", "Inflate", 0.28, 0.12, 0.04, "Smooth", "Volume"],
    ["Blob Build", "Draw", 1.00, 0.20, 0.10, "Smooth", "Build"],
    ["Fine Build", "Draw", 0.24, 0.11, 0.04, "Smooth", "Build"],
    ["Primary Form", "Clay", 1.45, 0.14, 0.14, "Smooth", "Build"],
    ["Secondary Form", "Clay", 0.70, 0.13, 0.08, "Smooth", "Build"],
    ["Tertiary Detail", "Draw", 0.20, 0.10, 0.03, "Sharp", "Detail"],
    ["Move Large", "Grab", 1.80, 0.16, 0.16, "Smooth", "Move"],
    ["Move Medium", "Grab", 0.95, 0.15, 0.10, "Smooth", "Move"],
    ["Move Fine", "Grab", 0.42, 0.10, 0.06, "Smooth", "Move"],
    ["Silhouette Push", "Grab", 1.35, 0.12, 0.14, "Smooth", "Move"],
    ["Corner Cut", "Scrape", 0.30, 0.28, 0.04, "Sharp", "Hard Surface"],
    ["Chamfer Polish", "Scrape", 0.50, 0.18, 0.05, "Linear", "Hard Surface"],
    ["Panel Flatten", "Flatten", 0.90, 0.26, 0.08, "Sharp", "Hard Surface"],
    ["Mechanical Plane", "Flatten", 1.50, 0.30, 0.12, "Linear", "Hard Surface"]
].map((v, i) => ({
    id: `sculpt-tool-${i}`,
    name: v[0],
    type: v[1],
    radius: v[2],
    strength: v[3],
    spacing: v[4],
    falloff: v[5],
    category: v[6],
    symX: false,
    symY: false,
    symZ: false,
    tags: `${v[0]} ${v[1]} ${v[6]}`.toLowerCase()
}));

const NODE_BASES = [
    {
        type: "twist",
        category: "Deform",
        variants: Array.from({length: 20}, (_, i) => ({
            name: `Twist ${i + 1}`,
            p: { amount: -360 + i * 36, axis: i % 3 === 0 ? "x" : i % 3 === 1 ? "y" : "z" }
        }))
    },
    {
        type: "bend",
        category: "Deform",
        variants: Array.from({length: 20}, (_, i) => ({
            name: `Bend ${i + 1}`,
            p: { amount: -135 + i * 15, axis: i % 3 === 0 ? "x" : i % 3 === 1 ? "y" : "z" }
        }))
    },
    {
        type: "taper",
        category: "Shape",
        variants: Array.from({length: 20}, (_, i) => ({
            name: `Taper ${i + 1}`,
            p: { factor: +(-1.5 + i * 0.15).toFixed(2), axis: i % 3 === 0 ? "x" : i % 3 === 1 ? "y" : "z" }
        }))
    },
    {
        type: "noise",
        category: "Surface",
        variants: Array.from({length: 24}, (_, i) => ({
            name: `Noise ${i + 1}`,
            p: {
                strength: +(0.03 + (i % 8) * 0.05).toFixed(2),
                frequency: +(0.5 + Math.floor(i / 4) * 0.7).toFixed(2),
                seed: i + 1
            }
        }))
    },
    {
        type: "spherize",
        category: "Shape",
        variants: Array.from({length: 20}, (_, i) => ({
            name: `Spherize ${i + 1}`,
            p: { factor: +((i + 1) / 20).toFixed(2) }
        }))
    },
    {
        type: "flatten",
        category: "Hard Surface",
        variants: Array.from({length: 20}, (_, i) => ({
            name: `Flatten ${i + 1}`,
            p: { amount: +(-1 + i * 0.1).toFixed(2), axis: i % 3 === 0 ? "x" : i % 3 === 1 ? "y" : "z" }
        }))
    }
];

const NODE_PRESETS = [];

for (const group of NODE_BASES) {
    group.variants.forEach((variant, index) => {
        NODE_PRESETS.push({
            id: `node-${group.type}-${index}`,
            type: group.type,
            name: variant.name,
            category: group.category,
            p: variant.p,
            tags: `${variant.name} ${group.type} ${group.category}`.toLowerCase()
        });
    });
}

/*
 124 functional node presets generated from the six modifier engines.
*/

const NODE_STACKS = [
    {
        name: "Organic Warp",
        category: "Organic",
        items: [
            {type:"noise", p:{strength:0.09, frequency:1.8, seed:3}},
            {type:"bend", p:{amount:22, axis:"x"}},
            {type:"spherize", p:{factor:0.12}}
        ]
    },
    {
        name: "Creature Mass",
        category: "Organic",
        items: [
            {type:"spherize", p:{factor:0.35}},
            {type:"taper", p:{factor:0.28, axis:"y"}},
            {type:"noise", p:{strength:0.05, frequency:2.6, seed:8}}
        ]
    },
    {
        name: "Rock Surface",
        category: "Surface",
        items: [
            {type:"noise", p:{strength:0.20, frequency:1.4, seed:11}},
            {type:"noise", p:{strength:0.06, frequency:5.0, seed:29}},
            {type:"flatten", p:{amount:-0.15, axis:"y"}}
        ]
    },
    {
        name: "Twisted Column",
        category: "Architectural",
        items: [
            {type:"taper", p:{factor:0.18, axis:"y"}},
            {type:"twist", p:{amount:160, axis:"y"}}
        ]
    },
    {
        name: "Spiral Horn",
        category: "Organic",
        items: [
            {type:"taper", p:{factor:-0.85, axis:"y"}},
            {type:"twist", p:{amount:280, axis:"y"}},
            {type:"bend", p:{amount:38, axis:"x"}}
        ]
    },
    {
        name: "Soft Inflate Shape",
        category: "Shape",
        items: [
            {type:"spherize", p:{factor:0.55}},
            {type:"taper", p:{factor:0.12, axis:"y"}}
        ]
    },
    {
        name: "Mechanical Distort",
        category: "Hard Surface",
        items: [
            {type:"flatten", p:{amount:0, axis:"y"}},
            {type:"taper", p:{factor:0.22, axis:"x"}},
            {type:"twist", p:{amount:12, axis:"z"}}
        ]
    },
    {
        name: "Wind Sweep",
        category: "Deform",
        items: [
            {type:"bend", p:{amount:55, axis:"x"}},
            {type:"twist", p:{amount:35, axis:"y"}}
        ]
    }
];

/*
 Expand stack catalog with generated variations.
*/
const STACKS = [];

NODE_STACKS.forEach((base, baseIndex) => {
    for (let v = 0; v < 6; v++) {
        const scale = 0.65 + v * 0.15;

        STACKS.push({
            id: `stack-${baseIndex}-${v}`,
            name: `${base.name} ${v + 1}`,
            category: base.category,
            items: base.items.map(item => ({
                type: item.type,
                p: Object.fromEntries(
                    Object.entries(item.p).map(([key, value]) => {
                        if (typeof value !== "number") return [key, value];
                        if (key === "seed") return [key, value + v];
                        return [key, +(value * scale).toFixed(3)];
                    })
                )
            })),
            tags: `${base.name} ${base.category}`.toLowerCase()
        });
    }
});


/* =========================================================
   DOM / APP HELPERS
========================================================= */

const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function click(selector) {
    const node = q(selector);
    if (!node) return false;
    node.click();
    return true;
}

function dispatchValue(element, value, eventName = "change") {
    if (!element) return;

    element.value = String(value);
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function switchWorkspace(workspace) {
    const button = q(`[data-work="${workspace}"]`);

    if (!button) {
        throw new Error(`Workspace '${workspace}' is unavailable.`);
    }

    button.click();
}

function setCheckbox(selector, checked) {
    const node = q(selector);
    if (!node) return;

    node.checked = Boolean(checked);
    node.dispatchEvent(new Event("change", { bubbles: true }));
}


/* =========================================================
   BRUSH APPLICATION
========================================================= */

async function applyBrush(preset) {
    switchWorkspace("sculpt");

    const brushButton = q(`[data-brush="${preset.type}"]`);

    if (!brushButton) {
        throw new Error(`Sculpt brush '${preset.type}' is unavailable.`);
    }

    /*
     Existing app.js re-renders the sculpt panel synchronously when
     a base brush is selected.
    */
    brushButton.click();

    dispatchValue(q('[data-val="radius"]'), preset.radius);
    dispatchValue(q('[data-val="strength"]'), preset.strength);
    dispatchValue(q('[data-val="spacing"]'), preset.spacing);

    const fall = q("#f-fall");

    if (fall) {
        fall.value = preset.falloff;
        fall.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setCheckbox("#f-sx", preset.symX);
    setCheckbox("#f-sy", preset.symY);
    setCheckbox("#f-sz", preset.symZ);

    toast(`${preset.name} active`, "success");
    closeDrawerOnMobile();
}


/* =========================================================
   NODE APPLICATION
========================================================= */

function setNodeInspectorValues(params) {
    for (const [key, value] of Object.entries(params || {})) {
        if (key === "axis") {
            const axis = q("#f-axis");

            if (axis) {
                axis.value = value;
                axis.dispatchEvent(new Event("change", { bubbles: true }));
            }

            continue;
        }

        const number = q(`[data-val="${key}"]`);
        const range = q(`[data-range="${key}"]`);

        if (range) {
            range.value = String(value);
            range.dispatchEvent(new Event("input", { bubbles: true }));
        }

        if (number) {
            number.value = String(value);
            number.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }
}

async function applyNodePreset(preset, quiet = false) {
    switchWorkspace("nodes");

    const addButton = q(`[data-tool="${preset.type}"]`);

    if (!addButton) {
        throw new Error(`Modifier node '${preset.type}' is unavailable.`);
    }

    addButton.click();

    /*
     Clicking Add Modifier renders the new node inspector immediately.
    */
    setNodeInspectorValues(preset.p);

    if (!quiet) {
        toast(`${preset.name} node added`, "success");
        closeDrawerOnMobile();
    }
}

async function applyStack(stack) {
    for (const item of stack.items) {
        await applyNodePreset({
            type: item.type,
            name: item.type,
            p: item.p
        }, true);
    }

    toast(`${stack.name} stack added`, "success");
    closeDrawerOnMobile();
}


/* =========================================================
   MOBILE UI
========================================================= */

function installStyles() {
    if (q("#lf-advanced-tools-style")) return;

    const style = document.createElement("style");
    style.id = "lf-advanced-tools-style";

    style.textContent = `
        :root{
            --lf-tools-bg:#0d141e;
            --lf-tools-panel:#111a26;
            --lf-tools-border:#29364a;
            --lf-tools-text:#eef5fd;
            --lf-tools-muted:#8d9aab;
            --lf-tools-accent:#168fff;
        }

        #lf-advanced-launcher{
            position:fixed;
            right:max(12px,env(safe-area-inset-right));
            bottom:max(16px,calc(env(safe-area-inset-bottom) + 8px));
            z-index:90000;
            min-width:74px;
            min-height:48px;
            padding:0 15px;
            border:1px solid #369fff;
            border-radius:16px;
            background:linear-gradient(180deg,#168fff,#0675df);
            color:white;
            font:800 12px/1 system-ui,sans-serif;
            box-shadow:0 12px 30px rgba(0,100,210,.30);
            touch-action:manipulation;
        }

        #lf-advanced-drawer{
            position:fixed;
            inset:0;
            z-index:90001;
            display:none;
            pointer-events:none;
        }

        #lf-advanced-drawer.open{
            display:block;
            pointer-events:auto;
        }

        .lf-tools-scrim{
            position:absolute;
            inset:0;
            background:rgba(0,0,0,.54);
        }

        .lf-tools-sheet{
            position:absolute;
            top:max(10px,env(safe-area-inset-top));
            right:max(10px,env(safe-area-inset-right));
            bottom:max(10px,env(safe-area-inset-bottom));
            width:min(440px,calc(100vw - 20px));
            display:flex;
            flex-direction:column;
            overflow:hidden;
            border:1px solid var(--lf-tools-border);
            border-radius:20px;
            background:rgba(10,15,23,.985);
            box-shadow:0 30px 90px rgba(0,0,0,.55);
            backdrop-filter:blur(20px);
            -webkit-backdrop-filter:blur(20px);
        }

        .lf-tools-head{
            flex:0 0 auto;
            padding:12px;
            border-bottom:1px solid var(--lf-tools-border);
        }

        .lf-tools-titlebar{
            display:flex;
            align-items:center;
            gap:10px;
            margin-bottom:10px;
        }

        .lf-tools-titlebar strong{
            flex:1;
            color:var(--lf-tools-text);
            font:850 15px/1.2 system-ui,sans-serif;
        }

        .lf-tools-count{
            color:var(--lf-tools-muted);
            font:700 10px/1 system-ui,sans-serif;
        }

        .lf-tools-close{
            width:38px;
            height:38px;
            border:1px solid var(--lf-tools-border);
            border-radius:11px;
            background:#141e2b;
            color:white;
            font-size:18px;
        }

        .lf-tools-search{
            width:100%;
            min-height:44px;
            padding:0 13px;
            border:1px solid #324156;
            border-radius:12px;
            outline:none;
            background:#121b27;
            color:white;
            font:700 13px system-ui,sans-serif;
        }

        .lf-tools-search:focus{
            border-color:var(--lf-tools-accent);
            box-shadow:0 0 0 2px rgba(22,143,255,.12);
        }

        .lf-tools-tabs,
        .lf-tools-categories{
            display:flex;
            gap:7px;
            overflow-x:auto;
            scrollbar-width:none;
            padding:9px 0 0;
            -webkit-overflow-scrolling:touch;
        }

        .lf-tools-tabs::-webkit-scrollbar,
        .lf-tools-categories::-webkit-scrollbar{
            display:none;
        }

        .lf-tools-tab,
        .lf-tools-category{
            flex:0 0 auto;
            min-height:36px;
            padding:0 11px;
            border:1px solid #2d3a4d;
            border-radius:11px;
            background:#131c28;
            color:#b8c3d1;
            font:800 11px/1 system-ui,sans-serif;
            white-space:nowrap;
        }

        .lf-tools-tab.active,
        .lf-tools-category.active{
            border-color:var(--lf-tools-accent);
            background:#102a42;
            color:white;
        }

        .lf-tools-content{
            flex:1 1 auto;
            min-height:0;
            overflow:auto;
            padding:10px;
            overscroll-behavior:contain;
            -webkit-overflow-scrolling:touch;
        }

        .lf-tools-grid{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:8px;
        }

        .lf-tool-card{
            min-width:0;
            min-height:64px;
            padding:10px;
            text-align:left;
            border:1px solid #283649;
            border-radius:13px;
            background:#111a26;
            color:var(--lf-tools-text);
            touch-action:manipulation;
        }

        .lf-tool-card:active{
            transform:scale(.985);
            background:#152235;
        }

        .lf-tool-name{
            display:block;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            font:800 11px/1.25 system-ui,sans-serif;
        }

        .lf-tool-meta{
            display:block;
            margin-top:5px;
            color:var(--lf-tools-muted);
            font:650 9px/1.25 system-ui,sans-serif;
        }

        .lf-tools-more{
            width:100%;
            min-height:44px;
            margin-top:10px;
            border:1px solid #34445b;
            border-radius:12px;
            background:#162131;
            color:white;
            font:800 11px system-ui,sans-serif;
        }

        .lf-tools-empty{
            padding:34px 15px;
            text-align:center;
            color:var(--lf-tools-muted);
            font:700 12px/1.5 system-ui,sans-serif;
        }

        #lf-tools-toast{
            position:fixed;
            left:50%;
            bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px));
            z-index:90003;
            max-width:calc(100vw - 30px);
            padding:10px 13px;
            border:1px solid #33435a;
            border-radius:12px;
            background:#111a26;
            color:white;
            opacity:0;
            transform:translate(-50%,12px);
            pointer-events:none;
            transition:.16s ease;
            font:750 11px/1.35 system-ui,sans-serif;
            box-shadow:0 12px 36px rgba(0,0,0,.35);
        }

        #lf-tools-toast.show{
            opacity:1;
            transform:translate(-50%,0);
        }

        #lf-tools-toast[data-state="error"]{
            border-color:#ff453a;
        }

        #lf-tools-toast[data-state="success"]{
            border-color:#30d158;
        }

        @media(max-width:720px){
            #lf-advanced-launcher{
                right:10px;
                bottom:max(10px,calc(env(safe-area-inset-bottom) + 6px));
                min-height:46px;
                border-radius:14px;
            }

            .lf-tools-sheet{
                top:auto;
                left:6px;
                right:6px;
                bottom:max(6px,env(safe-area-inset-bottom));
                width:auto;
                max-height:min(78dvh,760px);
                border-radius:20px 20px 16px 16px;
            }

            .lf-tools-grid{
                grid-template-columns:repeat(3,minmax(0,1fr));
                gap:6px;
            }

            .lf-tool-card{
                min-height:60px;
                padding:8px;
                border-radius:11px;
            }

            .lf-tool-name{
                white-space:normal;
                display:-webkit-box;
                -webkit-line-clamp:2;
                -webkit-box-orient:vertical;
            }
        }

        @media(max-width:430px){
            .lf-tools-grid{
                grid-template-columns:repeat(2,minmax(0,1fr));
            }
        }

        @media(min-width:1000px){
            #lf-advanced-launcher{
                position:fixed;
                right:18px;
                bottom:18px;
            }

            .lf-tools-sheet{
                width:480px;
            }

            .lf-tools-grid{
                grid-template-columns:repeat(3,minmax(0,1fr));
            }
        }
    `;

    document.head.appendChild(style);
}

function getSectionItems() {
    if (activeSection === "brushes") return BRUSHES;
    if (activeSection === "sculpt") return SCULPT_TOOLS;
    if (activeSection === "nodes") return NODE_PRESETS;
    return STACKS;
}

function categoriesFor(items) {
    return ["All", ...Array.from(new Set(items.map(x => x.category))).sort()];
}

function itemMeta(item) {
    if (activeSection === "brushes" || activeSection === "sculpt") {
        return `${item.type} · R ${item.radius} · S ${item.strength}`;
    }

    if (activeSection === "nodes") {
        return `${item.type} modifier`;
    }

    return `${item.items.length} nodes`;
}

function renderCategories() {
    const host = q("#lf-tools-categories");

    if (!host) return;

    const items = getSectionItems();
    const categories = categoriesFor(items);

    if (!categories.includes(activeCategory)) {
        activeCategory = "All";
    }

    host.innerHTML = "";

    for (const category of categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lf-tools-category" + (category === activeCategory ? " active" : "");
        button.textContent = category;

        button.addEventListener("click", () => {
            activeCategory = category;
            page = 1;
            renderCategories();
            renderItems();
        });

        host.appendChild(button);
    }
}

function filteredItems() {
    const query = (searchInput?.value || "").trim().toLowerCase();

    return getSectionItems().filter(item => {
        if (activeCategory !== "All" && item.category !== activeCategory) {
            return false;
        }

        if (!query) return true;

        const haystack = `${item.name} ${item.type || ""} ${item.category || ""} ${item.tags || ""}`.toLowerCase();
        return haystack.includes(query);
    });
}

function renderItems() {
    if (!content) return;

    const all = filteredItems();
    const shown = all.slice(0, page * PAGE_SIZE);

    const count = q("#lf-tools-count");
    if (count) {
        count.textContent = `${all.length} tools`;
    }

    content.innerHTML = "";

    if (!shown.length) {
        const empty = document.createElement("div");
        empty.className = "lf-tools-empty";
        empty.textContent = "No matching LocalForge tools.";
        content.appendChild(empty);
        return;
    }

    const grid = document.createElement("div");
    grid.className = "lf-tools-grid";

    for (const item of shown) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lf-tool-card";

        const name = document.createElement("span");
        name.className = "lf-tool-name";
        name.textContent = item.name;

        const meta = document.createElement("span");
        meta.className = "lf-tool-meta";
        meta.textContent = itemMeta(item);

        button.append(name, meta);

        button.addEventListener("click", async () => {
            button.disabled = true;

            try {
                if (activeSection === "brushes" || activeSection === "sculpt") {
                    await applyBrush(item);
                } else if (activeSection === "nodes") {
                    await applyNodePreset(item);
                } else {
                    await applyStack(item);
                }
            } catch (error) {
                console.error("[LocalForge Advanced Tools]", error);
                toast(error?.message || String(error), "error");
            } finally {
                button.disabled = false;
            }
        });

        grid.appendChild(button);
    }

    content.appendChild(grid);

    if (shown.length < all.length) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "lf-tools-more";
        more.textContent = `Load ${Math.min(PAGE_SIZE, all.length - shown.length)} more`;

        more.addEventListener("click", () => {
            page += 1;
            renderItems();
        });

        content.appendChild(more);
    }
}

function setSection(section) {
    activeSection = section;
    activeCategory = "All";
    page = 1;

    qa(".lf-tools-tab", drawer).forEach(button => {
        button.classList.toggle("active", button.dataset.section === section);
    });

    renderCategories();
    renderItems();
}

function openDrawer() {
    drawer?.classList.add("open");
    drawer?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
        searchInput?.focus?.({ preventScroll: true });
    }, 80);
}

function closeDrawer() {
    drawer?.classList.remove("open");
    drawer?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function closeDrawerOnMobile() {
    if (matchMedia("(max-width:720px)").matches) {
        closeDrawer();
    }
}

function toast(message, state = "info") {
    let node = q("#lf-tools-toast");

    if (!node) {
        node = document.createElement("div");
        node.id = "lf-tools-toast";
        document.body.appendChild(node);
    }

    node.dataset.state = state;
    node.textContent = message;
    node.classList.add("show");

    clearTimeout(node.__timer);

    node.__timer = setTimeout(() => {
        node.classList.remove("show");
    }, 2200);
}

function createDrawer() {
    drawer = document.createElement("div");
    drawer.id = "lf-advanced-drawer";
    drawer.setAttribute("aria-hidden", "true");

    drawer.innerHTML = `
        <div class="lf-tools-scrim"></div>

        <section class="lf-tools-sheet" aria-label="LocalForge Advanced Tools">
            <header class="lf-tools-head">
                <div class="lf-tools-titlebar">
                    <strong>Advanced Tools</strong>
                    <span class="lf-tools-count" id="lf-tools-count"></span>
                    <button class="lf-tools-close" type="button" aria-label="Close">×</button>
                </div>

                <input
                    class="lf-tools-search"
                    id="lf-tools-search"
                    type="search"
                    placeholder="Search brushes, sculpt tools, nodes…"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                >

                <div class="lf-tools-tabs">
                    <button type="button" class="lf-tools-tab active" data-section="brushes">Brushes</button>
                    <button type="button" class="lf-tools-tab" data-section="sculpt">Sculpt Tools</button>
                    <button type="button" class="lf-tools-tab" data-section="nodes">Nodes</button>
                    <button type="button" class="lf-tools-tab" data-section="stacks">Node Stacks</button>
                </div>

                <div class="lf-tools-categories" id="lf-tools-categories"></div>
            </header>

            <div class="lf-tools-content" id="lf-tools-content"></div>
        </section>
    `;

    document.body.appendChild(drawer);

    content = q("#lf-tools-content", drawer);
    searchInput = q("#lf-tools-search", drawer);

    q(".lf-tools-scrim", drawer)?.addEventListener("click", closeDrawer);
    q(".lf-tools-close", drawer)?.addEventListener("click", closeDrawer);

    qa(".lf-tools-tab", drawer).forEach(button => {
        button.addEventListener("click", () => {
            setSection(button.dataset.section);
        });
    });

    searchInput?.addEventListener("input", () => {
        page = 1;
        renderItems();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && drawer?.classList.contains("open")) {
            closeDrawer();
        }
    });

    setSection("brushes");
}

function createLauncher() {
    launcher = document.createElement("button");
    launcher.id = "lf-advanced-launcher";
    launcher.type = "button";
    launcher.textContent = "Tools+";
    launcher.setAttribute(
        "aria-label",
        `Open ${BRUSHES.length + SCULPT_TOOLS.length + NODE_PRESETS.length + STACKS.length} advanced LocalForge tools`
    );

    launcher.addEventListener("click", openDrawer);

    document.body.appendChild(launcher);
}


/* =========================================================
   PUBLIC API
========================================================= */

export function initializeAdvancedTools() {
    if (initialized) return;

    initialized = true;

    installStyles();
    createDrawer();
    createLauncher();

    window.LocalForgeAdvancedTools = {
        version: LF_ADVANCED_VERSION,
        brushes: BRUSHES,
        sculptTools: SCULPT_TOOLS,
        nodes: NODE_PRESETS,
        stacks: STACKS,
        open: openDrawer,
        close: closeDrawer,
        applyBrush,
        applyNodePreset,
        applyStack,
        counts: {
            brushes: BRUSHES.length,
            sculptTools: SCULPT_TOOLS.length,
            nodes: NODE_PRESETS.length,
            stacks: STACKS.length,
            total: BRUSHES.length + SCULPT_TOOLS.length + NODE_PRESETS.length + STACKS.length
        }
    };

    console.log(
        "[LocalForge Advanced Tools] Ready:",
        window.LocalForgeAdvancedTools.counts
    );
}


/* =========================================================
   AUTO START
========================================================= */

if (window.__LOCALFORGE_READY__) {
    initializeAdvancedTools();
} else {
    window.addEventListener(
        "localforge:ready",
        initializeAdvancedTools,
        { once: true }
    );
}
