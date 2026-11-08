// Socle 3D (Three.js) : arène de l'Évala en vraie 3D, personnages animés par squelette (GLB),
// lumière du soleil avec ombres portées, foule en panneaux (sprites peints), poussière.
// Les modèles chargés ici sont des modèles de test rigués (Soldier et Xbot, exemples de Three.js,
// rigs compatibles Mixamo) : ils seront remplacés par de vrais lutteurs fournis par l'utilisateur.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { person, tree, MOODS } from '../arena.js';
import { rng } from '../paint.js';

const BASE = import.meta.env.BASE_URL || './';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function groundTexture() {
  return canvasTex(2048, 2048, (g, w, h) => {
    const r = rng(7);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#bd5f33'); gr.addColorStop(1, '#a04c28');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,40,15,0.35)' : 'rgba(235,170,120,0.3)'; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s * 0.7); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${90 + r() * 40},${120 + r() * 40},${40},${0.35 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 14, 3 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill(); }
    // lignes blanches effacées du terrain de football (le rond central)
    g.strokeStyle = 'rgba(245,240,225,0.35)'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.18, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
}

function skyTexture(m) {
  return canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, m.skyTop); gr.addColorStop(0.45, m.skyMid); gr.addColorStop(0.62, m.skyLow); gr.addColorStop(0.7, m.haze); gr.addColorStop(1, m.soilDark);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// Panneau peint (sprite) : spectateur ou arbre, dessiné avec les fonctions 2D du jeu
function spriteFrames(draw, n, w, h) {
  return Array.from({ length: n }, (_, i) => { const t = canvasTex(w, h, (g) => draw(g, i)); t.minFilter = THREE.LinearMipmapLinearFilter; return t; });
}

export class Arena3D {
  constructor(canvas, opts = {}) {
    this.mood = MOODS[opts.mood || 'aprem'];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(new THREE.Color(this.mood.haze), 40, 160);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
    this.camera.position.set(0, 1.7, 8.5); this.camera.lookAt(0, 1.0, 0);
    this.clock = new THREE.Clock(); this.t = 0;
    this.mixers = []; this.crowd = []; this.people = [];
    this.build();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.renderer.domElement.clientWidth || window.innerWidth, h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  build() {
    const m = this.mood, S = this.scene;
    // ciel : grande sphère vue de l'intérieur, dégradé peint
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(m), side: THREE.BackSide, fog: false }));
    S.add(sky);
    // lumières : ciel et rebond de la latérite, soleil chaud avec ombres
    S.add(new THREE.HemisphereLight(0xcfe0ff, 0xb5582f, 0.7));
    const sun = new THREE.DirectionalLight(new THREE.Color(m.sun), 2.4);
    sun.position.set(-7, 12, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    S.add(sun); S.add(sun.target); this.sun = sun;
    // sol de latérite
    const gt = groundTexture(); gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
    // collines du pays kabyè au loin
    const r = rng(3);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = 90 + r() * 60, hgt = 14 + r() * 26, rad = 30 + r() * 40;
      const col = new THREE.Color(m.far).lerp(new THREE.Color(m.mid), r() * 0.5);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7, 1), new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true }));
      hill.position.set(Math.cos(a) * d, hgt / 2 - 2, Math.sin(a) * d); hill.scale.z = 0.6 + r() * 0.6; S.add(hill);
    }
    // arbres : panneaux peints, toujours face à la caméra
    const treeTex = spriteFrames((g, i) => { const rr = rng(40 + i); tree(g, 256, 500, 300, ['nere', 'karite', 'manguier', 'baobab', 'ronier'][i % 5], m, rr, 1); }, 5, 512, 512);
    for (let i = 0; i < 44; i++) {
      const a = r() * Math.PI * 2, d = 18 + r() * 40, sc = 7 + r() * 6;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: treeTex[i % 5], transparent: true, alphaTest: 0.3 }));
      sp.position.set(Math.cos(a) * d, sc * 0.5 - 0.2, Math.sin(a) * d); sp.scale.set(sc, sc, 1); sp.center.set(0.5, 0.02); sp.position.y = 0; S.add(sp);
    }
    // foule : deux arcs de spectateurs peints, trois images par personne
    const frames = Array.from({ length: 24 }, (_, v) => spriteFrames((g, f) => person(g, 128, 330, 240, v, f), 3, 256, 340));
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * Math.PI * 2, back = i % 2, d = 7.4 + back * 1.1 + r() * 0.4;
      if (Math.abs(Math.sin(a)) < 0.08 && Math.cos(a) > 0) continue; // côté caméra laissé ouvert
      const v = Math.floor(r() * 24), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[v][0], transparent: true, alphaTest: 0.3 }));
      const hgt = 1.75 * (0.92 + r() * 0.16);
      sp.position.set(Math.cos(a) * d, hgt / 2 * 1.42 - 0.05, Math.sin(a) * d); sp.scale.set(hgt * 0.75, hgt * 1.42 * 0.5 * 2 / 2, 1); sp.center.set(0.5, 0.0); sp.position.y = 0;
      sp.scale.set(hgt * 0.75, hgt, 1);
      S.add(sp); this.crowd.push({ sp, frames: frames[v], ph: r() * 10, sp_: 0.6 + r() * 1.2 });
    }
    // ombres de contact de la foule : disque sombre au sol
    const shadowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(40,10,0,0.55)'); gr.addColorStop(1, 'rgba(40,10,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    for (const c of this.crowd) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(c.sp.position.x + 0.2, 0.01, c.sp.position.z); S.add(sh); }
    // bâche bleue des officiels
    const tent = new THREE.Group();
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.8 })); tarp.position.y = 2.6; tarp.castShadow = true; tent.add(tarp);
    for (const [x, z] of [[-3.3, -1.8], [3.3, -1.8], [-3.3, 1.8], [3.3, 1.8]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d2 })); p.position.set(x, 1.3, z); p.castShadow = true; tent.add(p); }
    tent.position.set(-6, 0, -9); S.add(tent);
    // poussière en suspension
    const dustTex = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,220,170,0.8)'); gr.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
    this.dust = [];
    for (let i = 0; i < 120; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0.35, depthWrite: false })); sp.position.set((r() - 0.5) * 16, r() * 3, (r() - 0.5) * 12); const s = 0.04 + r() * 0.1; sp.scale.set(s, s, 1); S.add(sp); this.dust.push({ sp, v: 0.1 + r() * 0.3, ph: r() * 6 }); }
  }

  // Charge un personnage GLB rigué, le pose, lance une animation
  async addCharacter(url, { x = 0, z = 0, facing = 0, anim = 'Idle', tint = null, scale = 1 } = {}) {
    if (!this.loader) this.loader = new GLTFLoader();
    if (!this.cache) this.cache = new Map();
    if (!this.cache.has(url)) this.cache.set(url, this.loader.loadAsync(url));
    const gltf = await this.cache.get(url);
    const model = skeletonClone(gltf.scene);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (tint) { o.material = o.material.clone(); o.material.color = new THREE.Color(tint); o.material.roughness = 0.55; } } });
    model.position.set(x, 0, z); model.rotation.y = facing; model.scale.setScalar(scale);
    this.scene.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const clips = gltf.animations;
    const find = (n) => clips.find(c => c.name.toLowerCase() === n.toLowerCase()) || clips.find(c => c.name.toLowerCase().includes(n.toLowerCase()));
    const actions = {}; for (const c of clips) actions[c.name] = mixer.clipAction(c);
    const first = find(anim) || clips[0]; if (first) mixer.clipAction(first).play();
    this.mixers.push(mixer);
    const P = { model, mixer, actions, clips: clips.map(c => c.name), current: first ? first.name : null,
      play(name, fade = 0.3) { const c = find(name); if (!c || c.name === this.current) return; const next = mixer.clipAction(c); const prev = this.current && mixer.clipAction(find(this.current)); next.reset().fadeIn(fade).play(); if (prev) prev.fadeOut(fade); this.current = c.name; } };
    this.people.push(P);
    return P;
  }

  update(dt) {
    this.t += dt;
    for (const mx of this.mixers) mx.update(dt);
    // la foule respire, lève les bras, chante
    for (const c of this.crowd) {
      const k = Math.sin(this.t * c.sp_ + c.ph);
      const f = k > 0.75 ? 1 : k < -0.6 ? 2 : 0;
      if (c.sp.material.map !== c.frames[f]) { c.sp.material.map = c.frames[f]; c.sp.material.needsUpdate = true; }
    }
    for (const d of this.dust) { d.sp.position.y += d.v * dt * 0.3; d.sp.position.x += Math.sin(this.t * 0.5 + d.ph) * dt * 0.2; if (d.sp.position.y > 3.5) d.sp.position.y = 0; }
    // le soleil suit la scène pour garder des ombres nettes autour des lutteurs
    this.sun.target.position.set(0, 0, 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

export { THREE, BASE };
