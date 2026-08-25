/* =========================================================
   LocalForge 3D
   app.js
   Browser modeling / sculpting runtime
   ========================================================= */

(() => {
"use strict";

/* ---------------------------------------------------------
   Prevent duplicate startup
--------------------------------------------------------- */

if (window.__LOCALFORGE_APP_STARTED__) {
    console.warn("[LocalForge] app.js already started.");
    return;
}

window.__LOCALFORGE_APP_STARTED__ = true;


/* ---------------------------------------------------------
   DOM
--------------------------------------------------------- */

const R = document.getElementById("forge3d");

if (!R) {
    console.error("[LocalForge] #forge3d was not found.");
    return;
}

const left = R.querySelector("#f-left");
const right = R.querySelector("#f-right");
const status = R.querySelector("#f-status");
const view = R.querySelector("#f-view");
const overlay = R.querySelector("#f-overlay");

const engineState = document.getElementById("f-engine-state");
const engineDot = document.getElementById("f-engine-dot");
const shellScene = document.getElementById("f-shell-scene");
const shellMessage = document.getElementById("f-shell-message");

if (!left || !right || !status || !view) {
    console.error("[LocalForge] Required editor DOM elements are missing.");
    return;
}


/* ---------------------------------------------------------
   Engine globals
--------------------------------------------------------- */

let THREE = null;
let OrbitControls = null;
let TransformControls = null;
let mergeVertices = null;

let scene = null;
let camera = null;
let renderer = null;
let orbit = null;
let gizmo = null;
let gizmoHelper = null;

let mesh = null;
let faceMark = null;
let brushCursor = null;

let resizeObserver = null;
let animationFrame = 0;


/* ---------------------------------------------------------
   Editor state
--------------------------------------------------------- */

let workspace = "object";
let gizmoMode = "translate";
let space = "world";

let wire = false;

let selectedFace = -1;
let nodeSelected = "transform";

let baseGeometry = null;

let history = [];
let hist = -1;

let idN = 1;

let strokeDirty = false;
let sculpting = false;

let lastPointer = null;
let lastBrushPoint = null;

let adjacency = null;

let engineReady = false;


/* ---------------------------------------------------------
   Brush
--------------------------------------------------------- */

let brush = {
    type: "Draw",
    radius: 0.65,
    strength: 0.18,
    falloff: "Smooth",

    symX: false,
    symY: false,
    symZ: false,

    spacing: 0.12
};

let presets = [
    {
        name: "Clay Soft",
        type: "Clay",
        radius: 0.8,
        strength: 0.12,
        falloff: "Smooth",
        symX: false,
        symY: false,
        symZ: false,
        spacing: 0.12
    },
    {
        name: "Crease Fine",
        type: "Crease",
        radius: 0.32,
        strength: 0.14,
        falloff: "Sharp",
        symX: false,
        symY: false,
        symZ: false,
        spacing: 0.08
    }
];


/* ---------------------------------------------------------
   Node stack
--------------------------------------------------------- */

const nodes = [
    {
        id: "source",
        type: "source",
        enabled: true,

        p: {
            shape: "Box",
            custom: false,

            sizeX: 2,
            sizeY: 2,
            sizeZ: 2,

            radius: 1.25,
            height: 2.5,

            segments: 28
        }
    },

    {
        id: "transform",
        type: "transform",
        enabled: true,

        p: {
            px: 0,
            py: 1,
            pz: 0,

            rx: 0,
            ry: 0,
            rz: 0,

            sx: 1,
            sy: 1,
            sz: 1
        }
    },

    {
        id: "material",
        type: "material",
        enabled: true,

        p: {
            color: "#b9c9dc",
            roughness: 0.38,
            metalness: 0.06
        }
    },

    {
        id: "output",
        type: "output",
        enabled: true,
        p: {}
    }
];


const deformation = new Set([
    "twist",
    "bend",
    "taper",
    "noise",
    "spherize",
    "flatten"
]);


const D = {

    twist: {
        amount: 90,
        axis: "y"
    },

    bend: {
        amount: 45,
        axis: "x"
    },

    taper: {
        factor: 0.45,
        axis: "y"
    },

    noise: {
        strength: 0.18,
        frequency: 2.2,
        seed: 1
    },

    spherize: {
        factor: 0.5
    },

    flatten: {
        axis: "y",
        amount: 0
    }
};


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(message) {

    if (status) {
        status.textContent = message;
    }

    console.log("[LocalForge]", message);
}


function setStartupStatus(message) {

    setStatus(message);

    if (shellMessage) {
        shellMessage.textContent = message;
    }

    if (engineState) {
        engineState.textContent = message;
    }
}


function setEngineReady() {

    engineReady = true;

    R.dataset.forgeState = "ready";
    R.classList.add("forge-ready");

    document.documentElement.classList.add("forge-ready");

    if (shellScene) {
        shellScene.style.opacity = "0";
        shellScene.style.visibility = "hidden";
        shellScene.style.pointerEvents = "none";
    }

    if (engineState) {
        engineState.textContent = "Ready";
    }

    if (engineDot) {
        engineDot.dataset.state = "ready";
    }

    window.__LOCALFORGE_READY__ = true;

    window.dispatchEvent(
        new CustomEvent("localforge:ready")
    );
}


function startupFailure(error) {

    console.error("[LocalForge] Startup failure:", error);

    engineReady = false;

    R.dataset.forgeState = "error";

    if (engineState) {
        engineState.textContent = "Engine Error";
    }

    if (engineDot) {
        engineDot.dataset.state = "error";
    }

    const message =
        error && error.message
            ? error.message
            : String(error);

    setStatus(
        "LocalForge engine error: " + message
    );

    if (shellMessage) {
        shellMessage.textContent =
            "Engine failed to start. " + message;
    }

    window.__LOCALFORGE_ERROR__ = error;

    window.dispatchEvent(
        new CustomEvent("localforge:error", {
            detail: {
                error
            }
        })
    );
}


/* =========================================================
   NODE HELPERS
   ========================================================= */

function cloneNodes() {
    return JSON.parse(JSON.stringify(nodes));
}


function sourceNode() {
    return nodes.find(n => n.type === "source");
}


function transformNode() {
    return nodes.find(n => n.type === "transform");
}


function materialNode() {
    return nodes.find(n => n.type === "material");
}


/* =========================================================
   HISTORY
   ========================================================= */

function snapGeom(g) {

    return {
        p: Array.from(g.attributes.position.array),

        i: g.index
            ? Array.from(g.index.array)
            : null
    };
}


function fromSnap(s) {

    const g = new THREE.BufferGeometry();

    g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(s.p, 3)
    );

    if (s.i) {
        g.setIndex(s.i);
    }

    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();

    return g;
}


function snapshot() {

    return {
        g: snapGeom(baseGeometry),
        n: cloneNodes()
    };
}


function pushHistory() {

    if (!baseGeometry) return;

    history = history.slice(0, hist + 1);

    history.push(snapshot());

    if (history.length > 24) {
        history.shift();
    }

    hist = history.length - 1;

    undoState();
}


function undoState() {

    const undo = R.querySelector("#f-undo");
    const redo = R.querySelector("#f-redo");

    if (undo) {
        undo.disabled = hist <= 0;
    }

    if (redo) {
        redo.disabled =
            hist >= history.length - 1;
    }
}


function restore(idx) {

    if (!engineReady) return;

    if (
        idx < 0 ||
        idx >= history.length
    ) {
        return;
    }

    hist = idx;

    if (baseGeometry) {
        baseGeometry.dispose();
    }

    baseGeometry =
        fromSnap(history[idx].g);

    nodes.splice(
        0,
        nodes.length,
        ...JSON.parse(
            JSON.stringify(
                history[idx].n
            )
        )
    );

    selectedFace = -1;

    evaluate();
    renderWorkspace();
    undoState();
}


/* =========================================================
   PRIMITIVES
   ========================================================= */

function makeSource(shape) {

    if (!engineReady) return;

    const source = sourceNode().p;

    source.shape = shape;
    source.custom = false;

    let g;

    switch (shape) {

        case "Sphere":

            g = new THREE.SphereGeometry(
                source.radius,
                Math.max(
                    8,
                    Math.round(source.segments)
                ),
                Math.max(
                    6,
                    Math.round(
                        source.segments * 0.65
                    )
                )
            );

            break;


        case "Cylinder":

            g = new THREE.CylinderGeometry(
                source.radius,
                source.radius,
                source.height,
                Math.max(
                    6,
                    Math.round(source.segments)
                ),
                Math.max(
                    2,
                    Math.round(
                        source.segments / 4
                    )
                )
            );

            break;


        case "Torus":

            g = new THREE.TorusGeometry(
                source.radius,
                0.4,
                Math.max(
                    8,
                    Math.round(
                        source.segments / 2
                    )
                ),
                Math.max(
                    12,
                    Math.round(
                        source.segments * 2
                    )
                )
            );

            break;


        case "Box":
        default:

            const seg =
                Math.max(
                    1,
                    Math.round(
                        source.segments / 5
                    )
                );

            g = new THREE.BoxGeometry(
                source.sizeX,
                source.sizeY,
                source.sizeZ,
                seg,
                seg,
                seg
            );

            break;
    }

    if (baseGeometry) {
        baseGeometry.dispose();
    }

    baseGeometry =
        mergeVertices(
            g.toNonIndexed(),
            1e-5
        );

    g.dispose();

    baseGeometry.computeVertexNormals();
    baseGeometry.computeBoundingBox();
    baseGeometry.computeBoundingSphere();

    selectedFace = -1;

    evaluate();
    pushHistory();
    renderWorkspace();
}


/* =========================================================
   GEOMETRY HELPERS
   ========================================================= */

function bounds(g) {

    g.computeBoundingBox();

    const b = g.boundingBox;

    return {
        min: b.min.clone(),
        max: b.max.clone(),

        size:
            new THREE.Vector3()
                .subVectors(
                    b.max,
                    b.min
                ),

        center:
            new THREE.Vector3()
                .addVectors(
                    b.min,
                    b.max
                )
                .multiplyScalar(0.5)
    };
}


function av(v, axis) {

    if (axis === "x") return v.x;
    if (axis === "y") return v.y;

    return v.z;
}


function sv(v, axis, value) {

    if (axis === "x") {
        v.x = value;
    }
    else if (axis === "y") {
        v.y = value;
    }
    else {
        v.z = value;
    }
}


/* =========================================================
   MODIFIERS
   ========================================================= */

function deform(g, n) {

    const pos = g.attributes.position;
    const p = n.p;

    const b = bounds(g);

    const v = new THREE.Vector3();

    g.computeVertexNormals();

    const nor = g.attributes.normal;


    for (
        let i = 0;
        i < pos.count;
        i++
    ) {

        v.fromBufferAttribute(
            pos,
            i
        );


        if (n.type === "twist") {

            const h =
                Math.max(
                    0.0001,
                    av(b.size, p.axis)
                );

            const t =
                (
                    av(v, p.axis) -
                    av(b.min, p.axis)
                ) / h - 0.5;

            const angle =
                THREE.MathUtils.degToRad(
                    p.amount
                ) * t;

            const c =
                Math.cos(angle);

            const s =
                Math.sin(angle);


            if (p.axis === "y") {

                const x = v.x;
                const z = v.z;

                v.x = x * c - z * s;
                v.z = x * s + z * c;
            }

            else if (p.axis === "x") {

                const y = v.y;
                const z = v.z;

                v.y = y * c - z * s;
                v.z = y * s + z * c;
            }

            else {

                const x = v.x;
                const y = v.y;

                v.x = x * c - y * s;
                v.y = x * s + y * c;
            }
        }


        else if (n.type === "bend") {

            const h =
                Math.max(
                    0.0001,
                    av(b.size, p.axis)
                );

            const k =
                THREE.MathUtils.degToRad(
                    p.amount
                ) / h;


            if (Math.abs(k) > 0.000001) {

                if (p.axis === "x") {

                    const q =
                        v.x - b.center.x;

                    const r =
                        1 / k + v.y;

                    v.x =
                        Math.sin(k * q) * r +
                        b.center.x;

                    v.y =
                        Math.cos(k * q) * r -
                        1 / k;
                }

                else if (p.axis === "y") {

                    const q =
                        v.y - b.center.y;

                    const r =
                        1 / k + v.z;

                    v.y =
                        Math.sin(k * q) * r +
                        b.center.y;

                    v.z =
                        Math.cos(k * q) * r -
                        1 / k;
                }

                else {

                    const q =
                        v.z - b.center.z;

                    const r =
                        1 / k + v.x;

                    v.z =
                        Math.sin(k * q) * r +
                        b.center.z;

                    v.x =
                        Math.cos(k * q) * r -
                        1 / k;
                }
            }
        }


        else if (n.type === "taper") {

            const h =
                Math.max(
                    0.0001,
                    av(b.size, p.axis)
                );

            const t =
                (
                    av(v, p.axis) -
                    av(b.min, p.axis)
                ) / h - 0.5;

            const factor =
                Math.max(
                    0.02,
                    1 + p.factor * t
                );


            if (p.axis === "y") {

                v.x *= factor;
                v.z *= factor;
            }

            else if (p.axis === "x") {

                v.y *= factor;
                v.z *= factor;
            }

            else {

                v.x *= factor;
                v.y *= factor;
            }
        }


        else if (n.type === "noise") {

            const q =
                Math.sin(
                    (v.x + p.seed * 0.13) *
                    p.frequency
                ) *
                Math.cos(
                    (v.y + p.seed * 0.27) *
                    p.frequency
                ) *
                Math.sin(
                    (v.z + p.seed * 0.41) *
                    p.frequency
                );

            v.x +=
                nor.getX(i) *
                q *
                p.strength;

            v.y +=
                nor.getY(i) *
                q *
                p.strength;

            v.z +=
                nor.getZ(i) *
                q *
                p.strength;
        }


        else if (n.type === "spherize") {

            const radius =
                (
                    b.size.x +
                    b.size.y +
                    b.size.z
                ) / 6;

            const target =
                v.clone()
                    .sub(b.center);

            if (
                target.lengthSq() >
                0.000001
            ) {

                target
                    .normalize()
                    .multiplyScalar(radius)
                    .add(b.center);
            }

            v.lerp(
                target,
                p.factor
            );
        }


        else if (n.type === "flatten") {

            sv(
                v,
                p.axis,
                THREE.MathUtils.lerp(
                    av(v, p.axis),
                    p.amount,
                    0.8
                )
            );
        }


        pos.setXYZ(
            i,
            v.x,
            v.y,
            v.z
        );
    }


    pos.needsUpdate = true;

    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();

    return g;
}


/* =========================================================
   EVALUATION
   ========================================================= */

function evaluate() {

    if (
        !baseGeometry ||
        !THREE ||
        !scene
    ) {
        return;
    }


    let g =
        baseGeometry.clone();


    for (const n of nodes) {

        if (
            n.enabled &&
            deformation.has(n.type)
        ) {
            g = deform(g, n);
        }
    }


    if (!mesh) {

        mesh =
            new THREE.Mesh(
                g,
                new THREE.MeshStandardMaterial({
                    color: 0xb9c9dc,
                    roughness: 0.38,
                    metalness: 0.06
                })
            );

        mesh.name =
            "LocalForgeObject";

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
    }

    else {

        mesh.geometry.dispose();
        mesh.geometry = g;
    }


    const material =
        materialNode().p;

    mesh.material.color.set(
        material.color
    );

    mesh.material.roughness =
        material.roughness;

    mesh.material.metalness =
        material.metalness;

    mesh.material.wireframe =
        wire;


    const t =
        transformNode().p;


    mesh.position.set(
        t.px,
        t.py,
        t.pz
    );


    mesh.rotation.set(

        THREE.MathUtils.degToRad(
            t.rx
        ),

        THREE.MathUtils.degToRad(
            t.ry
        ),

        THREE.MathUtils.degToRad(
            t.rz
        )
    );


    mesh.scale.set(
        t.sx,
        t.sy,
        t.sz
    );


    mesh.updateMatrixWorld(true);


    if (gizmo) {
        gizmo.attach(mesh);
    }


    updateFaceMark();
    updateStatus();
}


/* =========================================================
   BAKE
   ========================================================= */

function bakeModifiers() {

    if (
        !mesh ||
        !baseGeometry
    ) {
        return;
    }


    const modifiers =
        nodes.filter(
            n =>
                deformation.has(n.type)
        );


    if (!modifiers.length) {
        return;
    }


    baseGeometry.dispose();

    baseGeometry =
        mesh.geometry.clone();


    for (
        let i = nodes.length - 1;
        i >= 0;
        i--
    ) {

        if (
            deformation.has(
                nodes[i].type
            )
        ) {
            nodes.splice(i, 1);
        }
    }


    sourceNode().p.custom = true;
    sourceNode().p.shape = "Custom";

    evaluate();
    pushHistory();
}


/* =========================================================
   STATUS
   ========================================================= */

function updateStatus() {

    if (!baseGeometry) return;


    const vertexCount =
        baseGeometry
            .attributes
            .position
            .count;


    const triangleCount =
        baseGeometry.index
            ? baseGeometry.index.count / 3
            : vertexCount / 3;


    const modifiers =
        nodes.filter(
            n =>
                deformation.has(n.type) &&
                n.enabled
        ).length;


    status.textContent =
        `${workspace.charAt(0).toUpperCase() + workspace.slice(1)} mode · ` +
        `${Math.round(vertexCount).toLocaleString()} vertices · ` +
        `${Math.round(triangleCount).toLocaleString()} triangles · ` +
        `${modifiers} live modifier nodes`;
}


/* =========================================================
   WORKSPACES
   ========================================================= */

function setWorkspace(w) {

    if (!engineReady) {
        setStatus(
            "Engine is still starting…"
        );
        return;
    }


    workspace = w;


    R.querySelectorAll(
        "[data-work]"
    ).forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.work === w
        );
    });


    selectedFace = -1;
    sculpting = false;


    if (orbit) {
        orbit.enabled = true;
    }


    if (brushCursor) {
        brushCursor.visible = false;
    }


    if (gizmo) {

        gizmo.visible =
            w === "object" ||
            w === "nodes";

        gizmo.enabled =
            gizmo.visible;
    }


    if (overlay) {

        if (w === "sculpt") {

            overlay.textContent =
                "Sculpt: drag directly on mesh · orbit using empty space · symmetry uses object-local axes";
        }

        else if (w === "edit") {

            overlay.textContent =
                "Edit: tap a triangle face to select it · use mesh operations in the left panel";
        }

        else {

            overlay.textContent =
                "Orbit: one finger / mouse drag · Zoom/pan: two fingers";
        }
    }


    renderWorkspace();
    updateStatus();
}


