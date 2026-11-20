import * as THREE from 'three';
import {
  DEFAULT_TUNING,
  ISLAND_VISUAL_RADIUS,
  NIGHT1_LANTERNS
} from '../sim/config.js';
import { distXZ } from '../sim/math.js';

const COLOR_SKY_DARK = new THREE.Color('#080a1c');
const COLOR_SKY_WARM = new THREE.Color('#231d3b');
const COLOR_FOG_DARK = new THREE.Color('#0b0e24');
const COLOR_FOG_WARM = new THREE.Color('#2a213d');
const COLOR_AMB_DARK = new THREE.Color('#47528a');
const COLOR_AMB_WARM = new THREE.Color('#b5906e');
const COLOR_DIR_DARK = new THREE.Color('#869ee0');
const COLOR_DIR_WARM = new THREE.Color('#ffd08a');

/**
 * Three.js 3D renderer for Night 1 (Đảo Bến).
 * Strictly reads state from LanternIslandSim without mutating simulation state.
 */
export class IslandRenderer {
  constructor(container) {
    this.container = container;
    this.elapsed = 0;

    this.scene = new THREE.Scene();
    this.scene.background = COLOR_SKY_DARK.clone();
    this.scene.fog = new THREE.FogExp2(COLOR_FOG_DARK.getHex(), 0.017);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.HemisphereLight(COLOR_AMB_DARK, '#171c2b', 0.7);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(COLOR_DIR_DARK, 0.85);
    this.dirLight.position.set(24, 38, 18);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 110;
    const d = 52;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.cloudMeshes = [];
    this.starPoints = null;
    this.lanternViews = new Map();
    this.moteMeshes = new Map();
    this.shadeViews = new Map();
    this.pulseWaves = [];
    this.skyLanterns = [];
    this.wispSparks = [];

    this._buildEnvironment();
    this._buildPlayer();
    this._buildLanterns();
    this._buildGuidingWisps();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _handleResize() {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _buildEnvironment() {
    // Island base
    const islandGeo = new THREE.CylinderGeometry(ISLAND_VISUAL_RADIUS, ISLAND_VISUAL_RADIUS + 2, 2.4, 64);
    const islandMat = new THREE.MeshStandardMaterial({
      color: '#1e2c2f',
      roughness: 0.92,
      metalness: 0.04
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = -1.2;
    island.receiveShadow = true;
    this.scene.add(island);

    // Warm sandy border ring
    const rimGeo = new THREE.RingGeometry(44.5, ISLAND_VISUAL_RADIUS, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#3c3834',
      roughness: 0.95,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    rim.receiveShadow = true;
    this.scene.add(rim);

    // Central stone shrine dais
    const dais = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.8, 0.35, 24),
      new THREE.MeshStandardMaterial({ color: '#45485a', roughness: 0.85 })
    );
    dais.position.y = 0.175;
    dais.receiveShadow = true;
    this.scene.add(dais);

    // Wooden dock (Đảo Bến) extending toward +Z
    const pierGroup = new THREE.Group();
    const plankMat = new THREE.MeshStandardMaterial({ color: '#5c402c', roughness: 0.88 });
    for (let i = 0; i < 6; i += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.1), plankMat);
      plank.position.set(0, 0.12, 44.5 + i * 1.3);
      plank.receiveShadow = true;
      plank.castShadow = true;
      pierGroup.add(plank);
    }
    for (const sx of [-1.4, 1.4]) {
      for (const sz of [45.5, 50.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.2, 8), plankMat);
        post.position.set(sx, 0.2, sz);
        pierGroup.add(post);
      }
    }
    this.scene.add(pierGroup);

    // Stone path pebbles leading from center toward each lantern
    const pebbleMat = new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.9 });
    for (const l of NIGHT1_LANTERNS) {
      const len = Math.hypot(l.pos[0], l.pos[2]);
      const ux = l.pos[0] / len;
      const uz = l.pos[2] / len;
      for (let step = 5; step < len - 3; step += 2.6) {
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.08, 7), pebbleMat);
        stone.position.set(ux * step, 0.03, uz * step);
        stone.receiveShadow = true;
        this.scene.add(stone);
      }
    }

    // Perimeter low-poly pines & rocks
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#473328', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#1b3b36', roughness: 0.85 });
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2 + 0.18;
      if (Math.abs(Math.sin(angle)) < 0.25 && Math.cos(angle) > 0) continue; // Keep dock clear
      const r = 41 + (i % 3) * 1.6;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6), trunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      tree.add(trunk);

      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 7), leafMat);
      cone1.position.y = 2.1;
      cone1.castShadow = true;
      tree.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.9, 7), leafMat);
      cone2.position.y = 3.3;
      cone2.castShadow = true;
      tree.add(cone2);

      tree.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);
      this.scene.add(tree);
    }

    // Sea of clouds below the island
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#2c3259',
      roughness: 1,
      transparent: true,
      opacity: 0.55
    });
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = 56 + (i % 4) * 14;
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + (i % 3) * 2.5, 1), cloudMat);
      cloud.scale.set(1.6, 0.42, 1.3);
      cloud.position.set(Math.cos(angle) * radius, -2.8 - (i % 2) * 1.1, Math.sin(angle) * radius);
      this.cloudMeshes.push({ mesh: cloud, angle, radius, speed: 0.015 + (i % 3) * 0.005 });
      this.scene.add(cloud);
    }

    // Star dome
    const starCount = 360;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.15 + 0.85 * ((i * 0.6180339) % 1));
      const r = 140;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: '#ffeccf', size: 0.75, transparent: true, opacity: 0.8 });
    this.starPoints = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starPoints);
  }

  _buildPlayer() {
    this.playerGroup = new THREE.Group();

    const cloakMat = new THREE.MeshStandardMaterial({ color: '#394878', roughness: 0.75 });
    this.playerBody = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.15, 10), cloakMat);
    this.playerBody.position.y = 0.58;
    this.playerBody.castShadow = true;
    this.playerGroup.add(this.playerBody);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#f3d2b3', roughness: 0.7 })
    );
    head.position.y = 1.28;
    head.castShadow = true;
    this.playerGroup.add(head);

    // Conical Nón Lá
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 0.42, 16),
      new THREE.MeshStandardMaterial({ color: '#e5c687', roughness: 0.85, side: THREE.DoubleSide })
    );
    hat.position.y = 1.56;
    hat.castShadow = true;
    this.playerGroup.add(hat);

    // Hanging miniature lantern on front brim of nón lá
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6),
      new THREE.MeshBasicMaterial({ color: '#402b1c' })
    );
    cord.position.set(0, 1.32, 0.62);
    this.playerGroup.add(cord);

    this.hatLanternMat = new THREE.MeshStandardMaterial({
      color: '#ffce6e',
      emissive: '#ff962e',
      emissiveIntensity: 1.6,
      roughness: 0.4
    });
    this.hatLanternMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 8), this.hatLanternMat);
    this.hatLanternMesh.position.set(0, 1.16, 0.62);
    this.playerGroup.add(this.hatLanternMesh);

    this.playerLight = new THREE.PointLight('#ffab4c', 2.2, 12, 1.6);
    this.playerLight.position.set(0, 1.2, 0.65);
    this.playerGroup.add(this.playerLight);

    this.scene.add(this.playerGroup);
  }

  _buildLanterns() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#4b4e63', roughness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#4d3224', roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#2b2438', roughness: 0.75 });

    for (const l of NIGHT1_LANTERNS) {
      const group = new THREE.Group();
      group.position.set(l.pos[0], 0, l.pos[2]);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.55, 8), stoneMat);
      pedestal.position.y = 0.275;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.7, 8), woodMat);
      post.position.y = 1.6;
      post.castShadow = true;
      group.add(post);

      const coreMat = new THREE.MeshStandardMaterial({
        color: '#4f465e',
        emissive: '#ff9c33',
        emissiveIntensity: 0.05,
        roughness: 0.45
      });
      const lanternBody = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.05, 8), coreMat);
      lanternBody.position.y = 3.2;
      lanternBody.castShadow = true;
      group.add(lanternBody);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 8), roofMat);
      roof.position.y = 3.95;
      group.add(roof);

      const light = new THREE.PointLight('#ffaa44', 0, 20, 1.4);
      light.position.y = 3.2;
      group.add(light);

      // Safe-zone ground ring (radius = safe_radius = 6m)
      const safeRingMat = new THREE.MeshBasicMaterial({
        color: '#ffc66b',
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      const safeRing = new THREE.Mesh(
        new THREE.RingGeometry(DEFAULT_TUNING.safe_radius - 0.14, DEFAULT_TUNING.safe_radius, 48),
        safeRingMat
      );
      safeRing.rotation.x = -Math.PI / 2;
      safeRing.position.y = 0.04;
      group.add(safeRing);

      // Deposit progress ring at foot of lantern
      const progressMat = new THREE.MeshBasicMaterial({
        color: '#ffe08a',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      });
      const progressRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 24), progressMat);
      progressRing.rotation.x = -Math.PI / 2;
      progressRing.position.y = 0.05;
      progressRing.scale.setScalar(0.01);
      group.add(progressRing);

      this.scene.add(group);
      this.lanternViews.set(l.id, { group, coreMat, light, safeRingMat, progressRing, wasLit: false });
    }
  }

  _buildGuidingWisps() {
    const sparkGeo = new THREE.SphereGeometry(0.09, 6, 6);
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#ffe082',
        transparent: true,
        opacity: 0
      });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      this.scene.add(mesh);
      this.wispSparks.push({ mesh, mat, phase: i / 8 });
    }
  }

  triggerPulseFx(pos) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffd97a',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.85, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos[0], 0.12, pos[2]);
    this.scene.add(ring);
    this.pulseWaves.push({ mesh: ring, mat, age: 0, maxAge: 0.55 });
  }

  spawnSkyLantern(pos) {
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#ffbf59',
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 8), mat);
      mesh.position.set(pos[0] + (i - 1) * 0.9, 3.6 + i * 0.4, pos[2] + (i % 2) * 0.6);
      this.scene.add(mesh);
      this.skyLanterns.push({ mesh, mat, age: 0, driftSeed: i * 1.7 });
    }
  }

  _syncMotes(motes) {
    const activeIds = new Set(motes.map((m) => m.id));
    for (const [id, view] of this.moteMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(view.group);
        this.moteMeshes.delete(id);
      }
    }

    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i];
      let view = this.moteMeshes.get(m.id);
      if (!view) {
        const group = new THREE.Group();
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#fff3ad' })
        );
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.46, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ffb84d', transparent: true, opacity: 0.32 })
        );
        const shadowDot = new THREE.Mesh(
          new THREE.CircleGeometry(0.28, 12),
          new THREE.MeshBasicMaterial({ color: '#ffc25c', transparent: true, opacity: 0.3 })
        );
        shadowDot.rotation.x = -Math.PI / 2;
        shadowDot.position.y = 0.03;
        group.add(orb, halo, shadowDot);
        this.scene.add(group);
        view = { group, orb, halo, phase: i * 0.9 };
        this.moteMeshes.set(m.id, view);
      }
      const hoverY = 0.72 + Math.sin(this.elapsed * 3.4 + view.phase) * 0.18;
      view.group.position.set(m.pos[0], 0, m.pos[2]);
      view.orb.position.y = hoverY;
      view.halo.position.y = hoverY;
      const pulseScale = 1 + Math.sin(this.elapsed * 5 + view.phase) * 0.15;
      view.halo.scale.setScalar(pulseScale);
    }
  }

  _syncShades(shades) {
    const activeIds = new Set(shades.map((s) => s.id));
    for (const [id, view] of this.shadeViews.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(view.group);
        this.shadeViews.delete(id);
      }
    }

    for (let i = 0; i < shades.length; i += 1) {
      const s = shades[i];
      let view = this.shadeViews.get(s.id);
      if (!view) {
        const group = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({
          color: '#13091f',
          emissive: '#47156b',
          emissiveIntensity: 0.65,
          roughness: 0.6
        });
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.75, 10), bodyMat);
        body.position.y = 0.88;
        body.castShadow = true;
        group.add(body);

        const eyeMat = new THREE.MeshBasicMaterial({ color: '#e47dff' });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        leftEye.position.set(-0.16, 1.15, 0.34);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        rightEye.position.set(0.16, 1.15, 0.34);
        group.add(leftEye, rightEye);

        const stunRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.05, 6, 16),
          new THREE.MeshBasicMaterial({ color: '#ffe07d' })
        );
        stunRing.rotation.x = Math.PI / 2;
        stunRing.position.y = 1.9;
        stunRing.visible = false;
        group.add(stunRing);

        this.scene.add(group);
        view = { group, body, bodyMat, eyeMat, stunRing, phase: i * 1.4 };
        this.shadeViews.set(s.id, view);
      }

      const hover = Math.sin(this.elapsed * 4.2 + view.phase) * 0.14;
      view.group.position.set(s.pos[0], Math.max(0, s.pos[1] - 1.0) + hover, s.pos[2]);

      if (s.state === 'stunned') {
        view.stunRing.visible = true;
        view.stunRing.rotation.z = this.elapsed * 5;
        view.group.rotation.y += 0.12;
        view.body.scale.set(0.85, 0.72, 0.85);
        view.eyeMat.color.set('#ffd470');
      } else {
        view.stunRing.visible = false;
        view.body.scale.set(1, 1, 1);
        view.eyeMat.color.set(s.state === 'flee' ? '#ff9de8' : '#e47dff');
        const targetAngle = Math.atan2(
          this.playerGroup.position.x - s.pos[0],
          this.playerGroup.position.z - s.pos[2]
        );
        view.group.rotation.y = targetAngle;
      }
    }
  }

  _updateAtmosphere(litCount, dt) {
    const t = litCount / DEFAULT_TUNING.lantern_count_night1;
    this.scene.background.copy(COLOR_SKY_DARK).lerp(COLOR_SKY_WARM, t);
    this.scene.fog.color.copy(COLOR_FOG_DARK).lerp(COLOR_FOG_WARM, t);
    this.scene.fog.density = THREE.MathUtils.lerp(0.017, 0.0085, t);
    this.ambientLight.color.copy(COLOR_AMB_DARK).lerp(COLOR_AMB_WARM, t);
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.65, 1.2, t);
    this.dirLight.color.copy(COLOR_DIR_DARK).lerp(COLOR_DIR_WARM, t);
    this.dirLight.intensity = THREE.MathUtils.lerp(0.85, 1.35, t);

    for (const cloud of this.cloudMeshes) {
      cloud.angle += cloud.speed * dt;
      cloud.mesh.position.x = Math.cos(cloud.angle) * cloud.radius;
      cloud.mesh.position.z = Math.sin(cloud.angle) * cloud.radius;
    }
    if (this.starPoints) {
      this.starPoints.rotation.y += dt * 0.008;
    }
  }

  _updateGuidingWisps(sim) {
    const shouldGuide = sim.player.carried >= sim.tuning.lantern_cost;
    let nearestUnlit = null;
    if (shouldGuide) {
      let bestDist = Infinity;
      for (const l of sim.lanterns) {
        if (l.lit) continue;
        const d = distXZ(sim.player.pos, l.pos);
        if (d < bestDist) {
          bestDist = d;
          nearestUnlit = l;
        }
      }
    }

    for (const w of this.wispSparks) {
      if (!nearestUnlit) {
        w.mat.opacity = 0;
        continue;
      }
      const u = (this.elapsed * 0.75 + w.phase) % 1;
      const dx = nearestUnlit.pos[0] - sim.player.pos[0];
      const dz = nearestUnlit.pos[2] - sim.player.pos[2];
      const d = Math.max(0.1, Math.hypot(dx, dz));
      const span = Math.min(7.5, d);
      const ux = dx / d;
      const uz = dz / d;

      w.mesh.position.set(
        sim.player.pos[0] + ux * (1.2 + u * span),
        1.15 + Math.sin(u * Math.PI) * 0.65,
        sim.player.pos[2] + uz * (1.2 + u * span)
      );
      w.mat.opacity = Math.sin(u * Math.PI) * 0.85;
    }
  }

  _updateEffects(dt) {
    for (let i = this.pulseWaves.length - 1; i >= 0; i -= 1) {
      const wave = this.pulseWaves[i];
      wave.age += dt;
      const p = wave.age / wave.maxAge;
      if (p >= 1) {
        this.scene.remove(wave.mesh);
        wave.mat.dispose();
        wave.mesh.geometry.dispose();
        this.pulseWaves.splice(i, 1);
      } else {
        const s = 1 + p * (DEFAULT_TUNING.pulse_radius * 1.15);
        wave.mesh.scale.set(s, s, 1);
        wave.mat.opacity = (1 - p) * 0.85;
      }
    }

    for (let i = this.skyLanterns.length - 1; i >= 0; i -= 1) {
      const sl = this.skyLanterns[i];
      sl.age += dt;
      sl.mesh.position.y += dt * 1.9;
      sl.mesh.position.x += Math.sin(this.elapsed * 1.4 + sl.driftSeed) * dt * 0.5;
      sl.mat.opacity = Math.max(0, 1 - sl.age / 9);
      if (sl.age >= 9) {
        this.scene.remove(sl.mesh);
        sl.mat.dispose();
        sl.mesh.geometry.dispose();
        this.skyLanterns.splice(i, 1);
      }
    }
  }

  render(sim, camYawDeg, dt) {
    this.elapsed += dt;

    // Player visual sync
    const p = sim.player.pos;
    this.playerGroup.position.set(p[0], p[1], p[2]);
    this.playerGroup.rotation.y = (sim.player.facingYawDeg * Math.PI) / 180;
    this.playerLight.intensity = 1.6 + sim.player.carried * 0.55;
    this.hatLanternMat.emissiveIntensity = 1.2 + sim.player.carried * 0.3;

    if (sim.player.invulnTicks > 0) {
      this.playerGroup.visible = Math.floor(sim.player.invulnTicks / 4) % 2 === 0;
    } else {
      this.playerGroup.visible = true;
    }

    // Lantern visual sync
    let litCount = 0;
    for (const l of sim.lanterns) {
      const view = this.lanternViews.get(l.id);
      if (!view) continue;
      if (l.lit) {
        litCount += 1;
        view.coreMat.color.set('#ffe49e');
        view.coreMat.emissiveIntensity = 1.85;
        view.light.intensity = 4.6;
        view.safeRingMat.opacity = 0.28 + Math.sin(this.elapsed * 2.5) * 0.06;
        view.progressRing.scale.setScalar(0.01);
        if (!view.wasLit) {
          view.wasLit = true;
          this.spawnSkyLantern(l.pos);
        }
      } else {
        view.wasLit = false;
        const frac = l.deposited / sim.tuning.lantern_cost;
        view.coreMat.color.set('#4f465e');
        view.coreMat.emissiveIntensity = 0.08 + frac * 0.7;
        view.light.intensity = frac * 1.4;
        view.safeRingMat.opacity = 0;
        view.progressRing.scale.setScalar(frac > 0 ? 0.4 + frac * 0.9 : 0.01);
      }
    }

    this._syncMotes(sim.motes);
    this._syncShades(sim.shades);
    this._updateAtmosphere(litCount, dt);
    this._updateGuidingWisps(sim);
    this._updateEffects(dt);

    // Camera aligned with Contract C yaw (+theta orbits camera from +Z toward +X)
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.2;
    this.camera.position.set(
      p[0] + Math.sin(theta) * camDist,
      p[1] + camHeight,
      p[2] + Math.cos(theta) * camDist
    );
    this.camera.lookAt(p[0], p[1] + 1.35, p[2]);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
