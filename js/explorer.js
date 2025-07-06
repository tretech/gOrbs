import * as THREE from 'three';
import { update as TWEENUpdate, Tween as newTween, Easing } from 'https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

function waitForDisplayArea(orbDisplayArea, callback, retries = 10) {
    let attempts = 0;
    const checkSize = () => {
        const width = orbDisplayArea.clientWidth;
        const height = orbDisplayArea.clientHeight;
        if (width > 0 && height > 0) {
            callback();
        } else if (attempts < retries) {
            attempts++;
            console.warn(`Waiting for orb display area to size... Attempt ${attempts}/${retries}`);
            setTimeout(checkSize, 100);
        } else {
            console.error("Failed to size orb display area after max retries.");
            document.getElementById('command-input').placeholder = "Error: Display area not sized. Try resizing the window.";
        }
    };
    checkSize();
}

let _db;
let _appId;
let _collection;
let _query;
let _getDocs;

let scene, camera, renderer, composer, orbGroup;
let termsData = [];
const ORB_RADIUS = 0.5;
const FONT_SIZE = 0.3;

let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;
let focusedOrb = null;

export function initExplorer(db, appId, collectionFn, queryFn, getDocsFn) {
    _db = db;
    _appId = appId;
    _collection = collectionFn;
    _query = queryFn;
    _getDocs = getDocsFn;

    console.log("Explorer module initialized. App ID:", _appId);

    const orbDisplayArea = document.getElementById('orb-display-area');
    const commandInput = document.getElementById('command-input');

    if (!orbDisplayArea || !commandInput) {
        console.error("Missing DOM elements for Explorer mode.");
        document.getElementById('firebase-status').textContent = "Explorer Mode: Failed to initialize (missing DOM elements)";
        return;
    }

    try {
        waitForDisplayArea(orbDisplayArea, () => setupScene(orbDisplayArea));
        setupLighting();
        setupOrbsAreaInteraction(orbDisplayArea, commandInput);
        animate();
    } catch (error) {
        console.error("Failed to initialize Three.js:", error.message);
        document.getElementById('command-input').placeholder = "Error: Failed to initialize 3D visualization";
    }
}

function setupScene(orbDisplayArea) {
    if (!THREE) {
        console.error("Three.js not loaded.");
        document.getElementById('command-input').placeholder = "Error: Three.js not loaded";
        return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(
        75,
        orbDisplayArea.clientWidth / orbDisplayArea.clientHeight,
        0.1,
        1000
    );
    camera.position.z = 20;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(orbDisplayArea.clientWidth, orbDisplayArea.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    orbDisplayArea.appendChild(renderer.domElement);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(orbDisplayArea.clientWidth, orbDisplayArea.clientHeight),
        1.5,
        0.5,
        0.01
    );
    composer.addPass(bloomPass);

    window.addEventListener('resize', () => {
        if (orbDisplayArea.clientWidth === 0 || orbDisplayArea.clientHeight === 0) return;
        camera.aspect = orbDisplayArea.clientWidth / orbDisplayArea.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(orbDisplayArea.clientWidth, orbDisplayArea.clientHeight);
        composer.setSize(orbDisplayArea.clientWidth, orbDisplayArea.clientHeight);
    });
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight1.position.set(5, 10, 7.5);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0x80b3ff, 1);
    directionalLight2.position.set(-5, -10, -7.5);
    scene.add(directionalLight2);
}