/* =========================================================
   UI HELPERS
   ========================================================= */

function btns(items) {

    return `
        <div class="f-tools">
            ${items.map(
                ([id, label]) =>
                    `<button
                        type="button"
                        class="f-tool"
                        data-tool="${id}"
                    >${label}</button>`
            ).join("")}
        </div>
    `;
}


function num(
    label,
    key,
    val,
    min,
    max,
    step = 0.1
) {

    return `
        <div class="f-field">
            <label>${label}</label>

            <input
                type="number"
                data-val="${key}"
                value="${val}"
                min="${min}"
                max="${max}"
                step="${step}"
                inputmode="decimal"
            >
        </div>
    `;
}


function range(
    label,
    key,
    val,
    min,
    max,
    step = 0.01
) {

    return `
        <div class="f-field">

            <label>${label}</label>

            <div class="f-range-row">

                <input
                    type="range"
                    data-range="${key}"
                    value="${val}"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                >

                <input
                    type="number"
                    data-val="${key}"
                    value="${val}"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                >

            </div>
        </div>
    `;
}


function bindValues(
    container,
    obj,
    callback
) {

    container
        .querySelectorAll(
            "[data-val]"
        )
        .forEach(el => {

            el.addEventListener(
                "change",
                () => {

                    let value =
                        Number(el.value);

                    if (
                        !Number.isFinite(value)
                    ) {
                        return;
                    }


                    const min =
                        Number(el.min);

                    const max =
                        Number(el.max);


                    if (
                        Number.isFinite(min)
                    ) {
                        value =
                            Math.max(
                                min,
                                value
                            );
                    }


                    if (
                        Number.isFinite(max)
                    ) {
                        value =
                            Math.min(
                                max,
                                value
                            );
                    }


                    el.value =
                        String(value);

                    obj[
                        el.dataset.val
                    ] = value;


                    callback?.(
                        true,
                        el.dataset.val
                    );
                }
            );
        });


    container
        .querySelectorAll(
            "[data-range]"
        )
        .forEach(el => {

            el.addEventListener(
                "input",
                () => {

                    const value =
                        Number(el.value);


                    obj[
                        el.dataset.range
                    ] = value;


                    const number =
                        container.querySelector(
                            `[data-val="${el.dataset.range}"]`
                        );


                    if (number) {
                        number.value =
                            String(value);
                    }


                    callback?.(
                        false,
                        el.dataset.range
                    );
                }
            );
        });
}


