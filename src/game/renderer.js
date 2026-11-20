import * as THREE from 'three';
import {
  COLORBLIND_PALETTE,
  DEFAULT_TUNING,
  FUEL_MAX_60,
  LOW_FUEL_60,
  PALETTE
} from '../sim/config.js';
import { getMapConfig, getSurfaceHeight } from '../sim/maps.js';
import { distXZ } from '../sim/math.js';
import {
  getGlowTexture,
  getGrassTextures,
  getSandTextures,
  getStoneTextures,
  getWoodTextures
} from './textures.js';

/**
 * Three.js WebGL renderer supporting all 3 standardized islands, procedural PBR textures,
 * instanced motes/shades, reduced-motion accessibility, and deterministic benchmark mode.
 */
export class IslandRenderer {
  constructor(container, { benchMode = false, reducedMotion = false } = {}) {
    this.container = container;
    this.benchMode = Boolean(benchMode);
    this.reducedMotion = Boolean(reducedMotion);
    this.elapsed = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.skyNight);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0135);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      300
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    this.renderer.setPixelRatio(this.benchMode ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);

    // Exact TICKET-02 ambient formula base (0.15 + 0.55 * litRatio)
    this.ambientLight = new THREE.AmbientLight('#ffe9c9', 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight('#90a6e0', PALETTE.cloudSea, 0.48);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#ffd7a3', 0.95);
    this.dirLight.position.set(32, 48, 24);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 150;
    const d = 66;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.cloudMeshes = [];
    this.starPoints = null;
    this.windLeaves = [];
    this.lanternViews = new Map();
    this.drifterViews = new Map();
    this.charmViews = new Map();
    this.pulseWaves = [];
    this.skyLanterns = [];
    this.particles = [];
    this.wispSparks = [];
    this.grassTufts = null;
    this.grassMeta = [];
    this.bellMesh = null;
    this.colorblindMode = false;

    this._maxMotes = 256;
    this._maxShades = 256;
    this.moteOrbInst = null;
    this.moteHaloInst = null;
    this.shadeBodyInst = null;
    this.shadeBodyMat = null;
    this.shadeEyeInst = null;
    this.shadeEyeMat = null;
    this.shadeStunInst = null;

    this._camPos = new THREE.Vector3(0, 8, -12);
    this._camTarget = new THREE.Vector3(0, 1.4, 0);
    this._desiredPos = new THREE.Vector3();
    this._desiredTarget = new THREE.Vector3();
    this._overrideLookAt = new THREE.Vector3();
    this._projVec = new THREE.Vector3();
    this._camInitialized = false;
    this._shakeTrauma = 0;
    this._walkPhase = 0;
    this._wasGrounded = true;
    this._dashFxAccum = 0;
    this._dummy = new THREE.Object3D();
    this._eyeDummy = new THREE.Object3D();
    this._stunDummy = new THREE.Object3D();
    this._colShadeNormal = new THREE.Color(PALETTE.shadeBody);
    this._colShadeStunned = new THREE.Color(PALETTE.shadeStunned);
    this._colShadeDrain = new THREE.Color('#4c286e');

    this._buildSkyAndClouds();
    this._buildPlayer();
    this._initEntityPools();
    this._buildGuidingWisps();
    this._buildWindLeaves();
    this.rebuildMap(1);

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

  _buildSkyAndClouds() {
    const seaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(240, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.cloudSea, transparent: true, opacity: 0.72 })
    );
    seaFloor.rotation.x = -Math.PI / 2;
    seaFloor.position.y = -11.2;
    this.scene.add(seaFloor);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    moon.position.set(80, 96, 60);
    this.scene.add(moon);

    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(PALETTE.lanternCore, '#44588a'),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    moonHalo.position.copy(moon.position);
    moonHalo.scale.set(34, 34, 1);
    this.scene.add(moonHalo);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      roughness: 0.96,
      transparent: true,
      opacity: 0.68
    });
    for (let i = 0; i < 34; i += 1) {
      const angle = (i / 34) * Math.PI * 2;
      const radius = 56 + (i % 6) * 16;
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(7.2 + (i % 3) * 2.5, 1), cloudMat);
      cloud.scale.set(1.85, 0.36, 1.45);
      cloud.position.set(Math.cos(angle) * radius, -5.8 - (i % 3) * 1.6, Math.sin(angle) * radius);
      this.cloudMeshes.push({ mesh: cloud, angle, radius, speed: 0.011 + (i % 3) * 0.004 });
      this.scene.add(cloud);
    }

    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.1 + 0.9 * ((i * 0.6180339) % 1));
      const r = 175;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: PALETTE.uiText, size: 0.8, transparent: true, opacity: 0.85 })
    );
    this.scene.add(this.starPoints);
  }

  _buildPlayer() {
    this.playerGroup = new THREE.Group();
    this.playerVisual = new THREE.Group();
    this.playerGroup.add(this.playerVisual);

    const cloakMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.72 });
    this.playerBody = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.12, 12), cloakMat);
    this.playerBody.position.y = 0.56;
    this.playerBody.castShadow = true;
    this.playerVisual.add(this.playerBody);

    const scarfMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.65 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 8, 14), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.07;
    this.playerVisual.add(scarf);

    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.45), scarfMat);
    this.scarfTail.position.set(0, 1.0, -0.32);
    this.scarfTail.castShadow = true;
    this.playerVisual.add(this.scarfTail);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 14, 12),
      new THREE.MeshStandardMaterial({ color: '#f3d2b3', roughness: 0.68 })
    );
    head.position.y = 1.28;
    head.castShadow = true;
    this.playerVisual.add(head);

    const sandTex = getSandTextures();
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.76, 0.4, 20),
      new THREE.MeshStandardMaterial({
        map: sandTex.map,
        bumpMap: sandTex.bumpMap,
        bumpScale: 0.03,
        roughness: 0.84,
        side: THREE.DoubleSide
      })
    );
    hat.position.y = 1.56;
    hat.castShadow = true;
    this.playerVisual.add(hat);

    this.hatLanternPivot = new THREE.Group();
    this.hatLanternPivot.position.set(0, 1.44, 0.62);
    this.playerVisual.add(this.hatLanternPivot);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.wood })
    );
    cord.position.set(0, -0.12, 0);
    this.hatLanternPivot.add(cord);

    this.hatLanternMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternLit,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 1.5,
      roughness: 0.35
    });
    const hatLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 8), this.hatLanternMat);
    hatLantern.position.set(0, -0.28, 0);
    this.hatLanternPivot.add(hatLantern);

    const hatGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(PALETTE.lanternCore, PALETTE.lanternLit),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    hatGlow.position.set(0, -0.28, 0);
    hatGlow.scale.set(0.9, 0.9, 1);
    this.hatLanternPivot.add(hatGlow);

    this.playerLight = new THREE.PointLight(PALETTE.lanternLit, 2.4, 15, 1.45);
    this.playerLight.position.set(0, 1.2, 0.65);
    this.playerGroup.add(this.playerLight);

    this.scene.add(this.playerGroup);
  }

  _initEntityPools() {
    this._allocateMotePool(this._maxMotes);
    this._allocateShadePool(this._maxShades);
  }

  _allocateMotePool(cap) {
    if (this.moteOrbInst) {
      this.scene.remove(this.moteOrbInst);
      this.moteOrbInst.geometry.dispose();
      this.moteOrbInst.material.dispose();
    }
    if (this.moteHaloInst) {
      this.scene.remove(this.moteHaloInst);
      this.moteHaloInst.geometry.dispose();
      this.moteHaloInst.material.dispose();
    }
    this._maxMotes = cap;

    const haloTex = getGlowTexture(PALETTE.moteCore, PALETTE.moteHalo);
    this.moteOrbInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.19, 8, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
      cap
    );
    this.moteOrbInst.frustumCulled = false;
    this.moteOrbInst.count = 0;

    this.moteHaloInst = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      cap
    );
    this.moteHaloInst.frustumCulled = false;
    this.moteHaloInst.count = 0;

    this.scene.add(this.moteOrbInst, this.moteHaloInst);
  }

  _allocateShadePool(cap) {
    if (this.shadeBodyInst) {
      this.scene.remove(this.shadeBodyInst, this.shadeEyeInst, this.shadeStunInst);
      this.shadeBodyInst.geometry.dispose();
      this.shadeBodyMat.dispose();
      this.shadeEyeInst.geometry.dispose();
      this.shadeEyeMat.dispose();
      this.shadeStunInst.geometry.dispose();
      this.shadeStunInst.material.dispose();
    }
    this._maxShades = cap;

    const rimHex = this.colorblindMode ? COLORBLIND_PALETTE.shadeRim : PALETTE.shadeRim;
    const bodyGeo = new THREE.ConeGeometry(0.65, 1.7, 10);
    bodyGeo.translate(0, 0.85, 0);
    this.shadeBodyMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: rimHex,
      emissiveIntensity: 0.75,
      roughness: 0.55
    });
    this.shadeBodyInst = new THREE.InstancedMesh(bodyGeo, this.shadeBodyMat, cap);
    this.shadeBodyInst.castShadow = true;
    this.shadeBodyInst.frustumCulled = false;
    for (let i = 0; i < cap; i += 1) {
      this.shadeBodyInst.setColorAt(i, this._colShadeNormal);
    }
    if (this.shadeBodyInst.instanceColor) {
      this.shadeBodyInst.instanceColor.needsUpdate = true;
    }
    this.shadeBodyInst.count = 0;

    this.shadeEyeMat = new THREE.MeshBasicMaterial({ color: rimHex });
    this.shadeEyeInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 6), this.shadeEyeMat, cap * 2);
    this.shadeEyeInst.frustumCulled = false;
    this.shadeEyeInst.count = 0;

    this.shadeStunInst = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.55, 0.05, 6, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent }),
      cap
    );
    this.shadeStunInst.frustumCulled = false;
    this.shadeStunInst.count = 0;

    this.scene.add(this.shadeBodyInst, this.shadeEyeInst, this.shadeStunInst);
  }

  _buildGuidingWisps() {
    if (this.benchMode) return;
    const sparkTex = getGlowTexture(PALETTE.moteCore, PALETTE.goldAccent);
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.SpriteMaterial({
        map: sparkTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.35, 0.35, 1);
      this.scene.add(sprite);
      this.wispSparks.push({ mesh: sprite, mat, phase: i / 8 });
    }
  }

  _buildWindLeaves() {
    if (this.benchMode) return;
    const leafGeo = new THREE.PlaneGeometry(0.34, 0.16);
    for (let i = 0; i < 36; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: PALETTE.sand,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0
      });
      const mesh = new THREE.Mesh(leafGeo, mat);
      mesh.position.set(((i % 6) - 2.5) * 14, 1 + (i % 5) * 1.4, (Math.floor(i / 6) - 2.5) * 14);
      this.scene.add(mesh);
      this.windLeaves.push({ mesh, phase: i * 0.7 });
    }
  }

  _clearMapMeshes() {
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.lanternViews.clear();
    this.grassTufts = null;
    this.grassMeta = [];
    this.bellMesh = null;

    if (this.moteOrbInst) this.moteOrbInst.count = 0;
    if (this.moteHaloInst) this.moteHaloInst.count = 0;
    if (this.shadeBodyInst) this.shadeBodyInst.count = 0;
    if (this.shadeEyeInst) this.shadeEyeInst.count = 0;
    if (this.shadeStunInst) this.shadeStunInst.count = 0;

    for (const view of this.drifterViews.values()) this.scene.remove(view.group);
    this.drifterViews.clear();
    for (const view of this.charmViews.values()) this.scene.remove(view.group);
    this.charmViews.clear();
  }

  _addIslandDisc(cx, cz, radius, topY, thickness = 2.2) {
    const grassTex = getGrassTextures();
    const sandTex = getSandTextures();
    const stoneTex = getStoneTextures();

    const grassMat = new THREE.MeshStandardMaterial({
      map: grassTex.map,
      bumpMap: grassTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.9
    });
    const cliffMat = new THREE.MeshStandardMaterial({
      map: stoneTex.map,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.12,
      roughness: 0.92
    });
    const sandMat = new THREE.MeshStandardMaterial({
      map: sandTex.map,
      bumpMap: sandTex.bumpMap,
      bumpScale: 0.06,
      roughness: 0.94
    });

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 1.4, thickness, 60),
      [cliffMat, grassMat, cliffMat]
    );
    disc.position.set(cx, topY - thickness / 2, cz);
    disc.receiveShadow = true;
    disc.castShadow = true;
    this.worldGroup.add(disc);

    const rim = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.5, radius - 2.3), radius, 60), sandMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(cx, topY + 0.02, cz);
    rim.receiveShadow = true;
    this.worldGroup.add(rim);
  }

  _buildInstancedGrass(map) {
    if (this.benchMode) return;
    const spots = [];
    const maxR = map.night === 3 ? 42 : map.night === 2 ? 25 : 37;
    const centers = map.night === 2 ? [[0, 0], [70, 0]] : [[0, 0]];
    let seed = map.night * 97 + 13;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (const [cx, cz] of centers) {
      for (let i = 0; i < 120; i += 1) {
        const ang = nextRand() * Math.PI * 2;
        const rad = 2.5 + Math.sqrt(nextRand()) * (maxR - 4);
        const gx = cx + Math.cos(ang) * rad;
        const gz = cz + Math.sin(ang) * rad;
        const h = getSurfaceHeight(map, gx, gz);
        if (h === null || (h > 0.01 && h < 2.99)) continue;
        if (map.night === 3 && Math.hypot(gx, gz) < 2.6) continue;
        spots.push({
          x: gx,
          y: h,
          z: gz,
          rotY: nextRand() * Math.PI * 2,
          scale: 0.75 + nextRand() * 0.65,
          phase: nextRand() * Math.PI * 2
        });
      }
    }

    if (spots.length === 0) return;
    const bladeGeo = new THREE.ConeGeometry(0.11, 0.42, 4);
    bladeGeo.translate(0, 0.21, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.88 });
    this.grassTufts = new THREE.InstancedMesh(bladeGeo, bladeMat, spots.length);
    this.grassTufts.receiveShadow = true;
    this.grassMeta = spots;

    for (let i = 0; i < spots.length; i += 1) {
      const s = spots[i];
      this._dummy.position.set(s.x, s.y, s.z);
      this._dummy.rotation.set(0, s.rotY, 0);
      this._dummy.scale.setScalar(s.scale);
      this._dummy.updateMatrix();
      this.grassTufts.setMatrixAt(i, this._dummy.matrix);
    }
    this.grassTufts.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(this.grassTufts);
  }

  _addJumpPadMesh(pad) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius, pad.radius * 1.18, 0.18, 24),
      new THREE.MeshStandardMaterial({
        color: PALETTE.goldAccent,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 0.95
      })
    );
    mesh.position.set(pad.pos[0], pad.pos[1] + 0.09, pad.pos[2]);
    this.worldGroup.add(mesh);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(PALETTE.lanternCore, PALETTE.lanternLit),
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.position.set(pad.pos[0], pad.pos[1] + 0.85, pad.pos[2]);
    glow.scale.set(2.8, 2.8, 1);
    this.worldGroup.add(glow);
  }

  rebuildMap(night) {
    this._clearMapMeshes();
    this._camInitialized = false;
    const map = getMapConfig(night);
    const woodTex = getWoodTextures();
    const stoneTex = getStoneTextures();
    const grassTex = getGrassTextures();

    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex.map,
      bumpMap: woodTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.84
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      map: stoneTex.map,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.1,
      roughness: 0.88
    });

    if (night === 1) {
      this._addIslandDisc(0, 0, 40, 0, 2.6);

      const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.3, 0.24, 16), stoneMat);
      dais.position.y = 0.12;
      dais.receiveShadow = true;
      this.worldGroup.add(dais);

      for (let i = 0; i < 6; i += 1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.0), woodMat);
        plank.position.set(0, 0.09, 36.5 + i * 1.15);
        plank.receiveShadow = true;
        plank.castShadow = true;
        this.worldGroup.add(plank);
      }
      for (const sx of [-1.5, 1.5]) {
        for (const sz of [37.5, 42.2]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.2, 8), woodMat);
          post.position.set(sx, 0.6, sz);
          post.castShadow = true;
          this.worldGroup.add(post);
        }
      }
    } else if (night === 2) {
      this._addIslandDisc(0, 0, 28, 0, 2.6);
      this._addIslandDisc(70, 0, 28, 0, 2.6);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.28, 4.0), woodMat);
      bridge.position.set(35, -0.1, 0);
      bridge.receiveShadow = true;
      bridge.castShadow = true;
      this.worldGroup.add(bridge);

      for (const rz of [-2.12, 2.12]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.12), woodMat);
        rail.position.set(35, 0.42, rz);
        rail.castShadow = true;
        this.worldGroup.add(rail);
        for (let bx = 27; bx <= 43; bx += 4) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65, 6), woodMat);
          post.position.set(bx, 0.25, rz);
          this.worldGroup.add(post);
        }
      }

      const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.82 });
      for (const cx of [0, 70]) {
        for (let i = 0; i < 7; i += 1) {
          const ang = (i / 7) * Math.PI * 2 + 0.35;
          const x = cx + Math.cos(ang) * 24;
          const z = Math.sin(ang) * 24;
          if (Math.abs(z) < 4.5 && (cx === 0 ? x > 19 : x < 51)) continue;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 5.8, 8), woodMat);
          trunk.position.set(x, 2.9, z);
          trunk.castShadow = true;
          const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.4, 7), leafMat);
          crown1.position.set(x, 5.8, z);
          crown1.castShadow = true;
          const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.3, 7), leafMat);
          crown2.position.set(x, 6.65, z);
          crown2.castShadow = true;
          this.worldGroup.add(trunk, crown1, crown2);
        }
      }
    } else if (night === 3) {
      this._addIslandDisc(0, 0, 45, 0, 2.6);

      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      const tier1Geo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: false, curveSegments: 40 });
      const tier1GrassMat = new THREE.MeshStandardMaterial({
        map: grassTex.map,
        bumpMap: grassTex.bumpMap,
        bumpScale: 0.08,
        roughness: 0.9
      });
      const tier1Mesh = new THREE.Mesh(tier1Geo, [tier1GrassMat, stoneMat]);
      tier1Mesh.rotation.x = Math.PI / 2;
      tier1Mesh.position.y = 3.0;
      tier1Mesh.receiveShadow = true;
      tier1Mesh.castShadow = true;
      this.worldGroup.add(tier1Mesh);

      this._addIslandDisc(0, 0, 8, 6, 6.0);

      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const len = Math.hypot(6, 3);
        const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 3.0), woodMat);
        const midR = 27;
        rampMesh.position.set(midR * Math.cos(rad), 1.35, midR * Math.sin(rad));
        rampMesh.rotation.order = 'YXZ';
        rampMesh.rotation.y = -rad;
        rampMesh.rotation.z = -Math.atan2(3, 6);
        rampMesh.receiveShadow = true;
        rampMesh.castShadow = true;
        this.worldGroup.add(rampMesh);

        const nx = -Math.sin(rad);
        const nz = Math.cos(rad);
        for (const side of [-1.72, 1.72]) {
          for (const rr of [24.6, 29.6]) {
            const h = 3 * ((30 - rr) / 6);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), woodMat);
            post.position.set(rr * Math.cos(rad) + nx * side, h + 0.45, rr * Math.sin(rad) + nz * side);
            post.castShadow = true;
            this.worldGroup.add(post);
          }
        }
      }

      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.0, 8.0, 20), stoneMat);
      tower.position.set(0, 10.0, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      const bellRoof = new THREE.Mesh(
        new THREE.ConeGeometry(2.75, 2.3, 16),
        new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.68 })
      );
      bellRoof.position.set(0, 15.1, 0);
      bellRoof.castShadow = true;
      this.bellMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.68, 1.05, 14),
        new THREE.MeshStandardMaterial({
          color: PALETTE.goldAccent,
          emissive: PALETTE.lanternLit,
          emissiveIntensity: 0.45,
          metalness: 0.55,
          roughness: 0.35
        })
      );
      this.bellMesh.position.set(0, 13.4, 0);
      this.worldGroup.add(tower, bellRoof, this.bellMesh);
    }

    this._buildInstancedGrass(map);

    for (const pad of map.jumpPads) {
      this._addJumpPadMesh(pad);
    }

    const roofMat = new THREE.MeshStandardMaterial({ color: '#2b2438', roughness: 0.72 });
    const lanternGlowTex = getGlowTexture(PALETTE.lanternCore, PALETTE.lanternLit);
    for (const l of map.lanterns) {
      const group = new THREE.Group();
      group.position.set(l.pos[0], l.pos[1], l.pos[2]);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.5, 8), stoneMat);
      pedestal.position.y = 0.25;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.5, 8), woodMat);
      post.position.y = 1.5;
      post.castShadow = true;
      group.add(post);

      const coreMat = new THREE.MeshStandardMaterial({
        color: PALETTE.lanternUnlit,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 0.05,
        roughness: 0.42
      });
      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 2.5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.0, 8), coreMat);
      body.position.y = 0.5;
      body.castShadow = true;
      bodyGroup.add(body);

      const tearMat = new THREE.MeshBasicMaterial({ color: '#1b1d28' });
      const tears = [];
      for (let t = 0; t < 3; t += 1) {
        const ang = (t / 3) * Math.PI * 2;
        const tear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.04), tearMat);
        tear.position.set(Math.sin(ang) * 0.47, 0.5, Math.cos(ang) * 0.47);
        tear.rotation.y = ang;
        tear.rotation.z = 0.35;
        bodyGroup.add(tear);
        tears.push(tear);
      }
      group.add(bodyGroup);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.58, 8), roofMat);
      roof.position.y = 3.74;
      roof.castShadow = true;
      group.add(roof);

      const fuelBarGroup = new THREE.Group();
      fuelBarGroup.position.y = 4.45;
      fuelBarGroup.visible = false;
      const fuelBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.44, 0.2),
        new THREE.MeshBasicMaterial({ color: '#0e1430', side: THREE.DoubleSide })
      );
      const fuelFillMat = new THREE.MeshBasicMaterial({
        color: PALETTE.goldAccent,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide
      });
      const fuelFill = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.13), fuelFillMat);
      fuelFill.position.z = 0.01;
      fuelBarGroup.add(fuelBg, fuelFill);
      group.add(fuelBarGroup);

      const light = new THREE.PointLight(PALETTE.lanternLit, 0, 22, 1.35);
      light.position.y = 3.0;
      group.add(light);

      const haloMat = new THREE.SpriteMaterial({
        map: lanternGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const haloSprite = new THREE.Sprite(haloMat);
      haloSprite.position.y = 3.0;
      haloSprite.scale.set(4.5, 4.5, 1);
      group.add(haloSprite);

      const safeRingMat = new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const safeRing = new THREE.Mesh(
        new THREE.RingGeometry(DEFAULT_TUNING.safe_radius - 0.14, DEFAULT_TUNING.safe_radius, 52),
        safeRingMat
      );
      safeRing.rotation.x = -Math.PI / 2;
      safeRing.position.y = 0.05;
      group.add(safeRing);

      const progressRing = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.2, 24),
        new THREE.MeshBasicMaterial({
          color: PALETTE.lanternCore,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide
        })
      );
      progressRing.rotation.x = -Math.PI / 2;
      progressRing.position.y = 0.06;
      progressRing.scale.setScalar(0.01);
      group.add(progressRing);

      this.worldGroup.add(group);
      this.lanternViews.set(l.id, {
        group,
        bodyGroup,
        tears,
        coreMat,
        light,
        haloMat,
        safeRingMat,
        progressRing,
        fuelBarGroup,
        fuelFill,
        fuelFillMat,
        wasLit: false
      });
    }
  }

  setColorblindMode(enabled) {
    this.colorblindMode = Boolean(enabled);
    const rimHex = this.colorblindMode ? COLORBLIND_PALETTE.shadeRim : PALETTE.shadeRim;
    if (this.shadeBodyMat) this.shadeBodyMat.emissive.set(rimHex);
    if (this.shadeEyeMat) this.shadeEyeMat.color.set(rimHex);
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    if (this.reducedMotion) {
      this._shakeTrauma = 0;
    }
  }

  getRendererDescription() {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return `Three.js 0.170.0 / WebGL2 (${String(gpu || 'WebGL')})`;
    } catch {
      return 'Three.js 0.170.0 / WebGL2';
    }
  }

  triggerShake(amount = 0.4) {
    if (this.reducedMotion) return;
    this._shakeTrauma = Math.min(1, this._shakeTrauma + amount);
  }

  triggerPulseFx(pos) {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldAccent,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.75, 44), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos[0], pos[1] + 0.25, pos[2]);
    this.scene.add(ring);
    this.pulseWaves.push({ mesh: ring, mat, age: 0, maxAge: 0.45 });
  }

  spawnSkyLantern(pos) {
    if (this.benchMode) return;
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 8), mat);
      mesh.position.set(pos[0] + (i - 1) * 0.9, pos[1] + 3.5 + i * 0.4, pos[2] + (i % 2) * 0.6);
      this.scene.add(mesh);
      this.skyLanterns.push({ mesh, mat, age: 0, driftSeed: i * 1.7 });
    }
  }

  _spawnBurstParticles(pos, colorHex, count = 6, speed = 2.2) {
    if (this.benchMode) return;
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    for (let i = 0; i < count; i += 1) {
      const ang = (i / count) * Math.PI * 2 + this.elapsed;
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos[0], pos[1] + 0.12, pos[2]);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vx: Math.cos(ang) * speed,
        vy: 0.9 + (i % 2) * 0.6,
        vz: Math.sin(ang) * speed,
        age: 0,
        maxAge: 0.42
      });
    }
  }

  _syncMotes(motes) {
    if (motes.length > this._maxMotes) {
      this._allocateMotePool(Math.max(motes.length + 64, this._maxMotes * 2));
    }

    let count = 0;
    const blinkPhase = Math.floor(this.elapsed * 10) % 2 === 0;
    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i];
      if (m.kind === 'dropped' && m.ttlTicks !== null && m.ttlTicks < 150 && !blinkPhase) {
        continue;
      }
      const hoverY = 0.72 + Math.sin(this.elapsed * 3.6 + i * 0.85) * 0.16;
      this._dummy.position.set(m.pos[0], m.pos[1] + hoverY, m.pos[2]);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.setScalar(1);
      this._dummy.updateMatrix();
      this.moteOrbInst.setMatrixAt(count, this._dummy.matrix);

      this._dummy.quaternion.copy(this.camera.quaternion);
      this._dummy.updateMatrix();
      this.moteHaloInst.setMatrixAt(count, this._dummy.matrix);
      count += 1;
    }

    this.moteOrbInst.count = count;
    this.moteOrbInst.instanceMatrix.needsUpdate = true;
    this.moteHaloInst.count = count;
    this.moteHaloInst.instanceMatrix.needsUpdate = true;
  }

  _syncShades(shades) {
    if (shades.length > this._maxShades) {
      this._allocateShadePool(Math.max(shades.length + 64, this._maxShades * 2));
    }

    const px = this.playerGroup.position.x;
    const pz = this.playerGroup.position.z;
    let bodyCount = 0;
    let eyeCount = 0;
    let stunCount = 0;

    for (let i = 0; i < shades.length; i += 1) {
      const s = shades[i];
      const hover = Math.sin(this.elapsed * 4 + i * 1.3) * 0.1;
      const gx = s.pos[0];
      const gy = Math.max(0, s.pos[1] - 0.8) + hover;
      const gz = s.pos[2];

      let sx = 1;
      let sy = 1;
      let sz = 1;
      let rotY = Math.atan2(px - gx, pz - gz);
      let tint = this._colShadeNormal;

      if (s.state === 'spawning') {
        const sc = Math.max(0.15, 1 - s.stateTicksLeft / 30);
        sx = sc;
        sy = sc;
        sz = sc;
      } else if (s.state === 'stunned') {
        sx = 0.9;
        sy = 0.75;
        sz = 0.9;
        rotY = this.elapsed * 7 + i * 0.9;
        tint = this._colShadeStunned;

        this._stunDummy.position.set(gx, gy + 1.9 * sy, gz);
        this._stunDummy.rotation.set(Math.PI / 2, 0, this.elapsed * 5 + i);
        this._stunDummy.scale.setScalar(1);
        this._stunDummy.updateMatrix();
        this.shadeStunInst.setMatrixAt(stunCount++, this._stunDummy.matrix);
      } else if (s.state === 'drain') {
        sx = 1.05;
        sy = 1.08;
        sz = 1.05;
        tint = this._colShadeDrain;
      }

      this._dummy.position.set(gx, gy, gz);
      this._dummy.rotation.set(0, rotY, 0);
      this._dummy.scale.set(sx, sy, sz);
      this._dummy.updateMatrix();
      this.shadeBodyInst.setMatrixAt(bodyCount, this._dummy.matrix);
      this.shadeBodyInst.setColorAt(bodyCount, tint);
      bodyCount += 1;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const eyeScale = Math.min(sx, sy);
      const ey = gy + 1.15 * sy;

      this._eyeDummy.rotation.set(0, 0, 0);
      this._eyeDummy.scale.setScalar(eyeScale);

      // Left eye (-0.15, 1.15, 0.34) rotated around Y
      this._eyeDummy.position.set(
        gx + sx * (-0.15 * cosY + 0.34 * sinY),
        ey,
        gz + sz * (0.15 * sinY + 0.34 * cosY)
      );
      this._eyeDummy.updateMatrix();
      this.shadeEyeInst.setMatrixAt(eyeCount++, this._eyeDummy.matrix);

      // Right eye (+0.15, 1.15, 0.34) rotated around Y
      this._eyeDummy.position.set(
        gx + sx * (0.15 * cosY + 0.34 * sinY),
        ey,
        gz + sz * (-0.15 * sinY + 0.34 * cosY)
      );
      this._eyeDummy.updateMatrix();
      this.shadeEyeInst.setMatrixAt(eyeCount++, this._eyeDummy.matrix);
    }

    this.shadeBodyInst.count = bodyCount;
    this.shadeBodyInst.instanceMatrix.needsUpdate = true;
    if (this.shadeBodyInst.instanceColor) this.shadeBodyInst.instanceColor.needsUpdate = true;

    this.shadeEyeInst.count = eyeCount;
    this.shadeEyeInst.instanceMatrix.needsUpdate = true;

    this.shadeStunInst.count = stunCount;
    this.shadeStunInst.instanceMatrix.needsUpdate = true;
  }

  _syncDrifters(drifters) {
    const activeIds = new Set(drifters.map((d) => d.id));
    for (const [id, view] of this.drifterViews.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(view.group);
        this.drifterViews.delete(id);
      }
    }

    for (let i = 0; i < drifters.length; i += 1) {
      const d = drifters[i];
      let view = this.drifterViews.get(d.id);
      if (!view) {
        const group = new THREE.Group();
        const ribbonMat = new THREE.MeshStandardMaterial({
          color: PALETTE.drifter,
          emissive: '#3c556e',
          emissiveIntensity: 0.55,
          side: THREE.DoubleSide
        });
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 1.85), ribbonMat);
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.19, 8, 8),
          new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
        );
        orb.position.set(0, -0.35, 0);
        orb.visible = false;
        group.add(ribbon, orb);
        this.scene.add(group);
        view = { group, ribbon, orb, phase: i * 1.1 };
        this.drifterViews.set(d.id, view);
      }

      view.group.position.set(d.pos[0], d.pos[1] + Math.sin(this.elapsed * 5 + view.phase) * 0.25, d.pos[2]);
      view.ribbon.rotation.z = Math.sin(this.elapsed * 7 + view.phase) * 0.35;
      view.orb.visible = d.stolen > 0;
    }
  }

  _syncCharms(charms) {
    const activeIds = new Set(charms.map((c) => c.id));
    for (const [id, view] of this.charmViews.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(view.group);
        this.charmViews.delete(id);
      }
    }

    for (const c of charms) {
      let view = this.charmViews.get(c.id);
      if (!view) {
        const group = new THREE.Group();
        const card = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.8, 0.08),
          new THREE.MeshStandardMaterial({
            color: PALETTE.mayScarf,
            emissive: PALETTE.mayScarf,
            emissiveIntensity: 0.38
          })
        );
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.88, 0.05),
          new THREE.MeshStandardMaterial({
            color: PALETTE.goldAccent,
            emissive: PALETTE.goldAccent,
            emissiveIntensity: 0.35
          })
        );
        group.add(trim, card);
        this.scene.add(group);
        view = { group };
        this.charmViews.set(c.id, view);
      }
      view.group.visible = c.available;
      view.group.position.set(c.pos[0], c.pos[1] + 0.9 + Math.sin(this.elapsed * 3) * 0.14, c.pos[2]);
      view.group.rotation.y = this.elapsed * 2.1;
    }
  }

  projectToScreen(worldPos, yOffset = 2.4) {
    this._projVec.set(worldPos[0], worldPos[1] + yOffset, worldPos[2]);
    this._projVec.project(this.camera);
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    const behind = this._projVec.z > 1;
    let sx = (this._projVec.x * 0.5 + 0.5) * w;
    let sy = (-this._projVec.y * 0.5 + 0.5) * h;
    if (behind) {
      sx = w - sx;
      sy = h - sy;
    }
    const onScreen = !behind && sx >= 40 && sx <= w - 40 && sy >= 40 && sy <= h - 40;
    const angleRad = Math.atan2(sy - h / 2, sx - w / 2);
    return { x: sx, y: sy, onScreen, angleRad, w, h };
  }

  _updateCamera(sim, cameraInput, dt) {
    if (cameraInput && Array.isArray(cameraInput.overridePos)) {
      const [cx, cy, cz] = cameraInput.overridePos;
      const [tx, ty, tz] = cameraInput.overrideLookAt || [0, 0, 0];
      if (this.camera.fov !== 55) {
        this.camera.fov = 55;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.set(cx, cy, cz);
      this._overrideLookAt.set(tx, ty, tz);
      this.camera.lookAt(this._overrideLookAt);
      return;
    }

    const p = sim.player.pos;
    const camState =
      typeof cameraInput === 'number'
        ? { yawDeg: cameraInput, pitchDeg: 24, dist: 10.5 }
        : cameraInput;

    const yawRad = (camState.yawDeg * Math.PI) / 180;
    const pitchRad = (camState.pitchDeg * Math.PI) / 180;
    const horiz = camState.dist * Math.cos(pitchRad);
    const vert = camState.dist * Math.sin(pitchRad);

    this._desiredTarget.set(p[0], Math.max(-2, p[1] + 1.35), p[2]);
    this._desiredPos.set(
      p[0] + Math.sin(yawRad) * horiz,
      Math.max(1.2, p[1] + 1.1 + vert),
      p[2] + Math.cos(yawRad) * horiz
    );

    if (!this._camInitialized) {
      this._camPos.copy(this._desiredPos);
      this._camTarget.copy(this._desiredTarget);
      this._camInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-16 * Math.min(0.05, dt));
      this._camPos.lerp(this._desiredPos, alpha);
      this._camTarget.lerp(this._desiredTarget, alpha);
    }

    const targetFov = this.reducedMotion ? 55 : (sim.player.dashActiveTicks > 0 || sim.player.launched ? 63 : 55);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-10 * dt));
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this._camPos);
    if (!this.reducedMotion && this._shakeTrauma > 0.001) {
      const s = this._shakeTrauma * this._shakeTrauma * 0.35;
      this.camera.position.x += Math.sin(this.elapsed * 65) * s;
      this.camera.position.y += Math.cos(this.elapsed * 53) * s;
      this._shakeTrauma = Math.max(0, this._shakeTrauma - dt * 2.2);
    } else {
      this._shakeTrauma = 0;
    }

    this.camera.lookAt(this._camTarget);
  }

  render(sim, cameraInput, dt) {
    this.elapsed += dt;

    // Update camera first so instanced billboards and fuel bars orient cleanly this frame
    this._updateCamera(sim, cameraInput, dt);

    const p = sim.player.pos;
    const horizSpeed = Math.hypot(sim.player.vel[0], sim.player.vel[2]);
    this.playerGroup.position.set(p[0], p[1], p[2]);
    this.playerGroup.rotation.y = (sim.player.facingYawDeg * Math.PI) / 180;

    if (sim.player.grounded && horizSpeed > 0.3) {
      this._walkPhase += horizSpeed * dt * 2.3;
      this.playerVisual.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.085;
      this.playerVisual.rotation.x = Math.min(0.18, horizSpeed * 0.025);
      this.scarfTail.rotation.x = 0.25 + Math.sin(this._walkPhase * 2) * 0.18;
      this.hatLanternPivot.rotation.x = Math.sin(this._walkPhase) * 0.22;
      this.hatLanternPivot.rotation.z = Math.cos(this._walkPhase * 0.5) * 0.1;
    } else {
      this.playerVisual.position.y *= 0.85;
      this.playerVisual.rotation.x *= 0.85;
      this.scarfTail.rotation.x = Math.sin(this.elapsed * 3) * 0.1;
      this.hatLanternPivot.rotation.x = Math.sin(this.elapsed * 2.2) * 0.07;
      this.hatLanternPivot.rotation.z = Math.cos(this.elapsed * 1.7) * 0.06;
    }

    if (!this.benchMode) {
      if (this._wasGrounded && !sim.player.grounded && sim.player.vel[1] > 2) {
        this._spawnBurstParticles(p, PALETTE.sand, 6, 1.8);
      } else if (!this._wasGrounded && sim.player.grounded) {
        this._spawnBurstParticles(p, PALETTE.sand, 8, 2.3);
      }
    }
    this._wasGrounded = sim.player.grounded;

    if (sim.player.dashActiveTicks > 0) {
      this.playerGroup.scale.set(0.84, 0.92, 1.28);
      if (!this.benchMode) {
        this._dashFxAccum += dt;
        if (this._dashFxAccum >= 0.03) {
          this._dashFxAccum = 0;
          this._spawnBurstParticles(p, PALETTE.goldAccent, 3, 1.1);
        }
      }
    } else {
      this.playerGroup.scale.set(1, 1, 1);
    }

    this.playerLight.intensity = 1.6 + sim.player.carried * 0.35;
    this.hatLanternMat.emissiveIntensity = 1.1 + sim.player.carried * 0.25;

    if (sim.player.respawnWaitTicks > 0) {
      this.playerGroup.visible = false;
    } else if (sim.player.invulnTicks > 0) {
      this.playerGroup.visible = Math.floor(sim.player.invulnTicks / 4) % 2 === 0;
    } else {
      this.playerGroup.visible = true;
    }

    let litCount = 0;
    const blinkOn = Math.sin(this.elapsed * Math.PI * 2) >= 0;
    const dangerHex = this.colorblindMode ? COLORBLIND_PALETTE.uiDanger : PALETTE.uiDanger;

    for (const l of sim.lanterns) {
      const view = this.lanternViews.get(l.id);
      if (!view) continue;
      view.fuelBarGroup.quaternion.copy(this.camera.quaternion);

      if (l.lit) {
        litCount += 1;
        view.bodyGroup.scale.set(1, 1, 1);
        for (const tear of view.tears) tear.visible = false;

        const fuelFrac = Math.max(0, Math.min(1, l.fuel60 / FUEL_MAX_60));
        const isLowFuel = l.fuel60 < LOW_FUEL_60;
        view.fuelBarGroup.visible = true;
        view.fuelFill.scale.x = Math.max(0.01, fuelFrac);
        view.fuelFill.position.x = -0.68 + 0.68 * fuelFrac;

        view.coreMat.color.set(PALETTE.lanternCore);
        if (isLowFuel) {
          view.coreMat.emissiveIntensity = blinkOn ? 1.6 : 0.3;
          view.light.intensity = blinkOn ? 4.2 : 0.9;
          view.haloMat.opacity = blinkOn ? 0.55 : 0.1;
          view.fuelFillMat.color.set(dangerHex);
          view.fuelFillMat.opacity = blinkOn ? 1.0 : 0.3;
          view.safeRingMat.opacity = 0;
        } else {
          view.coreMat.emissiveIntensity = 1.85;
          view.light.intensity = 4.8;
          view.haloMat.opacity = 0.65 + Math.sin(this.elapsed * 3.1) * 0.1;
          view.fuelFillMat.color.set(PALETTE.goldAccent);
          view.fuelFillMat.opacity = 1.0;
          view.safeRingMat.opacity = 0.28 + Math.sin(this.elapsed * 2.5) * 0.06;
        }
        view.progressRing.scale.setScalar(0.01);
        if (!view.wasLit) {
          view.wasLit = true;
          this.spawnSkyLantern(l.pos);
        }
      } else {
        view.wasLit = false;
        view.bodyGroup.scale.set(1.06, 0.8, 1.06);
        for (const tear of view.tears) tear.visible = true;
        view.fuelBarGroup.visible = false;

        const cost = sim.getLanternCost(l);
        const frac = cost > 0 ? l.deposited / cost : 0;
        view.coreMat.color.set(PALETTE.lanternUnlit);
        view.coreMat.emissiveIntensity = 0.08 + frac * 0.7;
        view.light.intensity = frac * 1.4;
        view.haloMat.opacity = frac * 0.25;
        view.safeRingMat.opacity = 0;
        view.progressRing.scale.setScalar(frac > 0 ? 0.4 + frac * 0.9 : 0.01);
      }
    }

    const litRatio = sim.lanterns.length > 0 ? litCount / sim.lanterns.length : 0;
    this.ambientLight.intensity = 0.15 + 0.55 * litRatio;
    this.scene.fog.density = THREE.MathUtils.lerp(0.0145, 0.0085, litRatio);

    this._syncMotes(sim.motes);
    this._syncShades(sim.shades);
    if (!this.benchMode) {
      this._syncDrifters(sim.drifters);
      this._syncCharms(sim.charms);
    }

    if (!this.benchMode && this.grassTufts) {
      const windExtra = sim.windEnabled && sim.wind.active ? 0.28 : 0;
      for (let i = 0; i < this.grassMeta.length; i += 1) {
        const s = this.grassMeta[i];
        this._dummy.position.set(s.x, s.y, s.z);
        this._dummy.rotation.set(
          Math.sin(this.elapsed * 2.2 + s.phase) * 0.12 + windExtra,
          s.rotY,
          Math.cos(this.elapsed * 1.9 + s.phase) * 0.08
        );
        this._dummy.scale.setScalar(s.scale);
        this._dummy.updateMatrix();
        this.grassTufts.setMatrixAt(i, this._dummy.matrix);
      }
      this.grassTufts.instanceMatrix.needsUpdate = true;
    }

    if (this.bellMesh) {
      const swingSpeed = sim.windEnabled && sim.wind.active ? 6 : 1.6;
      const swingAmp = sim.windEnabled && sim.wind.active ? 0.25 : 0.06;
      this.bellMesh.rotation.z = Math.sin(this.elapsed * swingSpeed) * swingAmp;
    }

    if (!this.benchMode) {
      const showLeaves = sim.windEnabled && (sim.wind.warning || sim.wind.active);
      const windSpeed = sim.wind.active ? 18 : 6;
      const wx = sim.wind.dirVec[0];
      const wz = sim.wind.dirVec[1];
      for (const leaf of this.windLeaves) {
        leaf.mesh.material.opacity = showLeaves ? 0.72 : 0;
        if (showLeaves) {
          leaf.mesh.position.x += wx * windSpeed * dt;
          leaf.mesh.position.z += wz * windSpeed * dt;
          leaf.mesh.rotation.x += dt * 5;
          leaf.mesh.rotation.y += dt * 4;
          if (Math.hypot(leaf.mesh.position.x, leaf.mesh.position.z) > 48) {
            leaf.mesh.position.x = -wx * 44 + Math.sin(leaf.phase) * 18;
            leaf.mesh.position.z = -wz * 44 + Math.cos(leaf.phase) * 18;
          }
        }
      }

      let guideTarget = null;
      if (sim.player.carried > 0) {
        let bestWeakDist = Infinity;
        for (const l of sim.lanterns) {
          if (!l.lit || l.fuel60 >= LOW_FUEL_60) continue;
          const d = distXZ(sim.player.pos, l.pos);
          if (d < bestWeakDist) {
            bestWeakDist = d;
            guideTarget = l;
          }
        }
        if (!guideTarget) {
          let bestUnlitDist = Infinity;
          for (const l of sim.lanterns) {
            if (l.lit) continue;
            const needed = sim.getLanternCost(l) - l.deposited;
            if (sim.player.carried < needed) continue;
            const d = distXZ(sim.player.pos, l.pos);
            if (d < bestUnlitDist) {
              bestUnlitDist = d;
              guideTarget = l;
            }
          }
        }
      }
      for (const w of this.wispSparks) {
        if (!guideTarget) {
          w.mat.opacity = 0;
          continue;
        }
        const u = (this.elapsed * 0.75 + w.phase) % 1;
        const dx = guideTarget.pos[0] - p[0];
        const dz = guideTarget.pos[2] - p[2];
        const d = Math.max(0.1, Math.hypot(dx, dz));
        const span = Math.min(7.5, d);
        w.mesh.position.set(
          p[0] + (dx / d) * (1.2 + u * span),
          p[1] + 1.15 + Math.sin(u * Math.PI) * 0.65,
          p[2] + (dz / d) * (1.2 + u * span)
        );
        w.mat.opacity = Math.sin(u * Math.PI) * 0.9;
      }
    }

    for (const cloud of this.cloudMeshes) {
      cloud.angle += cloud.speed * dt;
      cloud.mesh.position.x = Math.cos(cloud.angle) * cloud.radius;
      cloud.mesh.position.z = Math.sin(cloud.angle) * cloud.radius;
    }
    if (this.starPoints) {
      this.starPoints.rotation.y += dt * 0.008;
    }

    for (let i = this.pulseWaves.length - 1; i >= 0; i -= 1) {
      const wave = this.pulseWaves[i];
      wave.age += dt;
      const prog = wave.age / wave.maxAge;
      if (prog >= 1) {
        this.scene.remove(wave.mesh);
        wave.mat.dispose();
        wave.mesh.geometry.dispose();
        this.pulseWaves.splice(i, 1);
      } else {
        const s = 1 + prog * (DEFAULT_TUNING.pulse_radius * 1.25);
        wave.mesh.scale.set(s, s, 1);
        wave.mat.opacity = (1 - prog) * 0.85;
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
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const pt = this.particles[i];
      pt.age += dt;
      if (pt.age >= pt.maxAge) {
        this.scene.remove(pt.mesh);
        pt.mat.dispose();
        this.particles.splice(i, 1);
      } else {
        pt.mesh.position.x += pt.vx * dt;
        pt.mesh.position.y += pt.vy * dt;
        pt.mesh.position.z += pt.vz * dt;
        pt.mat.opacity = (1 - pt.age / pt.maxAge) * 0.7;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
