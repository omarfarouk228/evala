// Combat en 3D : deux lutteurs rigués (corps MakeHuman ou Quaternius) animés par les clips de capture
// de mouvement, pilotés par l'état du moteur de combat (combat.js). La logique de jeu ne change pas :
// position, direction, inclinaison (lean), action en cours et corps à corps sont lus chaque image.

import { Arena3D, THREE, BASE } from './arena3d.js';

const MPFB = `${BASE}models/mpfb/`, QUAT = `${BASE}models/quaternius/`;
const CLIPS_URL = `${MPFB}UAL_blender.glb`;
export const WRESTLER_MODELS = 6;   // lutteur_0.glb à lutteur_5.glb

let inst = null;

export function fight3d() { if (!inst) inst = new Fight3D(); return inst; }

class Fight3D {
  constructor() {
    this.canvas = document.getElementById('scene3d');
    this.arena = null; this.mood = null; this.clips = null;
    this.A = null; this.B = null; this.loading = null;
    this.puffs = [];
  }
  show(on) { this.canvas.hidden = !on; }

  // Prépare l'arène (une par ambiance, réutilisée) et charge les deux lutteurs
  async prepare(mood, a, b, opts = {}) {
    if (!this.arena || this.mood !== mood) {
      if (this.arena) this.arena.renderer.dispose();
      this.arena = new Arena3D(this.canvas, { mood, few: opts.few, empty: opts.empty });
      this.mood = mood;
    }
    if (!this.clips) this.clips = await this.arena.loadClips(CLIPS_URL);
    for (const p of [this.A, this.B]) if (p) { this.arena.scene.remove(p.model); const i = this.arena.mixers.indexOf(p.mixer); if (i >= 0) this.arena.mixers.splice(i, 1); }
    const url = (w) => (w.look && Number.isInteger(w.look.model)) ? `${MPFB}lutteur_${w.look.model}.glb` : `${QUAT}Superhero_Male_FullBody.gltf`;
    const mk = async (w, x, dir) => {
      let P;
      try { P = await this.arena.addCharacter(url(w), { x, facing: dir > 0 ? Math.PI / 2 : -Math.PI / 2, clips: this.clips, anim: 'Crouch_Idle_Loop', skin: w.look && w.look.skin, fixNormals: true }); }
      catch (e) { console.warn('modèle manquant, repli Quaternius', e); P = await this.arena.addCharacter(`${QUAT}Superhero_Male_FullBody.gltf`, { x, facing: dir > 0 ? Math.PI / 2 : -Math.PI / 2, clips: this.clips, anim: 'Crouch_Idle_Loop', skin: w.look && w.look.skin, fixNormals: true }); }
      // le modèle est placé dans un groupe pour pouvoir l'incliner (équilibre) autour des pieds
      const g = new THREE.Group(); this.arena.scene.add(g); this.arena.scene.remove(P.model); g.add(P.model);
      P.model.position.set(0, 0, 0); P.group = g; P.state = ''; P.onceT = 0; P.dir = dir;
      this.tintBelt(P, w.look && w.look.band);
      return P;
    };
    [this.A, this.B] = await Promise.all([mk(a, a.x, a.dir), mk(b, b.x, b.dir)]);
    this.cam = { x: 0, zoom: 1, shake: 0 };
    return this;
  }

  // La ceinture est peinte dans la texture en orange : on la teinte à la couleur du canton via un léger décalage de teinte
  tintBelt(P, band) { if (!band) return; P.band = new THREE.Color(band); }

  // Choix du clip selon l'état du lutteur
  animFor(w, bout) {
    if (w.fallen) return ['Death01', 1.0, true];
    if (w.act === 'win') return ['Dance_Loop', 1.0, false];
    if (w.act === 'stagger') return ['Hit_Chest', 1.2, true];
    if (w.act === 'earth') return ['PickUp_Table', 1.6, true];
    if (w.act === 'lift') return ['PickUp_Table', 2.2, true];
    if (w.act === 'trip') return ['Jump_Start', 1.6, true];
    if (w.act === 'reach' || w.act === 'miss') return ['Punch_Jab', 1.3, true];
    if (bout.clinch) { const k = w.input; return ['Push_Loop', k > 0 ? 1.3 : k < 0 ? -0.9 : 0.35, false]; }
    if (Math.abs(w.vx) > 0.15) return ['Walk_Loop', Math.sign(w.vx * w.dir) * Math.max(0.6, Math.abs(w.vx) * 0.9), false];
    return ['Crouch_Idle_Loop', 1.0, false];
  }