/* =========================================================
   WORKSPACE RENDER
   ========================================================= */

function renderWorkspace() {

    const leftTitle =
        R.querySelector(
            "#f-left-title"
        );

    const rightTitle =
        R.querySelector(
            "#f-right-title"
        );


    if (leftTitle) {

        leftTitle.textContent =
            workspace === "object"
                ? "Object Tools"

                : workspace === "edit"
                    ? "Manual Modeling"

                    : workspace === "sculpt"
                        ? "Sculpt Brushes"

                        : "Node Stack";
    }


    if (rightTitle) {

        rightTitle.textContent =
            workspace === "object"
                ? "Object Properties"

                : workspace === "edit"
                    ? "Mesh Operations"

                    : workspace === "sculpt"
                        ? "Brush Properties"

                        : "Node Inspector";
    }


    if (workspace === "object") {
        renderObject();
    }

    else if (workspace === "edit") {
        renderEdit();
    }

    else if (workspace === "sculpt") {
        renderSculpt();
    }

    else {
        renderNodes();
    }
}


/* =========================================================
   OBJECT MODE
   ========================================================= */

function renderObject() {

    const t =
        transformNode().p;

    const m =
        materialNode().p;


    left.innerHTML = `

        <div class="f-label">
            Primitive
        </div>

        ${btns([
            ["Box", "Box"],
            ["Sphere", "Sphere"],
            ["Cylinder", "Cylinder"],
            ["Torus", "Torus"]
        ])}

        <div class="f-divider"></div>

        <div class="f-label">
            Object
        </div>

        ${btns([
            [
                "ResetTransform",
                "Reset Transform"
            ],
            [
                "CenterOrigin",
                "Center Geometry"
            ]
        ])}
    `;


    right.innerHTML = `

        <div class="f-label">
            Position
        </div>

        <div class="f-grid3">

            ${num(
                "X",
                "px",
                t.px,
                -100,
                100
            )}

            ${num(
                "Y",
                "py",
                t.py,
                -100,
                100
            )}

            ${num(
                "Z",
                "pz",
                t.pz,
                -100,
                100
            )}

        </div>


        <div class="f-label">
            Rotation °
        </div>

        <div class="f-grid3">

            ${num(
                "X",
                "rx",
                t.rx,
                -3600,
                3600,
                1
            )}

            ${num(
                "Y",
                "ry",
                t.ry,
                -3600,
                3600,
                1
            )}

            ${num(
                "Z",
                "rz",
                t.rz,
                -3600,
                3600,
                1
            )}

        </div>


        <div class="f-label">
            Scale
        </div>

        <div class="f-grid3">

            ${num(
                "X",
                "sx",
                t.sx,
                0.01,
                100
            )}

            ${num(
                "Y",
                "sy",
                t.sy,
                0.01,
                100
            )}

            ${num(
                "Z",
                "sz",
                t.sz,
                0.01,
                100
            )}

        </div>


        <div class="f-divider"></div>


        <div class="f-field">

            <label>
                Material Color
            </label>

            <input
                class="f-color"
                id="f-color"
                type="color"
                value="${m.color}"
            >

        </div>


        ${range(
            "Roughness",
            "roughness",
            m.roughness,
            0,
            1
        )}


        ${range(
            "Metalness",
            "metalness",
            m.metalness,
            0,
            1
        )}
    `;


    left
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const tool =
                        button.dataset.tool;


                    if (
                        [
                            "Box",
                            "Sphere",
                            "Cylinder",
                            "Torus"
                        ].includes(tool)
                    ) {

                        makeSource(tool);
                    }


                    else if (
                        tool ===
                        "ResetTransform"
                    ) {

                        Object.assign(
                            t,
                            {
                                px: 0,
                                py: 1,
                                pz: 0,

                                rx: 0,
                                ry: 0,
                                rz: 0,

                                sx: 1,
                                sy: 1,
                                sz: 1
                            }
                        );

                        evaluate();
                        pushHistory();
                        renderObject();
                    }


                    else if (
                        tool ===
                        "CenterOrigin"
                    ) {

                        bakeModifiers();

                        baseGeometry
                            .computeBoundingBox();

                        const center =
                            baseGeometry
                                .boundingBox
                                .getCenter(
                                    new THREE.Vector3()
                                );


                        baseGeometry.translate(
                            -center.x,
                            -center.y,
                            -center.z
                        );


                        evaluate();
                        pushHistory();
                    }
                }
            );
        });


    bindValues(
        right,
        t,
        () => {
            evaluate();
        }
    );


    right
        .querySelectorAll(
            '[data-val="px"],' +
            '[data-val="py"],' +
            '[data-val="pz"],' +
            '[data-val="rx"],' +
            '[data-val="ry"],' +
            '[data-val="rz"],' +
            '[data-val="sx"],' +
            '[data-val="sy"],' +
            '[data-val="sz"]'
        )
        .forEach(input => {

            input.addEventListener(
                "change",
                pushHistory
            );
        });


    bindValues(
        right,
        m,
        () => {
            evaluate();
        }
    );


    const color =
        right.querySelector(
            "#f-color"
        );


    if (color) {

        color.addEventListener(
            "input",
            () => {

                m.color =
                    color.value;

                evaluate();
            }
        );


        color.addEventListener(
            "change",
            pushHistory
        );
    }
}


/* =========================================================
   EDIT MODE
   ========================================================= */

function renderEdit() {

    left.innerHTML = `

        <div class="f-label">
            Selected Face
        </div>

        ${btns([
            ["Extrude", "Extrude"],
            ["Inset", "Inset"],
            ["Bevel", "Bevel"],
            ["DeleteFace", "Delete Face"],
            ["FlipFace", "Flip Normal"]
        ])}


        <div class="f-divider"></div>


        <div class="f-label">
            Whole Mesh
        </div>

        ${btns([
            ["Subdivide", "Subdivide"],
            ["Smooth", "Smooth"],
            ["Weld", "Weld"],
            ["MirrorX", "Mirror X"],
            ["Recalc", "Recalc Normals"],
            ["Bake", "Bake Nodes"]
        ])}
    `;


    right.innerHTML = `

        <div class="f-help">
            Tap a visible triangle in the viewport.
            Extrude, inset and bevel operate on
            the selected face.
        </div>

        <div class="f-divider"></div>

        ${num(
            "Extrude Distance",
            "extrude",
            0.35,
            -10,
            10,
            0.05
        )}

        ${num(
            "Inset Amount",
            "inset",
            0.18,
            0.01,
            0.9,
            0.01
        )}

        ${num(
            "Bevel Amount",
            "bevel",
            0.12,
            -3,
            3,
            0.01
        )}

        ${num(
            "Smooth Strength",
            "smooth",
            0.35,
            0,
            1,
            0.05
        )}

        ${num(
            "Weld Tolerance",
            "weld",
            0.0001,
            0.000001,
            0.1,
            0.0001
        )}

        <div
            class="f-msg"
            id="f-editmsg"
        >
            ${
                selectedFace >= 0
                    ? "Face " +
                      selectedFace +
                      " selected."
                    : "No face selected."
            }
        </div>
    `;


    const vals = {
        extrude: 0.35,
        inset: 0.18,
        bevel: 0.12,
        smooth: 0.35,
        weld: 0.0001
    };


    right
        .querySelectorAll(
            "[data-val]"
        )
        .forEach(el => {

            vals[
                el.dataset.val
            ] = Number(el.value);


            el.addEventListener(
                "change",
                () => {

                    vals[
                        el.dataset.val
                    ] = Number(
                        el.value
                    );
                }
            );
        });


    left
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    editTool(
                        button.dataset.tool,
                        vals
                    );
                }
            );
        });
}


/* =========================================================
   MESH EDITING
   ========================================================= */

function indicesOf(g) {

    if (g.index) {
        return Array.from(
            g.index.array
        );
    }


    return Array.from(
        {
            length:
                g.attributes
                    .position
                    .count
        },

        (_, i) => i
    );
}


function faceIndices(
    g,
    faceIndex
) {

    const idx =
        indicesOf(g);

    const offset =
        faceIndex * 3;


    if (
        offset + 2 >=
        idx.length
    ) {
        return null;
    }


    return [
        idx[offset],
        idx[offset + 1],
        idx[offset + 2]
    ];
}


