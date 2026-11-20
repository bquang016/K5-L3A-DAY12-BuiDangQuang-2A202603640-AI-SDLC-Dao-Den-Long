import * as THREE from 'three';
import { DEFAULT_TUNING, PALETTE } from '../sim/config.js';
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
 * Realistic Three.js renderer supporting all 3 standardized islands, procedural PBR textures,
 * moon & volumetric glow sprites, instanced swaying grass, animated Mây, and smooth damped camera.
 */
export class IslandRenderer {
  constructor(container) {
    this.container = container;
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
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    this.moteMeshes = new Map();
    this.shadeViews = new Map();
    this.drifterViews = new Map();
    this.charmViews = new Map();
    this.pulseWaves = [];
    this.skyLanterns = [];
    this.particles = [];
    this.wispSparks = [];
    this.grassTufts = null;
    this.grassMeta = [];
    this.bellMesh = null;

    this._camPos = new THREE.Vector3(0, 8, -12);
    this._camTarget = new THREE.Vector3(0, 1.4, 0);
    this._camInitialized = false;
    this._shakeTrauma = 0;
    this._walkPhase = 0;
    this._wasGrounded = true;
    this._dashFxAccum = 0;
    this._dummy = new THREE.Object3D();

    this._buildSkyAndClouds();
    this._buildPlayer();
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
    // Deep misty cloud sea floor below islands
    const seaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(240, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.cloudSea, transparent: true, opacity: 0.72 })
    );
    seaFloor.rotation.x = -Math.PI / 2;
    seaFloor.position.y = -11.2;
    this.scene.add(seaFloor);

    // Volumetric moon aligned with directional moonlight
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

    // Red scarf + flowing scarf tail (#C8102E)
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

    // Conical Nón Lá with textured bamboo weave
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

    // Hanging pendulum miniature lantern on front brim (+Z)
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

  _buildGuidingWisps() {
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

    for (const view of this.moteMeshes.values()) this.scene.remove(view.group);
    this.moteMeshes.clear();
    for (const view of this.shadeViews.values()) this.scene.remove(view.group);
    this.shadeViews.clear();
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

      // Central shrine dais + radial stone markers
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.3, 0.24, 16), stoneMat);
      dais.position.y = 0.12;
      dais.receiveShadow = true;
      this.worldGroup.add(dais);

      // Wooden dock (Đảo Bến) at +Z with posts
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

      // Bamboo bridge x in [26, 44], z in [-2, 2] + side guard poles
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

      // Multi-tiered Betel palms (Cây cau) around islands
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

      // Tier 1 (Y=3, r=12..24, z > 0) with stone side walls + textured grass top
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

      // Tier 2 (Y=6, r=8)
      this._addIslandDisc(0, 0, 8, 6, 6.0);

      // 2 Straight Ramps at 30 deg & 150 deg (width 3m, r=30 Y=0 to r=24 Y=3)
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

        // Framing posts outside the 3m ramp width
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

      // Bell Tower at (0, 6, 0), r=2, height=8 + swinging bronze bell
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

    // Build lanterns with radial glow sprites
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
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.0, 8), coreMat);
      body.position.y = 3.0;
      body.castShadow = true;
      group.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.58, 8), roofMat);
      roof.position.y = 3.74;
      roof.castShadow = true;
      group.add(roof);

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
        coreMat,
        light,
        haloMat,
        safeRingMat,
        progressRing,
        wasLit: false
      });
    }
  }

  triggerShake(amount = 0.4) {
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
    const activeIds = new Set(motes.map((m) => m.id));
    for (const [id, view] of this.moteMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(view.group);
        this.moteMeshes.delete(id);
      }
    }

    const haloTex = getGlowTexture(PALETTE.moteCore, PALETTE.moteHalo);
    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i];
      let view = this.moteMeshes.get(m.id);
      if (!view) {
        const group = new THREE.Group();
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.19, 10, 10),
          new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
        );
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: haloTex,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        halo.scale.set(1.25, 1.25, 1);
        group.add(orb, halo);
        this.scene.add(group);
        view = { group, orb, halo, phase: i * 0.85 };
        this.moteMeshes.set(m.id, view);
      }
      const hoverY = 0.72 + Math.sin(this.elapsed * 3.6 + view.phase) * 0.16;
      view.group.position.set(m.pos[0], m.pos[1], m.pos[2]);
      view.orb.position.y = hoverY;
      view.halo.position.y = hoverY;
      if (m.kind === 'dropped' && m.ttlTicks !== null && m.ttlTicks < 150) {
        view.group.visible = Math.floor(this.elapsed * 10) % 2 === 0;
      } else {
        view.group.visible = true;
      }
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
          color: PALETTE.shadeBody,
          emissive: PALETTE.shadeRim,
          emissiveIntensity: 0.75,
          roughness: 0.55
        });
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.7, 12), bodyMat);
        body.position.y = 0.85;
        body.castShadow = true;
        group.add(body);

        const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        leftEye.position.set(-0.15, 1.15, 0.34);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        rightEye.position.set(0.15, 1.15, 0.34);
        group.add(leftEye, rightEye);

        const stunRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.05, 6, 16),
          new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent })
        );
        stunRing.rotation.x = Math.PI / 2;
        stunRing.position.y = 1.9;
        stunRing.visible = false;
        group.add(stunRing);

        this.scene.add(group);
        view = { group, body, bodyMat, eyeMat, stunRing, phase: i * 1.3 };
        this.shadeViews.set(s.id, view);
      }

      const hover = Math.sin(this.elapsed * 4 + view.phase) * 0.1;
      view.group.position.set(s.pos[0], Math.max(0, s.pos[1] - 0.8) + hover, s.pos[2]);

      if (s.state === 'spawning') {
        const scale = Math.max(0.15, 1 - s.stateTicksLeft / 30);
        view.group.scale.setScalar(scale);
        view.stunRing.visible = false;
      } else if (s.state === 'stunned') {
        view.group.scale.set(0.9, 0.75, 0.9);
        view.bodyMat.color.set(PALETTE.shadeStunned);
        view.stunRing.visible = true;
        view.stunRing.rotation.z = this.elapsed * 5;
        view.group.rotation.y += 0.12;
      } else {
        view.group.scale.set(1, 1, 1);
        view.bodyMat.color.set(PALETTE.shadeBody);
        view.stunRing.visible = false;
        view.group.rotation.y = Math.atan2(
          this.playerGroup.position.x - s.pos[0],
          this.playerGroup.position.z - s.pos[2]
        );
      }
    }
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

  projectToScreen(worldPos) {
    const vec = new THREE.Vector3(worldPos[0], worldPos[1] + 2.4, worldPos[2]);
    vec.project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const behind = vec.z > 1;
    let sx = (vec.x * 0.5 + 0.5) * w;
    let sy = (-vec.y * 0.5 + 0.5) * h;
    if (behind) {
      sx = w - sx;
      sy = h - sy;
    }
    const onScreen = !behind && sx >= 40 && sx <= w - 40 && sy >= 40 && sy <= h - 40;
    const angleRad = Math.atan2(sy - h / 2, sx - w / 2);
    return { x: sx, y: sy, onScreen, angleRad, w, h };
  }

  render(sim, cameraInput, dt) {
    this.elapsed += dt;

    const camState =
      typeof cameraInput === 'number'
        ? { yawDeg: cameraInput, pitchDeg: 24, dist: 10.5 }
        : cameraInput;

    // Player sync & realistic locomotion animation
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

    if (this._wasGrounded && !sim.player.grounded && sim.player.vel[1] > 2) {
      this._spawnBurstParticles(p, PALETTE.sand, 6, 1.8);
    } else if (!this._wasGrounded && sim.player.grounded) {
      this._spawnBurstParticles(p, PALETTE.sand, 8, 2.3);
    }
    this._wasGrounded = sim.player.grounded;

    if (sim.player.dashActiveTicks > 0) {
      this.playerGroup.scale.set(0.84, 0.92, 1.28);
      this._dashFxAccum += dt;
      if (this._dashFxAccum >= 0.03) {
        this._dashFxAccum = 0;
        this._spawnBurstParticles(p, PALETTE.goldAccent, 3, 1.1);
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

    // Lanterns sync
    let litCount = 0;
    for (const l of sim.lanterns) {
      const view = this.lanternViews.get(l.id);
      if (!view) continue;
      if (l.lit) {
        litCount += 1;
        view.coreMat.color.set(PALETTE.lanternCore);
        view.coreMat.emissiveIntensity = 1.85;
        view.light.intensity = 4.8;
        view.haloMat.opacity = 0.65 + Math.sin(this.elapsed * 3.1) * 0.1;
        view.safeRingMat.opacity = 0.28 + Math.sin(this.elapsed * 2.5) * 0.06;
        view.progressRing.scale.setScalar(0.01);
        if (!view.wasLit) {
          view.wasLit = true;
          this.spawnSkyLantern(l.pos);
        }
      } else {
        view.wasLit = false;
        const frac = l.deposited / sim.tuning.lantern_cost;
        view.coreMat.color.set(PALETTE.lanternUnlit);
        view.coreMat.emissiveIntensity = 0.08 + frac * 0.7;
        view.light.intensity = frac * 1.4;
        view.haloMat.opacity = frac * 0.25;
        view.safeRingMat.opacity = 0;
        view.progressRing.scale.setScalar(frac > 0 ? 0.4 + frac * 0.9 : 0.01);
      }
    }

    // Exact TICKET-02 ambient intensity formula: 0.15 + 0.55 * (lit / total)
    const litRatio = sim.lanterns.length > 0 ? litCount / sim.lanterns.length : 0;
    this.ambientLight.intensity = 0.15 + 0.55 * litRatio;
    this.scene.fog.density = THREE.MathUtils.lerp(0.0145, 0.0085, litRatio);

    this._syncMotes(sim.motes);
    this._syncShades(sim.shades);
    this._syncDrifters(sim.drifters);
    this._syncCharms(sim.charms);

    // Instanced grass sway
    if (this.grassTufts) {
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

    // Wind leaves FX (Night 3 warning or active wind)
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

    // Guiding Wisp (creative addition)
    let nearestUnlit = null;
    if (sim.player.carried >= sim.tuning.lantern_cost) {
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
      const dx = nearestUnlit.pos[0] - p[0];
      const dz = nearestUnlit.pos[2] - p[2];
      const d = Math.max(0.1, Math.hypot(dx, dz));
      const span = Math.min(7.5, d);
      w.mesh.position.set(
        p[0] + (dx / d) * (1.2 + u * span),
        p[1] + 1.15 + Math.sin(u * Math.PI) * 0.65,
        p[2] + (dz / d) * (1.2 + u * span)
      );
      w.mat.opacity = Math.sin(u * Math.PI) * 0.9;
    }

    // Clouds & stars
    for (const cloud of this.cloudMeshes) {
      cloud.angle += cloud.speed * dt;
      cloud.mesh.position.x = Math.cos(cloud.angle) * cloud.radius;
      cloud.mesh.position.z = Math.sin(cloud.angle) * cloud.radius;
    }
    if (this.starPoints) {
      this.starPoints.rotation.y += dt * 0.008;
    }

    // Active FX cleanup
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

    // Smooth damped 3rd-person orbit camera with pitch, scroll zoom, FOV kick, and hit shake
    const yawRad = (camState.yawDeg * Math.PI) / 180;
    const pitchRad = (camState.pitchDeg * Math.PI) / 180;
    const horiz = camState.dist * Math.cos(pitchRad);
    const vert = camState.dist * Math.sin(pitchRad);

    const desiredTarget = new THREE.Vector3(p[0], Math.max(-2, p[1] + 1.35), p[2]);
    const desiredPos = new THREE.Vector3(
      p[0] + Math.sin(yawRad) * horiz,
      Math.max(1.2, p[1] + 1.1 + vert),
      p[2] + Math.cos(yawRad) * horiz
    );

    if (!this._camInitialized) {
      this._camPos.copy(desiredPos);
      this._camTarget.copy(desiredTarget);
      this._camInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-16 * Math.min(0.05, dt));
      this._camPos.lerp(desiredPos, alpha);
      this._camTarget.lerp(desiredTarget, alpha);
    }

    const targetFov = sim.player.dashActiveTicks > 0 || sim.player.launched ? 63 : 55;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-10 * dt));
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this._camPos);
    if (this._shakeTrauma > 0.001) {
      const s = this._shakeTrauma * this._shakeTrauma * 0.35;
      this.camera.position.x += Math.sin(this.elapsed * 65) * s;
      this.camera.position.y += Math.cos(this.elapsed * 53) * s;
      this._shakeTrauma = Math.max(0, this._shakeTrauma - dt * 2.2);
    }

    this.camera.lookAt(this._camTarget);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
