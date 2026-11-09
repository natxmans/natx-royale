// Effets visuels : ciel dégradé avec soleil, mer animée avec écume,
// mur de la zone, particules (poussière, étincelles, cœurs, étoiles…).
import * as THREE from 'three';

export const SOLEIL = new THREE.Vector3(0.45, 0.62, 0.32).normalize();
export const COULEURS_CIEL = {
  haut: new THREE.Color('#3f8ee8'), horizon: new THREE.Color('#bfe6ff'), bas: new THREE.Color('#9ad0f0'),
  zone: new THREE.Color('#5b2a9e'),
};

// ---------- Ciel ----------
export function creerCiel() {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uHaut: { value: COULEURS_CIEL.haut.clone() }, uHorizon: { value: COULEURS_CIEL.horizon.clone() },
      uBas: { value: COULEURS_CIEL.bas.clone() }, uSoleil: { value: SOLEIL.clone() },
      uTeinte: { value: COULEURS_CIEL.zone.clone() }, uMelange: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uHaut, uHorizon, uBas, uSoleil, uTeinte; uniform float uMelange;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = mix(uHorizon, uHaut, smoothstep(0.0, 0.6, y));
        c = mix(c, uBas, smoothstep(0.0, -0.2, y));
        float s = max(dot(d, uSoleil), 0.0);
        c += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        c = mix(c, uTeinte * (0.7 + 0.5 * smoothstep(-0.2, 0.6, y)), uMelange);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m);
  ciel.renderOrder = -10;
  ciel.frustumCulled = false;
  return ciel;
}