function editTool(
    tool,
    values
) {

    if (tool === "Bake") {

        bakeModifiers();
        renderWorkspace();

        return;
    }


    bakeModifiers();


    if (
        [
            "Extrude",
            "Inset",
            "Bevel",
            "DeleteFace",
            "FlipFace"
        ].includes(tool) &&
        selectedFace < 0
    ) {

        const msg =
            right.querySelector(
                "#f-editmsg"
            );

        if (msg) {
            msg.textContent =
                "Select a face first.";
        }

        return;
    }


    if (tool === "Subdivide") {

        subdivide();
    }

    else if (tool === "Smooth") {

        smoothAll(
            values.smooth
        );
    }

    else if (tool === "Weld") {

        weld(
            values.weld
        );
    }

    else if (tool === "MirrorX") {

        mirrorX();
    }

    else if (tool === "Recalc") {

        baseGeometry
            .computeVertexNormals();
    }

    else {

        faceOperation(
            tool,
            values
        );
    }


    sourceNode().p.custom = true;
    sourceNode().p.shape = "Custom";

    selectedFace = -1;

    evaluate();
    pushHistory();
    renderWorkspace();
}


function faceOperation(
    tool,
    values
) {

    const g =
        baseGeometry;

    const idx =
        indicesOf(g);

    const f =
        faceIndices(
            g,
            selectedFace
        );


    if (!f) return;


    const pos =
        Array.from(
            g.attributes
                .position
                .array
        );


    const A =
        new THREE.Vector3()
            .fromArray(
                pos,
                f[0] * 3
            );


    const B =
        new THREE.Vector3()
            .fromArray(
                pos,
                f[1] * 3
            );


    const C =
        new THREE.Vector3()
            .fromArray(
                pos,
                f[2] * 3
            );


    const center =
        A.clone()
            .add(B)
            .add(C)
            .multiplyScalar(
                1 / 3
            );


    const normal =
        B.clone()
            .sub(A)
            .cross(
                C.clone()
                    .sub(A)
            )
            .normalize();


    if (
        tool ===
        "DeleteFace"
    ) {

        idx.splice(
            selectedFace * 3,
            3
        );
    }


    else if (
        tool ===
        "FlipFace"
    ) {

        const o =
            selectedFace * 3;

        [
            idx[o + 1],
            idx[o + 2]
        ] = [
            idx[o + 2],
            idx[o + 1]
        ];
    }


    else {

        idx.splice(
            selectedFace * 3,
            3
        );


        let a = A.clone();
        let b = B.clone();
        let c = C.clone();


        if (
            tool ===
            "Extrude"
        ) {

            a.addScaledVector(
                normal,
                values.extrude
            );

            b.addScaledVector(
                normal,
                values.extrude
            );

            c.addScaledVector(
                normal,
                values.extrude
            );
        }


        else {

            const amount =
                tool === "Inset"

                    ? values.inset

                    : Math.min(
                        0.9,
                        Math.abs(
                            values.bevel
                        ) * 0.7 +
                        0.08
                    );


            a.lerp(
                center,
                amount
            );

            b.lerp(
                center,
                amount
            );

            c.lerp(
                center,
                amount
            );


            if (
                tool ===
                "Bevel"
            ) {

                a.addScaledVector(
                    normal,
                    values.bevel
                );

                b.addScaledVector(
                    normal,
                    values.bevel
                );

                c.addScaledVector(
                    normal,
                    values.bevel
                );
            }
        }


        const n0 =
            pos.length / 3;


        pos.push(
            a.x, a.y, a.z,
            b.x, b.y, b.z,
            c.x, c.y, c.z
        );


        idx.push(
            n0,
            n0 + 1,
            n0 + 2,

            f[0],
            f[1],
            n0 + 1,

            f[0],
            n0 + 1,
            n0,

            f[1],
            f[2],
            n0 + 2,

            f[1],
            n0 + 2,
            n0 + 1,

            f[2],
            f[0],
            n0,

            f[2],
            n0,
            n0 + 2
        );
    }


    const ng =
        new THREE.BufferGeometry();


    ng.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            pos,
            3
        )
    );


    ng.setIndex(idx);

    ng.computeVertexNormals();
    ng.computeBoundingBox();
    ng.computeBoundingSphere();


    baseGeometry.dispose();

    baseGeometry = ng;
}


function subdivide() {

    const g =
        baseGeometry;

    const pos =
        Array.from(
            g.attributes
                .position
                .array
        );

    const idx =
        indicesOf(g);


    if (
        idx.length / 3 >
        40000
    ) {

        alertMsg(
            "Subdivision limit reached for mobile performance."
        );

        return;
    }


    const edge =
        new Map();


    const midpoint =
        (a, b) => {

            const lo =
                Math.min(a, b);

            const hi =
                Math.max(a, b);

            const key =
                lo + "_" + hi;


            if (
                edge.has(key)
            ) {
                return edge.get(
                    key
                );
            }


            const i =
                pos.length / 3;


            pos.push(

                (
                    pos[a * 3] +
                    pos[b * 3]
                ) / 2,

                (
                    pos[a * 3 + 1] +
                    pos[b * 3 + 1]
                ) / 2,

                (
                    pos[a * 3 + 2] +
                    pos[b * 3 + 2]
                ) / 2
            );


            edge.set(
                key,
                i
            );


            return i;
        };


    const out = [];


    for (
        let i = 0;
        i < idx.length;
        i += 3
    ) {

        const a = idx[i];
        const b = idx[i + 1];
        const c = idx[i + 2];

        const ab =
            midpoint(a, b);

        const bc =
            midpoint(b, c);

        const ca =
            midpoint(c, a);


        out.push(
            a, ab, ca,
            ab, b, bc,
            ca, bc, c,
            ab, bc, ca
        );
    }


    const ng =
        new THREE.BufferGeometry();


    ng.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            pos,
            3
        )
    );


    ng.setIndex(out);

    ng.computeVertexNormals();
    ng.computeBoundingBox();
    ng.computeBoundingSphere();


    baseGeometry.dispose();

    baseGeometry = ng;
}


function adjacencyFor(g) {

    const count =
        g.attributes
            .position
            .count;


    const result =
        Array.from(
            { length: count },
            () => new Set()
        );


    const idx =
        indicesOf(g);


    for (
        let i = 0;
        i < idx.length;
        i += 3
    ) {

        const x = idx[i];
        const y = idx[i + 1];
        const z = idx[i + 2];


        result[x].add(y);
        result[x].add(z);

        result[y].add(x);
        result[y].add(z);

        result[z].add(x);
        result[z].add(y);
    }


    return result;
}


function smoothAll(
    strength = 0.35
) {

    const p =
        baseGeometry
            .attributes
            .position;


    const adjacency =
        adjacencyFor(
            baseGeometry
        );


    const old =
        Array.from(
            p.array
        );


    for (
        let i = 0;
        i < p.count;
        i++
    ) {

        const neighbours =
            adjacency[i];


        if (
            !neighbours.size
        ) {
            continue;
        }


        let x = 0;
        let y = 0;
        let z = 0;


        for (
            const j of neighbours
        ) {

            x += old[j * 3];
            y += old[j * 3 + 1];
            z += old[j * 3 + 2];
        }


        const count =
            neighbours.size;


        p.setXYZ(

            i,

            THREE.MathUtils.lerp(
                old[i * 3],
                x / count,
                strength
            ),

            THREE.MathUtils.lerp(
                old[i * 3 + 1],
                y / count,
                strength
            ),

            THREE.MathUtils.lerp(
                old[i * 3 + 2],
                z / count,
                strength
            )
        );
    }


    p.needsUpdate = true;

    baseGeometry
        .computeVertexNormals();
}


function weld(tolerance) {

    const n =
        mergeVertices(
            baseGeometry
                .toNonIndexed(),

            Math.max(
                1e-7,
                tolerance
            )
        );


    baseGeometry.dispose();

    baseGeometry = n;

    baseGeometry
        .computeVertexNormals();

    baseGeometry
        .computeBoundingSphere();
}


function mirrorX() {

    const p =
        Array.from(
            baseGeometry
                .attributes
                .position
                .array
        );


    const idx =
        indicesOf(
            baseGeometry
        );


    const n =
        p.length / 3;


    const mirrored = [];


    for (
        let i = 0;
        i < n;
        i++
    ) {

        mirrored.push(
            -p[i * 3],
            p[i * 3 + 1],
            p[i * 3 + 2]
        );
    }


    const mirroredIndices = [];


    for (
        let i = 0;
        i < idx.length;
        i += 3
    ) {

        mirroredIndices.push(
            idx[i] + n,
            idx[i + 2] + n,
            idx[i + 1] + n
        );
    }


    const ng =
        new THREE.BufferGeometry();


    ng.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            p.concat(mirrored),
            3
        )
    );


    ng.setIndex(
        idx.concat(
            mirroredIndices
        )
    );


    ng.computeVertexNormals();
    ng.computeBoundingBox();
    ng.computeBoundingSphere();


    baseGeometry.dispose();

    baseGeometry = ng;
}


function alertMsg(text) {

    setStatus(text);
}


/* =========================================================
   SCULPT UI
   ========================================================= */