  setAnim(P, name, speed, once) {
    const key = name + (once ? '!' : '');
    if (P.state !== key) {
      P.play(name, 0.18, once);
      P.state = key;
    }
    // vitesse du clip courant
    const current = P.mixer._actions.find(a => a.getClip().name === P.current);
    if (current) current.timeScale = speed;
  }

  // Appelé chaque image par la scène de combat
  update(dt, bout, exc = 0.3) {
    if (!this.arena || !this.A) return;
    const pairs = [[this.A, bout.a], [this.B, bout.b]];
    const mid = (bout.a.x + bout.b.x) / 2;
    for (const [P, w] of pairs) {
      const [name, speed, once] = this.animFor(w, bout);
      this.setAnim(P, name, speed, once);
      // position : en corps à corps, les corps s'écartent un peu plus que les points du moteur (bras tendus)
      let x = w.x; if (bout.clinch) x = mid + (w.x - mid) * 1.45;
      P.group.position.set(x, 0, 0);
      P.model.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      // inclinaison : l'équilibre du moteur, autour des pieds ; plus marquée quand on part en avant
      const target = w.fallen ? 0 : -Math.max(-1, Math.min(1, w.lean)) * 0.5 * w.dir;   // après la chute, c'est le clip qui couche le corps
      P.group.rotation.z += (target - P.group.rotation.z) * Math.min(1, dt * 8);
      // teinte de ceinture : un matériau émissif discret sur la zone de la ceinture est trop coûteux ; on garde la peinture
    }
    // caméra : de côté, légèrement en plongée, centrée entre les deux ; zoom en corps à corps
    const tz = bout.clinch ? 1.3 : bout.phase === 'ended' ? 1.22 : 1.0;
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, dt * 2);
    this.cam.x += (mid - this.cam.x) * Math.min(1, dt * 3);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.5);
    const d = 7.4 / this.cam.zoom, ang = 0.22, sh = this.cam.shake * this.cam.shake * 0.08;
    this.arena.camera.position.set(this.cam.x + Math.sin(ang) * d + (Math.random() - 0.5) * sh, 1.55 + (Math.random() - 0.5) * sh, Math.cos(ang) * d);
    this.arena.camera.lookAt(this.cam.x, 1.0, 0);
    // poussière des chutes
    for (const p of this.puffs) { p.life += dt; p.sp.position.add(p.v.clone().multiplyScalar(dt)); p.v.y -= dt * 0.4; p.v.multiplyScalar(0.96); p.sp.material.opacity = Math.max(0, 0.5 * (1 - p.life / p.max)); const s = p.s * (1 + p.life * 1.2); p.sp.scale.set(s, s, 1); }
    this.puffs = this.puffs.filter(p => { if (p.life >= p.max) { this.arena.scene.remove(p.sp); return false; } return true; });
    this.arena.update(dt, exc);
  }

  puff(x, n = 18, power = 1) {
    if (!this.arena) return;
    if (!this.dustTex) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(222,180,130,0.9)'); gr.addColorStop(1, 'rgba(222,180,130,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.dustTex = new THREE.CanvasTexture(c); }
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dustTex, transparent: true, opacity: 0.5, depthWrite: false }));
      sp.position.set(x + (Math.random() - 0.5) * 0.8, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.8);
      const s = 0.25 + Math.random() * 0.4; sp.scale.set(s, s, 1);
      this.arena.scene.add(sp);
      this.puffs.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 1.6 * power, 0.6 + Math.random() * 1.2 * power, (Math.random() - 0.5) * 1.6 * power), life: 0, max: 1 + Math.random() * 1.2, s });
    }
  }
  shake(k) { if (this.cam) this.cam.shake = Math.max(this.cam.shake, k); }

  // Projette la tête d'un lutteur à l'écran (pour les indications d'intention)
  headScreen(which, W, H) {
    const P = which === 'a' ? this.A : this.B; if (!P) return null;
    const head = P.model.getObjectByName('Head') || P.model.getObjectByName('head'); if (!head) return null;
    const v = new THREE.Vector3(); head.getWorldPosition(v); v.y += 0.35; v.project(this.arena.camera);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }
  render() { if (this.arena) this.arena.render(); }
  resize() { if (this.arena) this.arena.resize(); }
}