function setupOrbsAreaInteraction(orbDisplayArea, commandInput) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    orbDisplayArea.addEventListener('click', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(orbGroup ? orbGroup.children.filter(c => c.isMesh) : []);
        if (intersects.length > 0) {
            const clicked = intersects[0].object;
            focusOnOrb(clicked);
        }
    });

    function focusOnOrb(orb) {
        focusedOrb = orb;
        newTween(orb.position)
            .to({ x: 0, y: 0, z: 0 }, 800)
            .easing(Easing.Quadratic.Out)
            .start();

        newTween(orb.scale)
            .to({ x: 2, y: 2, z: 2 }, 1000)
            .easing(Easing.Elastic.Out)
            .start();

        orbGroup.children.forEach(child => {
            if (child !== orb && child.isMesh) {
                newTween(child.scale)
                    .to({ x: 0.1, y: 0.1, z: 0.1 }, 500)
                    .easing(Easing.Quadratic.InOut)
                    .start();
            }
        });

        showOrbDetails(orb.userData.term, orb.userData.definitions?.[0] || { text: 'No definition available' });
    }

    function showOrbDetails(term, definition) {
        const commandInput = document.getElementById('command-input');
        commandInput.placeholder = `Selected: ${term} - ${definition.text}`;
    }

    orbDisplayArea.addEventListener('mousedown', (e) => {
        if (e.target !== commandInput) {
            isDragging = true;
            previousMouseX = e.clientX;
            previousMouseY = e.clientY;
            orbDisplayArea.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    orbDisplayArea.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - previousMouseX;
        const deltaY = e.clientY - previousMouseY;

        if (orbGroup) {
            orbGroup.rotation.y += deltaX * 0.005;
            const newRotationX = orbGroup.rotation.x + deltaY * 0.005;
            if (newRotationX > -Math.PI / 2 && newRotationX < Math.PI / 2) {
                orbGroup.rotation.x = newRotationX;
            }
        }

        previousMouseX = e.clientX;
        previousMouseY = e.clientY;
    });

    orbDisplayArea.addEventListener('mouseup', () => {
        isDragging = false;
        orbDisplayArea.style.cursor = 'grab';
    });

    orbDisplayArea.addEventListener('mouseleave', () => {
        isDragging = false;
        orbDisplayArea.style.cursor = 'default';
    });

    orbDisplayArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.05;
        if (camera.position.z < 5) camera.position.z = 5;
        if (camera.position.z > 50) camera.position.z = 50;
    });

    commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCommand(commandInput.value);
            commandInput.value = '';
        }
    });
}

async function fetchTerms() {
    if (!_db || !_collection || !_query || !_getDocs) {
        console.warn("Firestore functions not available. Cannot fetch terms.");
        return [];
    }
    try {
        const termsCollectionRef = _collection(_db, `artifacts/${_appId}/public/data/terms`);
        const q = _query(termsCollectionRef);
        const snapshot = await _getDocs(q);

        const fetchedTerms = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            fetchedTerms.push({
                id: doc.id,
                term: data.term,
                definitions: data.definitions || [],
                tags: data.tags || [],
                style: {
                    color: data.style?.color || '0x007bff',
                    size: data.style?.size || 1,
                    radius: data.style?.radius || ORB_RADIUS,
                    pulseSpeed: data.style?.pulseSpeed || 0.05
                },
                position: data.position || null
            });
        });
        return fetchedTerms;
    } catch (error) {
        console.error("Error fetching terms:", error.message, error.code || '');
        document.getElementById('command-input').placeholder = `Error fetching terms: ${error.message}`;
        return [];
    }
}