function renderSculpt() {

    const brushes = [
        "Draw",
        "Clay",
        "Inflate",
        "Smooth",
        "Flatten",
        "Pinch",
        "Crease",
        "Grab",
        "Scrape"
    ];


    left.innerHTML = `

        <div class="f-label">
            Brush
        </div>

        <div class="f-tools">

            ${brushes.map(
                name => `
                    <button
                        type="button"
                        class="f-tool ${
                            brush.type === name
                                ? "active"
                                : ""
                        }"
                        data-brush="${name}"
                    >
                        ${name}
                    </button>
                `
            ).join("")}

        </div>


        <div class="f-divider"></div>


        <div class="f-label">
            Custom Presets
        </div>

        <div
            class="f-presets"
            id="f-presets"
        ></div>
    `;


    right.innerHTML = `

        ${range(
            "Radius",
            "radius",
            brush.radius,
            0.05,
            5,
            0.01
        )}

        ${range(
            "Strength",
            "strength",
            brush.strength,
            0.005,
            1,
            0.005
        )}

        ${range(
            "Spacing",
            "spacing",
            brush.spacing,
            0.01,
            1,
            0.01
        )}


        <div class="f-field">

            <label>
                Falloff
            </label>

            <select id="f-fall">

                <option ${
                    brush.falloff ===
                    "Smooth"
                        ? "selected"
                        : ""
                }>
                    Smooth
                </option>

                <option ${
                    brush.falloff ===
                    "Linear"
                        ? "selected"
                        : ""
                }>
                    Linear
                </option>

                <option ${
                    brush.falloff ===
                    "Sharp"
                        ? "selected"
                        : ""
                }>
                    Sharp
                </option>

            </select>

        </div>


        <div class="f-label">
            Symmetry
        </div>


        <div class="f-checks">

            <label class="f-check">
                <input
                    type="checkbox"
                    id="f-sx"
                    ${
                        brush.symX
                            ? "checked"
                            : ""
                    }
                >
                X
            </label>

            <label class="f-check">
                <input
                    type="checkbox"
                    id="f-sy"
                    ${
                        brush.symY
                            ? "checked"
                            : ""
                    }
                >
                Y
            </label>

            <label class="f-check">
                <input
                    type="checkbox"
                    id="f-sz"
                    ${
                        brush.symZ
                            ? "checked"
                            : ""
                    }
                >
                Z
            </label>

        </div>


        <div class="f-divider"></div>


        <div class="f-field">

            <label>
                Preset Name
            </label>

            <input
                id="f-preset-name"
                value="My Brush"
            >

        </div>


        <button
            type="button"
            class="f-btn f-primary"
            id="f-save-preset"
        >
            Save Custom Brush
        </button>


        <div class="f-divider"></div>


        <div class="f-help">
            Draw and Clay build the surface.
            Inflate expands along normals.
            Smooth relaxes topology.
            Flatten and Scrape plane the surface.
            Pinch pulls vertices toward the stroke center.
            Crease combines pinching with an inward cut.
            Grab drags nearby geometry.
        </div>
    `;


    left
        .querySelectorAll(
            "[data-brush]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    brush.type =
                        button.dataset.brush;

                    renderSculpt();
                }
            );
        });


    bindValues(
        right,
        brush
    );


    const fall =
        right.querySelector(
            "#f-fall"
        );


    if (fall) {

        fall.addEventListener(
            "change",
            event => {

                brush.falloff =
                    event.target.value;
            }
        );
    }


    ["x", "y", "z"]
        .forEach(axis => {

            const checkbox =
                right.querySelector(
                    "#f-s" + axis
                );


            if (!checkbox) return;


            checkbox.addEventListener(
                "change",
                event => {

                    brush[
                        "sym" +
                        axis.toUpperCase()
                    ] =
                        event.target.checked;
                }
            );
        });


    const savePreset =
        right.querySelector(
            "#f-save-preset"
        );


    if (savePreset) {

        savePreset.addEventListener(
            "click",
            () => {

                const input =
                    right.querySelector(
                        "#f-preset-name"
                    );


                const name =
                    (
                        input?.value ||
                        "Custom Brush"
                    )
                    .trim()
                    .slice(
                        0,
                        24
                    ) ||
                    "Custom Brush";


                presets.push({
                    name,

                    ...JSON.parse(
                        JSON.stringify(
                            brush
                        )
                    )
                });


                renderSculpt();
            }
        );
    }


    const presetHost =
        left.querySelector(
            "#f-presets"
        );


    if (presetHost) {

        presets.forEach(
            preset => {

                const button =
                    document.createElement(
                        "button"
                    );


                button.type =
                    "button";

                button.className =
                    "f-chip";

                button.textContent =
                    preset.name;


                button.addEventListener(
                    "click",
                    () => {

                        const {
                            name,
                            ...settings
                        } = preset;


                        Object.assign(
                            brush,
                            settings
                        );


                        renderSculpt();
                    }
                );


                presetHost.appendChild(
                    button
                );
            }
        );
    }
}


/* =========================================================
   NODES
   ========================================================= */

function renderNodes() {

    const names = {
        source: "Source",
        transform: "Transform",
        material: "Material",
        output: "Output",

        twist: "Twist",
        bend: "Bend",
        taper: "Taper",
        noise: "Noise",
        spherize: "Spherize",
        flatten: "Flatten"
    };


    left.innerHTML = `

        <div class="f-label">
            Add Modifier Node
        </div>

        ${btns([
            ["twist", "Twist"],
            ["bend", "Bend"],
            ["taper", "Taper"],
            ["noise", "Noise"],
            ["spherize", "Spherize"],
            ["flatten", "Flatten"]
        ])}


        <div class="f-divider"></div>


        <div
            class="f-node-list"
            id="f-node-list"
        ></div>
    `;


    const list =
        left.querySelector(
            "#f-node-list"
        );


    nodes.forEach(n => {

        const element =
            document.createElement(
                "div"
            );


        element.className =
            `f-node ${n.type} ` +
            `${n.id === nodeSelected ? "selected" : ""} ` +
            `${n.enabled ? "" : "off"}`;


        element.innerHTML = `

            <div class="f-node-title">

                <span class="f-dot"></span>

                ${names[n.type] || n.type}

            </div>


            <div class="f-node-sub">

                ${
                    n.type === "source"

                        ? (
                            n.p.custom
                                ? "Custom mesh"
                                : n.p.shape
                        )

                        : n.type === "output"

                            ? "Final geometry"

                            : n.enabled

                                ? "Enabled"

                                : "Disabled"
                }

            </div>


            ${
                ![
                    "source",
                    "output"
                ].includes(n.type)

                    ? `

                        <div class="f-node-actions">

                            <button
                                type="button"
                                class="f-mini"
                                data-a="toggle"
                            >
                                ${
                                    n.enabled
                                        ? "Disable"
                                        : "Enable"
                                }
                            </button>


                            ${
                                deformation.has(
                                    n.type
                                )

                                    ? `

                                        <button
                                            type="button"
                                            class="f-mini"
                                            data-a="up"
                                        >
                                            ↑
                                        </button>

                                        <button
                                            type="button"
                                            class="f-mini"
                                            data-a="down"
                                        >
                                            ↓
                                        </button>

                                        <button
                                            type="button"
                                            class="f-mini"
                                            data-a="delete"
                                        >
                                            Delete
                                        </button>
                                    `

                                    : ""
                            }

                        </div>
                    `

                    : ""
            }
        `;


        element.addEventListener(
            "click",
            event => {

                const action =
                    event.target
                        .closest("button")
                        ?.dataset.a;


                if (action) {

                    event.stopPropagation();

                    nodeAction(
                        n,
                        action
                    );

                    return;
                }


                nodeSelected =
                    n.id;

                renderNodes();
            }
        );


        list.appendChild(
            element
        );
    });


    left
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const type =
                        button.dataset.tool;


                    const node = {

                        id:
                            "n" +
                            idN++,

                        type,

                        enabled: true,

                        p:
                            JSON.parse(
                                JSON.stringify(
                                    D[type]
                                )
                            )
                    };


                    const at =
                        nodes.findIndex(
                            x =>
                                x.type ===
                                "transform"
                        );


                    nodes.splice(
                        at,
                        0,
                        node
                    );


                    nodeSelected =
                        node.id;


                    evaluate();
                    pushHistory();
                    renderNodes();
                }
            );
        });


    renderNodeInspector();
}


function nodeAction(
    node,
    action
) {

    if (
        action ===
        "toggle"
    ) {

        node.enabled =
            !node.enabled;
    }


    else if (
        action ===
        "delete"
    ) {

        nodes.splice(
            nodes.indexOf(node),
            1
        );
    }


    else {

        const i =
            nodes.indexOf(node);

        const j =
            action === "up"
                ? i - 1
                : i + 1;


        if (
            j > 0 &&
            j < nodes.length &&
            deformation.has(
                nodes[j]?.type
            )
        ) {

            [
                nodes[i],
                nodes[j]
            ] = [
                nodes[j],
                nodes[i]
            ];
        }
    }


    evaluate();
    pushHistory();
    renderNodes();
}