// ---------- Mer ----------
export function creerMer(monde) {
  // Carte des hauteurs du terrain dans une texture : la mer sait où est la plage
  const N = monde.N, D = new Uint16Array(N * N);
  for (let i = 0; i < N * N; i++) D[i] = THREE.DataUtils.toHalfFloat(monde.H[i]);
  const hauteurs = new THREE.DataTexture(D, N, N, THREE.RedFormat, THREE.HalfFloatType);
  hauteurs.magFilter = hauteurs.minFilter = THREE.LinearFilter;
  hauteurs.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(2400, 2400, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTemps: { value: 0 }, uHauteurs: { value: null }, uDemi: { value: monde.DEMI }, uN: { value: N },
      uSoleil: { value: SOLEIL.clone() }, uCiel: { value: COULEURS_CIEL.horizon.clone() },
      uPeu: { value: new THREE.Color('#62e3d6') }, uFond: { value: new THREE.Color('#1667b8') }, uLarge: { value: new THREE.Color('#0d4a93') },
    }]),
    vertexShader: `
      uniform float uTemps;
      varying vec3 vMonde; varying float vVague;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float v = sin(p.x * 0.07 + uTemps * 1.1) * 0.16 + cos(p.z * 0.06 + uTemps * 0.9) * 0.14 + sin((p.x + p.z) * 0.13 + uTemps * 1.7) * 0.05;
        p.y += v;
        vVague = v;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vMonde = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uHauteurs; uniform float uDemi, uN, uTemps;
      uniform vec3 uSoleil, uCiel, uPeu, uFond, uLarge;
      varying vec3 vMonde; varying float vVague;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = (vMonde.xz + uDemi) / (2.0 * uDemi);
        float h = -8.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) h = texture2D(uHauteurs, uv * (uN - 1.0) / uN + 0.5 / uN).r;
        float prof = max(0.0, vVague * 0.5 - h);
        vec3 col = mix(uPeu, uFond, smoothstep(0.0, 4.5, prof));
        col = mix(col, uLarge, smoothstep(5.0, 9.0, prof));
        vec2 q = vMonde.xz;
        vec3 n = normalize(vec3(
          sin(q.x * 0.9 + uTemps * 2.1) * 0.08 + sin(q.y * 1.7 - uTemps * 1.5) * 0.05 + sin((q.x - q.y) * 0.35 + uTemps) * 0.06,
          1.0,
          cos(q.y * 1.1 + uTemps * 1.8) * 0.08 + cos(q.x * 1.6 - uTemps * 1.2) * 0.05));
        vec3 vue = normalize(cameraPosition - vMonde);
        float fres = pow(1.0 - max(dot(n, vue), 0.0), 4.0);
        col = mix(col, uCiel, clamp(fres, 0.0, 0.7));
        vec3 r = reflect(-uSoleil, n);
        float spec = pow(max(dot(r, vue), 0.0), 120.0);
        col += vec3(1.0, 0.93, 0.78) * spec * 1.4;
        float ecume = 1.0 - smoothstep(0.0, 0.55, prof);
        float motif = 0.5 + 0.5 * sin(prof * 14.0 - uTemps * 2.6 + sin(q.x * 0.4 + q.y * 0.3) * 2.0);
        float vagueEcume = smoothstep(0.55, 1.1, prof) * (1.0 - smoothstep(1.1, 1.6, prof)) * step(0.82, 0.5 + 0.5 * sin(prof * 9.0 - uTemps * 2.0));
        col = mix(col, vec3(1.0), clamp(ecume * (0.55 + 0.45 * motif) + vagueEcume * 0.5, 0.0, 1.0));
        float alpha = mix(0.5, 0.9, smoothstep(0.0, 3.5, prof));
        alpha = max(alpha, ecume * 0.95);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, fog: true, depthWrite: false,
  });
  m.uniforms.uHauteurs.value = hauteurs;
  const mer = new THREE.Mesh(geo, m);
  mer.renderOrder = 1;
  mer.userData.texture = hauteurs;
  return mer;
}

// ---------- Mur de la zone ----------
export function materiauZone() {
  return new THREE.ShaderMaterial({
    uniforms: { uTemps: { value: 0 }, uRayon: { value: 290 }, uCouleur: { value: new THREE.Color('#a55bff') } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vMonde;
      void main() {
        vUv = uv;
        vMonde = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vMonde, 1.0);
      }`,
    fragmentShader: `
      uniform float uTemps, uRayon; uniform vec3 uCouleur;
      varying vec2 vUv; varying vec3 vMonde;
      void main() {
        float arc = vUv.x * 6.2832 * uRayon;
        float y = vMonde.y;
        float flux = 0.5 + 0.5 * sin(arc * 0.06 + y * 0.035 - uTemps * 0.9 + sin(y * 0.02 + uTemps * 0.5) * 2.5);
        float vagues = 0.5 + 0.5 * sin(y * 0.09 + uTemps * 1.6 + sin(arc * 0.03 + uTemps * 0.4) * 3.0);
        float d = distance(cameraPosition, vMonde);
        float a = 0.14 + 0.2 * flux * vagues;
        a += (1.0 - smoothstep(-5.0, 25.0, y)) * 0.25;
        a *= 1.0 - smoothstep(120.0, 260.0, y);
        a *= mix(1.0, 0.45, smoothstep(60.0, 350.0, d));
        vec3 c = uCouleur * (0.7 + 0.8 * flux * vagues) + vec3(0.3, 0.1, 0.45) * (1.0 - smoothstep(-5.0, 20.0, y));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
}

// ---------- Particules ----------
// Atlas 2x2 : rond doux, cœur, étoile, étincelle
function atlasParticules() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.save(); g.translate(96, 34); g.beginPath();
  g.moveTo(0, 18); g.bezierCurveTo(-30, -2, -14, -24, 0, -8); g.bezierCurveTo(14, -24, 30, -2, 0, 18); g.fill(); g.restore();
  g.save(); g.translate(32, 96); g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 11 : 26; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.fill(); g.restore();
  const g2 = g.createRadialGradient(96, 96, 0, 96, 96, 30);
  g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.15, 'rgba(255,255,255,.9)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = g2; g.fillRect(64, 64, 64, 64);
  g.fillRect(64, 95, 64, 2); g.fillRect(95, 64, 2, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

export class Particules {
  constructor(scene, max = 1500) {
    this.max = max;
    this.liste = [];
    const atlas = atlasParticules();
    this.systemes = [false, true].map(additif => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(max * 3), coul = new Float32Array(max * 3), taille = new Float32Array(max), alpha = new Float32Array(max), forme = new Float32Array(max);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aCouleur', new THREE.BufferAttribute(coul, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aTaille', new THREE.BufferAttribute(taille, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aForme', new THREE.BufferAttribute(forme, 1).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: atlas }, uEchelle: { value: 400 } },
        vertexShader: `
          attribute vec3 aCouleur; attribute float aTaille, aAlpha, aForme;
          uniform float uEchelle;
          varying vec3 vCouleur; varying float vAlpha, vForme;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aTaille * uEchelle / max(0.1, -mv.z);
            gl_Position = projectionMatrix * mv;
            vCouleur = aCouleur; vAlpha = aAlpha; vForme = aForme;
          }`,
        fragmentShader: `
          uniform sampler2D uAtlas;
          varying vec3 vCouleur; varying float vAlpha, vForme;
          void main() {
            vec2 o = vec2(mod(vForme, 2.0), floor(vForme / 2.0)) * 0.5;
            vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * 0.5 + o;
            vec4 t = texture2D(uAtlas, uv);
            float a = t.a * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(vCouleur * t.rgb, a);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false,
        blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const pts = new THREE.Points(geo, m);
      pts.frustumCulled = false;
      pts.renderOrder = 6;
      scene.add(pts);
      return { pts, geo, n: 0 };
    });
    this.c = new THREE.Color();
  }

  // forme : 0 rond, 1 cœur, 2 étoile, 3 étincelle
  ajouter(o) {
    if (this.liste.length >= this.max * 2 - 4) return;
    this.c.set(o.couleur || '#ffffff');
    this.liste.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      vie: o.vie || 1, age: 0, taille: o.taille || 0.4, tailleFin: o.tailleFin ?? (o.taille || 0.4),
      r: this.c.r, g: this.c.g, b: this.c.b, alpha: o.alpha ?? 1, forme: o.forme || 0,
      additif: o.additif ? 1 : 0, gravite: o.gravite || 0, frein: o.frein || 0,
    });
  }

  maj(dt, camera, hauteurEcran) {
    const echelle = hauteurEcran / (2 * Math.tan(camera.fov * Math.PI / 360));
    const n = [0, 0];
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const p = this.liste[i];
      p.age += dt;
      if (p.age >= p.vie) { this.liste[i] = this.liste[this.liste.length - 1]; this.liste.pop(); continue; }
      p.vy -= p.gravite * dt;
      if (p.frein) { const f = Math.max(0, 1 - p.frein * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.liste) {
      const s = this.systemes[p.additif];
      const k = n[p.additif];
      if (k >= this.max) continue;
      const t = p.age / p.vie;
      const A = s.geo.attributes;
      A.position.array[k * 3] = p.x; A.position.array[k * 3 + 1] = p.y; A.position.array[k * 3 + 2] = p.z;
      A.aCouleur.array[k * 3] = p.r; A.aCouleur.array[k * 3 + 1] = p.g; A.aCouleur.array[k * 3 + 2] = p.b;
      A.aTaille.array[k] = p.taille + (p.tailleFin - p.taille) * t;
      A.aAlpha.array[k] = p.alpha * (t < 0.15 ? t / 0.15 : 1 - Math.max(0, t - 0.5) / 0.5);
      A.aForme.array[k] = p.forme;
      n[p.additif] = k + 1;
    }
    for (let i = 0; i < 2; i++) {
      const s = this.systemes[i];
      s.geo.setDrawRange(0, n[i]);
      for (const nom of ['position', 'aCouleur', 'aTaille', 'aAlpha', 'aForme']) s.geo.attributes[nom].needsUpdate = true;
      s.pts.material.uniforms.uEchelle.value = echelle;
    }
  }
}