function renderOrbs() {
    if (orbGroup) {
        orbGroup.children.forEach(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
            if (child.isSprite) {
                child.material.dispose();
            }
        });
        scene.remove(orbGroup);
        orbGroup = null;
    }

    orbGroup = new THREE.Group();
    scene.add(orbGroup);

    if (termsData.length === 0) {
        console.log("No terms data to render orbs.");
        return;
    }

    const sharedSphereGeometry = new THREE.SphereGeometry(ORB_RADIUS, 32, 32);
    const materialCache = {};

    termsData.forEach((term, index) => {
        const termId = term.id;
        const termName = term.term;
        const termColor = new THREE.Color(term.style.color);
        const scaledRadius = term.style.radius * term.style.size;

        let orbMaterial = materialCache[term.style.color];
        if (!orbMaterial) {
            orbMaterial = new THREE.MeshPhongMaterial({
                color: termColor,
                shininess: 80,
                specular: new THREE.Color(0x555555),
                emissive: termColor,
                emissiveIntensity: 0.5
            });
            materialCache[term.style.color] = orbMaterial;
        }

        const orb = new THREE.Mesh(sharedSphereGeometry, orbMaterial);
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const radius = index * 0.5;
        orb.position.set(
            radius * Math.cos(angle),
            radius * Math.sin(angle),
            (index % 2 === 0 ? 1 : -1) * (index * 0.1)
        );

        orb.userData = {
            id: termId,
            term: termName,
            definitions: term.definitions,
            tags: term.tags,
            style: {
                ...term.style,
                baseScale: scaledRadius
            }
        };

        orb.receiveShadow = true;
        orb.castShadow = true;
        orbGroup.add(orb);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const fontSizePx = Math.ceil(FONT_SIZE * 100);
        context.font = `${fontSizePx}px Arial`;
        const textWidth = context.measureText(termName).width;

        canvas.width = textWidth + 10;
        canvas.height = fontSizePx + 10;
        context.font = `${fontSizePx}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(termName, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);

        sprite.position.set(orb.position.x, orb.position.y + scaledRadius + FONT_SIZE * 0.5, orb.position.z);
        sprite.scale.set(canvas.width / fontSizePx * FONT_SIZE, canvas.height / fontSizePx * FONT_SIZE, 1);
        sprite.userData = { orbId: termId };
        orbGroup.add(sprite);
    });
}

function applyForces() {
    if (!orbGroup) return;

    const orbs = orbGroup.children.filter(child => child.isMesh);
    const repulsionStrength = 0.005;
    const attractionStrength = 0.002;

    for (let i = 0; i < orbs.length; i++) {
        let orbA = orbs[i];
        let force = new THREE.Vector3(0, 0, 0);

        const centerForce = orbA.position.clone().multiplyScalar(-0.002);
        orbA.position.add(centerForce);

        const swirlStrength = 0.003;
        const swirl = new THREE.Vector3(-orbA.position.z, 0, orbA.position.x)
            .normalize()
            .multiplyScalar(swirlStrength);
        orbA.position.add(swirl);

        for (let j = 0; j < orbs.length; j++) {
            if (i === j) continue;

            let orbB = orbs[j];
            let diff = new THREE.Vector3().subVectors(orbA.position, orbB.position);
            let dist = diff.length();

            if (dist < 0.1) dist = 0.1;

            let repulse = diff.clone().normalize().multiplyScalar(repulsionStrength / dist);
            force.add(repulse);

            if (orbA.userData.tags && orbB.userData.tags) {
                const shared = orbA.userData.tags.filter(tag => orbB.userData.tags.includes(tag));
                if (shared.length > 0) {
                    let attract = diff.clone().normalize().multiplyScalar(-attractionStrength * shared.length);
                    force.add(attract);
                }
            }
        }
        orbA.position.add(force);

        const scaleBase = orbA.userData.style.baseScale;
        const pulseSpeed = orbA.userData.style.pulseSpeed;
        const pulseFactor = 1 + Math.sin(Date.now() * pulseSpeed) * 0.1;
        orbA.scale.setScalar(pulseFactor);

        const sprite = orbGroup.children.find(
            child => child.isSprite && child.userData.orbId === orbA.userData.id
        );

        if (sprite) {
            sprite.position.set(orbA.position.x, orbA.position.y + orbA.geometry.parameters.radius * orbA.scale.y + FONT_SIZE * 0.5, orbA.position.z);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    applyForces();
    TWEENUpdate();
    if (composer) {
        composer.render();
    } else if (renderer) {
        renderer.render(scene, camera);
    }
}

async function handleCommand(fullCommandInput) {
    const commandInput = document.getElementById('command-input');
    let commandPrefix = '';
    let actualCommand = '';

    const parts = fullCommandInput.split(':');
    if (parts.length > 1) {
        commandPrefix = parts[0].trim().toLowerCase();
        actualCommand = parts.slice(1).join(':').trim().toLowerCase();
    } else {
        actualCommand = fullCommandInput.toLowerCase();
    }

    switch (commandPrefix) {
        case 'run':
            commandInput.placeholder = "Loading orbs...";
            termsData = await fetchTerms();
            if (termsData.length > 0) {
                renderOrbs();
                commandInput.placeholder = `Orbs active! Displaying ${termsData.length} terms. Type 'clear:' to reset or 'run:' again.`;
            } else {
                commandInput.placeholder = "No terms found. Import some in Admin Mode first. Type 'run:' to try again.";
            }
            break;
        case 'clear':
            if (orbGroup) {
                orbGroup.children.forEach(child => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        child.material.dispose();
                    }
                    if (child.isSprite) {
                        child.material.dispose();
                    }
                });
                scene.remove(orbGroup);
                orbGroup = null;
            }
            termsData = [];
            commandInput.placeholder = "Orbs cleared. Type 'run:' to load again.";
            break;
        case 'list':
            document.getElementById('explorer-mode-btn').classList.remove('bg-cyan-500', 'hover:bg-cyan-600');
            document.getElementById('admin-mode-btn').classList.add('bg-cyan-500', 'hover:bg-cyan-600');
            document.getElementById('explorer-panel').classList.add('hidden');
            document.getElementById('admin-panel').classList.remove('hidden');
            commandInput.placeholder = 'Switched to Admin Mode to view terms matrix.';
            break;
        default:
            commandInput.placeholder = `Unknown command. Try 'run:', 'clear:', or 'list:'.`;
            break;
    }
}