function renderNodeInspector() {

    const n =
        nodes.find(
            x =>
                x.id ===
                nodeSelected
        );


    if (!n) {

        right.innerHTML =
            '<div class="f-help">Select a node.</div>';

        return;
    }


    if (
        n.type ===
        "source"
    ) {

        const s = n.p;


        right.innerHTML = `

            <div class="f-field">

                <label>
                    Primitive
                </label>

                <select id="f-shape">
                    <option>Box</option>
                    <option>Sphere</option>
                    <option>Cylinder</option>
                    <option>Torus</option>
                </select>

            </div>


            ${num(
                "X Size",
                "sizeX",
                s.sizeX,
                0.05,
                50
            )}

            ${num(
                "Y Size",
                "sizeY",
                s.sizeY,
                0.05,
                50
            )}

            ${num(
                "Z Size",
                "sizeZ",
                s.sizeZ,
                0.05,
                50
            )}

            ${num(
                "Radius",
                "radius",
                s.radius,
                0.05,
                30
            )}

            ${num(
                "Height",
                "height",
                s.height,
                0.05,
                50
            )}

            ${num(
                "Segments",
                "segments",
                s.segments,
                4,
                64,
                1
            )}


            <div class="f-help">
                Changing a source parameter rebuilds
                the primitive and replaces manual or
                sculpted geometry.
            </div>
        `;


        const shape =
            right.querySelector(
                "#f-shape"
            );


        shape.value =
            s.shape === "Custom"
                ? "Box"
                : s.shape;


        shape.addEventListener(
            "change",
            () => {

                makeSource(
                    shape.value
                );
            }
        );


        bindValues(
            right,
            s,
            () => {

                makeSource(
                    shape.value
                );
            }
        );


        return;
    }


    if (
        n.type ===
        "transform" ||
        n.type ===
        "material"
    ) {

        right.innerHTML = `
            <div class="f-help">
                Use Object mode for transform and
                material properties. These properties
                remain represented in the node stack.
            </div>
        `;

        return;
    }


    if (
        n.type ===
        "output"
    ) {

        right.innerHTML = `
            <div class="f-help">
                Output displays the final evaluated
                geometry after all enabled modifier
                nodes.
            </div>
        `;

        return;
    }


    let html = "";


    if (
        n.type === "twist" ||
        n.type === "bend"
    ) {

        html += num(
            "Angle °",
            "amount",
            n.p.amount,
            -1440,
            1440,
            1
        );
    }


    if (
        n.type ===
        "taper"
    ) {

        html += num(
            "Factor",
            "factor",
            n.p.factor,
            -3,
            5,
            0.05
        );
    }


    if (
        n.type ===
        "noise"
    ) {

        html += range(
            "Strength",
            "strength",
            n.p.strength,
            0,
            3,
            0.01
        );


        html += range(
            "Frequency",
            "frequency",
            n.p.frequency,
            0.05,
            20,
            0.05
        );


        html += num(
            "Seed",
            "seed",
            n.p.seed,
            0,
            9999,
            1
        );
    }


    if (
        n.type ===
        "spherize"
    ) {

        html += range(
            "Factor",
            "factor",
            n.p.factor,
            0,
            1,
            0.01
        );
    }


    if (
        n.type ===
        "flatten"
    ) {

        html += num(
            "Plane",
            "amount",
            n.p.amount,
            -20,
            20,
            0.05
        );
    }


    if (
        [
            "twist",
            "bend",
            "taper",
            "flatten"
        ].includes(n.type)
    ) {

        html += `

            <div class="f-field">

                <label>
                    Axis
                </label>

                <select id="f-axis">

                    <option value="x">
                        X
                    </option>

                    <option value="y">
                        Y
                    </option>

                    <option value="z">
                        Z
                    </option>

                </select>

            </div>
        `;
    }


    html += `

        <div class="f-divider"></div>

        <button
            type="button"
            class="f-btn"
            id="f-bake-one"
        >
            Bake All Modifier Nodes
        </button>
    `;


    right.innerHTML =
        html;


    bindValues(
        right,
        n.p,
        () => {
            evaluate();
        }
    );


    const axis =
        right.querySelector(
            "#f-axis"
        );


    if (axis) {

        axis.value =
            n.p.axis;


        axis.addEventListener(
            "change",
            () => {

                n.p.axis =
                    axis.value;

                evaluate();
                pushHistory();
            }
        );
    }


    const bake =
        right.querySelector(
            "#f-bake-one"
        );


    if (bake) {

        bake.addEventListener(
            "click",
            () => {

                bakeModifiers();
                renderNodes();
            }
        );
    }
}


/* =========================================================
   FACE SELECTION
   ========================================================= */

function updateFaceMark() {

    if (faceMark) {

        mesh?.remove(
            faceMark
        );

        faceMark.geometry.dispose();
        faceMark.material.dispose();

        faceMark = null;
    }


    if (
        workspace !== "edit" ||
        selectedFace < 0 ||
        !mesh
    ) {
        return;
    }


    const f =
        faceIndices(
            mesh.geometry,
            selectedFace
        );


    if (!f) return;


    const p =
        mesh.geometry
            .attributes
            .position;


    const a =
        new THREE.Vector3()
            .fromBufferAttribute(
                p,
                f[0]
            );


    const b =
        new THREE.Vector3()
            .fromBufferAttribute(
                p,
                f[1]
            );


    const c =
        new THREE.Vector3()
            .fromBufferAttribute(
                p,
                f[2]
            );


    const n =
        b.clone()
            .sub(a)
            .cross(
                c.clone()
                    .sub(a)
            )
            .normalize()
            .multiplyScalar(
                0.004
            );


    const arr = [

        a.x + n.x,
        a.y + n.y,
        a.z + n.z,

        b.x + n.x,
        b.y + n.y,
        b.z + n.z,

        c.x + n.x,
        c.y + n.y,
        c.z + n.z
    ];


    const g =
        new THREE.BufferGeometry();


    g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            arr,
            3
        )
    );


    faceMark =
        new THREE.Mesh(

            g,

            new THREE.MeshBasicMaterial({

                color: 0xffcc00,

                transparent: true,

                opacity: 0.48,

                side:
                    THREE.DoubleSide,

                depthTest: false
            })
        );


    mesh.add(
        faceMark
    );
}


/* =========================================================
   RAYCASTING
   ========================================================= */

let ray = null;
let ndc = null;


function rayHit(event) {

    if (
        !renderer ||
        !camera ||
        !mesh
    ) {
        return null;
    }


    const rect =
        renderer
            .domElement
            .getBoundingClientRect();


    ndc.x =
        (
            (
                event.clientX -
                rect.left
            ) /
            rect.width
        ) * 2 - 1;


    ndc.y =
        -(
            (
                event.clientY -
                rect.top
            ) /
            rect.height
        ) * 2 + 1;


    ray.setFromCamera(
        ndc,
        camera
    );


    return (
        ray.intersectObject(
            mesh,
            false
        )[0] ||
        null
    );
}


function localPoint(world) {

    return mesh.worldToLocal(
        world.clone()
    );
}


function localNormal(hit) {

    const n =
        hit.face.normal.clone();


    const normalMatrix =
        new THREE.Matrix3()
            .getNormalMatrix(
                mesh.matrixWorld
            );


    const worldNormal =
        n.applyMatrix3(
            normalMatrix
        ).normalize();


    const inverse =
        new THREE.Matrix3()
            .getNormalMatrix(
                mesh.matrixWorld
                    .clone()
                    .invert()
            );


    return worldNormal
        .applyMatrix3(
            inverse
        )
        .normalize();
}


/* =========================================================
   SCULPT
   ========================================================= */

function symmetryCenters(
    center,
    normal
) {

    let out = [
        {
            c: center.clone(),
            n: normal.clone()
        }
    ];


    for (
        const axis of [
            "X",
            "Y",
            "Z"
        ]
    ) {

        if (
            !brush[
                "sym" + axis
            ]
        ) {
            continue;
        }


        const key =
            axis.toLowerCase();


        const copies =
            out.map(item => {

                const c =
                    item.c.clone();

                const n =
                    item.n.clone();


                c[key] *= -1;
                n[key] *= -1;


                return {
                    c,
                    n
                };
            });


        out =
            out.concat(
                copies
            );
    }


    return out;
}


function falloff(t) {

    t =
        Math.max(
            0,
            Math.min(
                1,
                t
            )
        );


    if (
        brush.falloff ===
        "Sharp"
    ) {

        return (
            t *
            t *
            t *
            t
        );
    }


    if (
        brush.falloff ===
        "Linear"
    ) {

        return t;
    }


    return (
        t *
        t *
        (
            3 -
            2 * t
        )
    );
}


function refreshSculpt() {

    baseGeometry
        .computeVertexNormals();


    const bp =
        baseGeometry
            .attributes
            .position;


    const mp =
        mesh.geometry
            .attributes
            .position;


    if (
        mp.count ===
        bp.count
    ) {

        mp.array.set(
            bp.array
        );

        mp.needsUpdate =
            true;


        mesh.geometry
            .computeVertexNormals();

        mesh.geometry
            .computeBoundingSphere();
    }

    else {

        evaluate();
    }


    updateStatus();
}


function sculptStroke(
    hit,
    event
) {

    if (!hit) return;


    const center =
        localPoint(
            hit.point
        );


    const normal =
        localNormal(
            hit
        );


    const pos =
        baseGeometry
            .attributes
            .position;


    const nor =
        baseGeometry
            .attributes
            .normal;


    if (!adjacency) {

        adjacency =
            adjacencyFor(
                baseGeometry
            );
    }


    const centers =
        symmetryCenters(
            center,
            normal
        );


    const old =
        Array.from(
            pos.array
        );


    const v =
        new THREE.Vector3();


    const tmp =
        new THREE.Vector3();


    const dx =
        lastPointer
            ? event.clientX -
              lastPointer.x
            : 0;


    const dy =
        lastPointer
            ? event.clientY -
              lastPointer.y
            : 0;


    const camRight =
        new THREE.Vector3()
            .setFromMatrixColumn(
                camera.matrixWorld,
                0
            );


    const camUp =
        new THREE.Vector3()
            .setFromMatrixColumn(
                camera.matrixWorld,
                1
            );


    const dragWorld =
        camRight
            .multiplyScalar(
                dx *
                0.0025 *
                brush.radius
            )
            .add(
                camUp.multiplyScalar(
                    -dy *
                    0.0025 *
                    brush.radius
                )
            );


    const inverseQuaternion =
        mesh
            .getWorldQuaternion(
                new THREE.Quaternion()
            )
            .invert();


    const dragLocal =
        dragWorld
            .clone()
            .applyQuaternion(
                inverseQuaternion
            );


    for (
        const cn of centers
    ) {

        for (
            let i = 0;
            i < pos.count;
            i++
        ) {

            v.fromBufferAttribute(
                pos,
                i
            );


            const distance =
                v.distanceTo(
                    cn.c
                );


            if (
                distance >
                brush.radius
            ) {
                continue;
            }


            const weight =
                falloff(
                    1 -
                    distance /
                    brush.radius
                ) *
                brush.strength;


            if (
                weight <= 0
            ) {
                continue;
            }


            if (
                brush.type ===
                "Smooth"
            ) {

                const neighbours =
                    adjacency[i];


                if (
                    neighbours?.size
                ) {

                    tmp.set(
                        0,
                        0,
                        0
                    );


                    for (
                        const j of
                        neighbours
                    ) {

                        tmp.add(
                            new THREE.Vector3(
                                old[j * 3],
                                old[j * 3 + 1],
                                old[j * 3 + 2]
                            )
                        );
                    }


                    tmp.multiplyScalar(
                        1 /
                        neighbours.size
                    );


                    v.lerp(
                        tmp,
                        Math.min(
                            1,
                            weight * 2.5
                        )
                    );
                }
            }


            else if (
                brush.type ===
                    "Flatten" ||
                brush.type ===
                    "Scrape"
            ) {

                const distanceToPlane =
                    v.clone()
                        .sub(cn.c)
                        .dot(cn.n);


                if (
                    brush.type ===
                        "Flatten" ||
                    distanceToPlane > 0
                ) {

                    v.addScaledVector(
                        cn.n,
                        -distanceToPlane *
                        Math.min(
                            1,
                            weight * 2.2
                        )
                    );
                }
            }


            else if (
                brush.type ===
                "Pinch"
            ) {

                tmp
                    .copy(cn.c)
                    .sub(v);


                tmp.addScaledVector(
                    cn.n,
                    -tmp.dot(
                        cn.n
                    )
                );


                v.addScaledVector(
                    tmp,
                    weight * 1.6
                );
            }


            else if (
                brush.type ===
                "Crease"
            ) {

                tmp
                    .copy(cn.c)
                    .sub(v);


                tmp.addScaledVector(
                    cn.n,
                    -tmp.dot(
                        cn.n
                    )
                );


                v.addScaledVector(
                    tmp,
                    weight * 1.25
                );


                v.addScaledVector(
                    cn.n,
                    -weight * 0.16
                );
            }


            else if (
                brush.type ===
                "Grab"
            ) {

                v.addScaledVector(
                    dragLocal,
                    weight * 6
                );
            }


            else {

                const nv =
                    new THREE.Vector3(
                        nor.getX(i),
                        nor.getY(i),
                        nor.getZ(i)
                    );


                /*
                 * IMPORTANT:
                 * Fixed original syntax bug:
                 *
                 * brush.type==='Clay'?.85:1
                 *
                 * was invalid JavaScript and prevented
                 * the entire module from parsing.
                 */

                const multiplier =
                    brush.type ===
                    "Inflate"

                        ? 1.5

                        : brush.type ===
                          "Clay"

                            ? 0.85

                            : 1;


                v.addScaledVector(
                    nv,
                    weight *
                    multiplier
                );
            }


            pos.setXYZ(
                i,
                v.x,
                v.y,
                v.z
            );
        }
    }


    pos.needsUpdate =
        true;


    refreshSculpt();


    strokeDirty =
        true;


    lastPointer = {
        x: event.clientX,
        y: event.clientY
    };


    lastBrushPoint =
        center;
}


function updateBrushCursor(
    hit
) {

    if (!brushCursor) {
        return;
    }


    if (
        workspace !==
            "sculpt" ||
        !hit
    ) {

        brushCursor.visible =
            false;

        return;
    }


    brushCursor.visible =
        true;


    brushCursor.position.copy(
        hit.point
    );


    brushCursor.scale.setScalar(
        brush.radius
    );


    const normal =
        hit.face
            .normal
            .clone()
            .transformDirection(
                mesh.matrixWorld
            );


    brushCursor
        .quaternion
        .setFromUnitVectors(

            new THREE.Vector3(
                0,
                0,
                1
            ),

            normal.normalize()
        );
}


/* =========================================================
   CAMERA
   ========================================================= */

function frame() {

    if (
        !mesh ||
        !camera ||
        !orbit
    ) {
        return;
    }


    mesh.geometry
        .computeBoundingSphere();


    const sphere =
        mesh.geometry
            .boundingSphere;


    if (!sphere) return;


    const maxScale =
        Math.max(
            Math.abs(
                mesh.scale.x
            ),
            Math.abs(
                mesh.scale.y
            ),
            Math.abs(
                mesh.scale.z
            )
        );


    const radius =
        Math.max(
            1,
            sphere.radius *
            maxScale
        );


    const target =
        sphere.center
            .clone()
            .applyMatrix4(
                mesh.matrixWorld
            );


    orbit.target.copy(
        target
    );


    camera.position.set(

        target.x +
        radius * 3.1,

        target.y +
        radius * 2.3,

        target.z +
        radius * 3.2
    );


    camera.near =
        Math.max(
            0.01,
            radius / 100
        );


    camera.far =
        Math.max(
            600,
            radius * 100
        );


    camera.updateProjectionMatrix();

    orbit.update();
}


/* =========================================================
   THREE.JS MODULE LOADER
   ========================================================= */

async function loadThreeModules() {

    setStartupStatus(
        "Loading Three.js…"
    );


    /*
     * jsDelivr +esm is retained so the current repository
     * works without requiring additional vendor files.
     *
     * A single pinned Three.js version is used for every
     * module to prevent version mismatch.
     */

    const VERSION =
        "0.185.0";


    const urls = {

        three:
            `https://cdn.jsdelivr.net/npm/three@${VERSION}/+esm`,

        orbit:
            `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/controls/OrbitControls.js/+esm`,

        transform:
            `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/controls/TransformControls.js/+esm`,

        geometry:
            `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/utils/BufferGeometryUtils.js/+esm`
    };


    const [
        threeModule,
        orbitModule,
        transformModule,
        geometryModule
    ] =
        await Promise.all([

            import(urls.three),

            import(urls.orbit),

            import(urls.transform),

            import(urls.geometry)
        ]);


    if (!threeModule.WebGLRenderer) {

        throw new Error(
            "Three.js core module did not expose WebGLRenderer."
        );
    }


    if (!orbitModule.OrbitControls) {

        throw new Error(
            "OrbitControls failed to load."
        );
    }


    if (!transformModule.TransformControls) {

        throw new Error(
            "TransformControls failed to load."
        );
    }


    if (!geometryModule.mergeVertices) {

        throw new Error(
            "BufferGeometryUtils.mergeVertices failed to load."
        );
    }


    THREE =
        threeModule;

    OrbitControls =
        orbitModule
            .OrbitControls;

    TransformControls =
        transformModule
            .TransformControls;

    mergeVertices =
        geometryModule
            .mergeVertices;


    console.log(
        "[LocalForge] Three.js loaded.",
        THREE.REVISION
    );
}


/* =========================================================
   RENDERER
   ========================================================= */

function createRenderer() {

    setStartupStatus(
        "Creating 3D viewport…"
    );


    scene =
        new THREE.Scene();


    scene.background =
        new THREE.Color(
            0x13161b
        );


    camera =
        new THREE.PerspectiveCamera(
            48,
            1,
            0.04,
            600
        );


    camera.position.set(
        6,
        5,
        7
    );


    try {

        renderer =
            new THREE.WebGLRenderer({

                antialias: true,

                alpha: false,

                powerPreference:
                    "high-performance",

                preserveDrawingBuffer:
                    false
            });
    }

    catch (error) {

        throw new Error(
            "WebGL renderer could not be created: " +
            error.message
        );
    }


    const ratio =
        Math.min(
            window.devicePixelRatio ||
            1,

            window.innerWidth <= 720
                ? 1.5
                : 2
        );


    renderer.setPixelRatio(
        ratio
    );


    renderer.shadowMap.enabled =
        true;


    renderer.shadowMap.type =
        THREE.PCFSoftShadowMap;


    renderer.outputColorSpace =
        THREE.SRGBColorSpace;


    renderer.domElement.id =
        "forge-canvas";


    renderer.domElement.setAttribute(
        "aria-label",
        "LocalForge 3D modeling viewport"
    );


    /*
     * Put the real canvas before the HTML overlays.
     */

    view.insertBefore(
        renderer.domElement,
        view.firstChild
    );


    ray =
        new THREE.Raycaster();

    ndc =
        new THREE.Vector2();
}


/* =========================================================
   LIGHTING + WORLD
   ========================================================= */

function createWorld() {

    setStartupStatus(
        "Building workspace…"
    );


    const hemi =
        new THREE.HemisphereLight(
            0xffffff,
            0x303844,
            2.2
        );


    scene.add(
        hemi
    );


    const key =
        new THREE.DirectionalLight(
            0xffffff,
            3
        );


    key.position.set(
        6,
        9,
        6
    );


    key.castShadow =
        true;


    key.shadow.mapSize.set(
        1024,
        1024
    );


    scene.add(
        key
    );


    const fill =
        new THREE.DirectionalLight(
            0x9bbcff,
            0.8
        );


    fill.position.set(
        -5,
        4,
        -4
    );


    scene.add(
        fill
    );


    const grid =
        new THREE.GridHelper(
            30,
            30,
            0x69727d,
            0x333941
        );


    grid.name =
        "LocalForgeGrid";


    scene.add(
        grid
    );


    const axes =
        new THREE.AxesHelper(
            3
        );


    axes.name =
        "LocalForgeAxes";


    scene.add(
        axes
    );


    const floor =
        new THREE.Mesh(

            new THREE.PlaneGeometry(
                30,
                30
            ),

            new THREE.ShadowMaterial({
                opacity: 0.17
            })
        );


    floor.name =
        "LocalForgeFloor";


    floor.rotation.x =
        -Math.PI / 2;


    floor.receiveShadow =
        true;


    scene.add(
        floor
    );
}


/* =========================================================
   CONTROLS
   ========================================================= */

function createControls() {

    orbit =
        new OrbitControls(
            camera,
            renderer.domElement
        );


    orbit.enableDamping =
        true;


    orbit.dampingFactor =
        0.07;


    orbit.target.set(
        0,
        1,
        0
    );


    orbit.enablePan =
        true;


    orbit.enableZoom =
        true;


    if (
        THREE.TOUCH
    ) {

        orbit.touches.ONE =
            THREE.TOUCH.ROTATE;

        orbit.touches.TWO =
            THREE.TOUCH.DOLLY_PAN;
    }


    gizmo =
        new TransformControls(
            camera,
            renderer.domElement
        );


    gizmo.setMode(
        gizmoMode
    );


    gizmo.setSpace(
        space
    );


    gizmoHelper =
        typeof gizmo.getHelper ===
        "function"

            ? gizmo.getHelper()

            : gizmo;


    scene.add(
        gizmoHelper
    );


    gizmo.addEventListener(
        "dragging-changed",
        event => {

            orbit.enabled =
                !event.value;
        }
    );


    gizmo.addEventListener(
        "objectChange",
        () => {

            if (!mesh) return;


            const t =
                transformNode().p;


            t.px =
                +mesh.position.x
                    .toFixed(3);

            t.py =
                +mesh.position.y
                    .toFixed(3);

            t.pz =
                +mesh.position.z
                    .toFixed(3);


            t.rx =
                +THREE.MathUtils
                    .radToDeg(
                        mesh.rotation.x
                    )
                    .toFixed(2);

            t.ry =
                +THREE.MathUtils
                    .radToDeg(
                        mesh.rotation.y
                    )
                    .toFixed(2);

            t.rz =
                +THREE.MathUtils
                    .radToDeg(
                        mesh.rotation.z
                    )
                    .toFixed(2);


            t.sx =
                +mesh.scale.x
                    .toFixed(3);

            t.sy =
                +mesh.scale.y
                    .toFixed(3);

            t.sz =
                +mesh.scale.z
                    .toFixed(3);
        }
    );


    gizmo.addEventListener(
        "mouseUp",
        () => {

            pushHistory();


            if (
                workspace ===
                "object"
            ) {
                renderObject();
            }
        }
    );
}


/* =========================================================
   BRUSH CURSOR
   ========================================================= */

function createBrushCursor() {

    brushCursor =
        new THREE.Mesh(

            new THREE.RingGeometry(
                0.94,
                1,
                64
            ),

            new THREE.MeshBasicMaterial({

                color: 0xffcc00,

                transparent: true,

                opacity: 0.85,

                side:
                    THREE.DoubleSide,

                depthTest: false
            })
        );


    brushCursor.name =
        "LocalForgeBrushCursor";


    brushCursor.visible =
        false;


    scene.add(
        brushCursor
    );
}


/* =========================================================
   DEFAULT CUBE
   ========================================================= */

function createDefaultCube() {

    setStartupStatus(
        "Creating default cube…"
    );


    const initial =
        new THREE.BoxGeometry(
            2,
            2,
            2,
            5,
            5,
            5
        );


    baseGeometry =
        mergeVertices(
            initial.toNonIndexed(),
            1e-5
        );


    initial.dispose();


    baseGeometry
        .computeVertexNormals();

    baseGeometry
        .computeBoundingBox();

    baseGeometry
        .computeBoundingSphere();


    evaluate();


    history = [];
    hist = -1;

    pushHistory();


    renderWorkspace();

    frame();
}


/* =========================================================
   RESIZE
   ========================================================= */

function resize() {

    if (
        !renderer ||
        !camera
    ) {
        return;
    }


    const rect =
        view.getBoundingClientRect();


    const width =
        Math.max(
            1,
            Math.floor(
                rect.width
            )
        );


    const height =
        Math.max(
            1,
            Math.floor(
                rect.height
            )
        );


    camera.aspect =
        width / height;


    camera.updateProjectionMatrix();


    renderer.setSize(
        width,
        height,
        false
    );
}


function installResize() {

    if (
        "ResizeObserver" in
        window
    ) {

        resizeObserver =
            new ResizeObserver(
                resize
            );


        resizeObserver.observe(
            view
        );
    }


    window.addEventListener(
        "resize",
        resize,
        {
            passive: true
        }
    );


    window.addEventListener(
        "orientationchange",
        () => {

            setTimeout(
                resize,
                100
            );
        },
        {
            passive: true
        }
    );


    resize();
}


/* =========================================================
   POINTER EVENTS
   ========================================================= */

function installPointerEvents() {

    const canvas =
        renderer.domElement;


    canvas.addEventListener(
        "pointerdown",
        event => {

            lastPointer = {
                x: event.clientX,
                y: event.clientY
            };


            if (
                workspace ===
                "sculpt"
            ) {

                bakeModifiers();


                adjacency =
                    adjacencyFor(
                        baseGeometry
                    );


                const hit =
                    rayHit(event);


                if (hit) {

                    sculpting =
                        true;

                    orbit.enabled =
                        false;


                    try {

                        canvas
                            .setPointerCapture(
                                event.pointerId
                            );
                    }

                    catch (_) {}


                    sculptStroke(
                        hit,
                        event
                    );
                }
            }
        }
    );


    canvas.addEventListener(
        "pointermove",
        event => {

            const hit =
                rayHit(event);


            updateBrushCursor(
                hit
            );


            if (
                workspace ===
                    "sculpt" &&
                sculpting
            ) {

                if (
                    lastPointer
                ) {

                    const distance =
                        Math.hypot(

                            event.clientX -
                            lastPointer.x,

                            event.clientY -
                            lastPointer.y
                        );


                    if (
                        distance <
                        brush.spacing *
                        20
                    ) {
                        return;
                    }
                }


                sculptStroke(
                    hit,
                    event
                );
            }
        }
    );


    canvas.addEventListener(
        "pointerup",
        event => {

            if (
                workspace ===
                    "edit" &&
                lastPointer &&
                Math.hypot(

                    event.clientX -
                    lastPointer.x,

                    event.clientY -
                    lastPointer.y

                ) < 7
            ) {

                const hit =
                    rayHit(event);


                if (hit) {

                    selectedFace =
                        hit.faceIndex;


                    updateFaceMark();
                    renderEdit();
                }
            }


            if (
                workspace ===
                    "sculpt" &&
                sculpting
            ) {

                sculpting =
                    false;

                orbit.enabled =
                    true;

                adjacency =
                    null;


                if (
                    strokeDirty
                ) {

                    sourceNode()
                        .p
                        .custom =
                        true;


                    sourceNode()
                        .p
                        .shape =
                        "Custom";


                    pushHistory();


                    strokeDirty =
                        false;
                }
            }


            lastPointer =
                null;


            try {

                canvas
                    .releasePointerCapture(
                        event.pointerId
                    );
            }

            catch (_) {}
        }
    );


    canvas.addEventListener(
        "pointercancel",
        () => {

            sculpting =
                false;

            adjacency =
                null;

            lastPointer =
                null;


            if (orbit) {
                orbit.enabled =
                    true;
            }
        }
    );


    canvas.addEventListener(
        "pointerleave",
        () => {

            if (
                !sculpting &&
                brushCursor
            ) {

                brushCursor.visible =
                    false;
            }
        }
    );
}


/* =========================================================
   UI EVENTS
   ========================================================= */

function installUIEvents() {

    R.querySelectorAll(
        "[data-work]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                setWorkspace(
                    button.dataset.work
                );
            }
        );
    });


    R.querySelectorAll(
        "[data-gizmo]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                if (!gizmo) return;


                gizmoMode =
                    button.dataset.gizmo;


                gizmo.setMode(
                    gizmoMode
                );


                R.querySelectorAll(
                    "[data-gizmo]"
                ).forEach(
                    item => {

                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    }
                );
            }
        );
    });


    const spaceButton =
        R.querySelector(
            "#f-space"
        );


    spaceButton?.addEventListener(
        "click",
        event => {

            if (!gizmo) return;


            space =
                space === "world"
                    ? "local"
                    : "world";


            gizmo.setSpace(
                space
            );


            event.currentTarget
                .textContent =
                space
                    .charAt(0)
                    .toUpperCase() +
                space.slice(1);
        }
    );


    R.querySelector(
        "#f-frame"
    )?.addEventListener(
        "click",
        frame
    );


    R.querySelector(
        "#f-wire"
    )?.addEventListener(
        "click",
        event => {

            wire =
                !wire;


            event
                .currentTarget
                .classList
                .toggle(
                    "active",
                    wire
                );


            evaluate();
        }
    );


    R.querySelector(
        "#f-undo"
    )?.addEventListener(
        "click",
        () => {

            restore(
                hist - 1
            );
        }
    );


    R.querySelector(
        "#f-redo"
    )?.addEventListener(
        "click",
        () => {

            restore(
                hist + 1
            );
        }
    );
}


/* =========================================================
   RENDER LOOP
   ========================================================= */

function animate() {

    animationFrame =
        requestAnimationFrame(
            animate
        );


    if (orbit) {
        orbit.update();
    }


    if (
        renderer &&
        scene &&
        camera
    ) {

        renderer.render(
            scene,
            camera
        );
    }
}


/* =========================================================
   WEBGL CHECK
   ========================================================= */

function checkWebGL() {

    const canvas =
        document.createElement(
            "canvas"
        );


    const gl =
        canvas.getContext(
            "webgl2"
        ) ||
        canvas.getContext(
            "webgl"
        );


    if (!gl) {

        throw new Error(
            "WebGL is unavailable in this browser."
        );
    }
}


/* =========================================================
   START APPLICATION
   ========================================================= */

async function startLocalForge() {

    try {

        console.log(
            "[LocalForge] Starting application."
        );


        setStartupStatus(
            "Starting LocalForge…"
        );


        checkWebGL();


        await loadThreeModules();


        createRenderer();

        createWorld();

        createControls();

        createBrushCursor();

        installResize();

        createDefaultCube();

        installPointerEvents();

        installUIEvents();


        animate();


        /*
         * Render at least one frame before removing
         * the HTML placeholder.
         */

        renderer.render(
            scene,
            camera
        );


        setEngineReady();

        updateStatus();


        console.log(
            "[LocalForge] Ready."
        );


        window.LocalForge3D = {

            get THREE() {
                return THREE;
            },

            get scene() {
                return scene;
            },

            get camera() {
                return camera;
            },

            get renderer() {
                return renderer;
            },

            get mesh() {
                return mesh;
            },

            frame,

            evaluate,

            setWorkspace,

            makeSource,

            undo() {
                restore(
                    hist - 1
                );
            },

            redo() {
                restore(
                    hist + 1
                );
            }
        };
    }

    catch (error) {

        startupFailure(
            error
        );
    }
}


/* =========================================================
   START
   ========================================================= */

/*
 * app.js may be imported by bootstrap.js after DOMContentLoaded,
 * or loaded directly as a module.
 *
 * Handle both cases.
 */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            startLocalForge();
        },
        {
            once: true
        }
    );
}

else {

    startLocalForge();
}

})();
