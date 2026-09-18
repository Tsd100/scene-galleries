import * as THREE from 'three';

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function colorBytes(color) {
  const value = new THREE.Color(color);
  return [value.r * 255, value.g * 255, value.b * 255];
}

/** Creates a small, deterministic, local texture with watercolor-like value drift. */
export function createPaintedTexture({
  base = '#75877c',
  accent = '#b8c1a5',
  size = 128,
  seed = 1,
  repeat = [4, 4],
} = {}) {
  const random = mulberry32(seed);
  const [br, bg, bb] = colorBytes(base);
  const [ar, ag, ab] = colorBytes(accent);
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = Math.sin(x * 0.11) * 0.035 + Math.cos(y * 0.08) * 0.04;
      const grain = (random() - 0.5) * 0.1;
      const vein = Math.abs(Math.sin((x + y * 0.45) * 0.19)) > 0.965 ? 0.18 : 0;
      const blend = Math.max(0, Math.min(0.42, 0.12 + broad + grain + vein));
      const index = (y * size + x) * 4;
      data[index] = clampByte(br * (1 - blend) + ar * blend);
      data[index + 1] = clampByte(bg * (1 - blend) + ag * blend);
      data[index + 2] = clampByte(bb * (1 - blend) + ab * blend);
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `painted-${seed}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function standard(texture, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0,
    ...options,
  });
  material.userData.shared = true;
  return material;
}

/** Shared material palette for the complete island. Dispose it once when the experience closes. */
function configureLocalTexture(texture, name, repeat) {
  texture.name = `material-${name}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Replaces procedural maps with four locally cropped, tileable atlas regions. */
export function loadMaterialAtlas(library, url = import.meta.env.BASE_URL + 'assets/material-atlas.webp') {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const loader = new THREE.TextureLoader();
  const load = (name, repeat) => new Promise((resolve, reject) => loader.load(
    `${base}material-${name}.webp`,
    (texture) => resolve(configureLocalTexture(texture, name, repeat)),
    undefined,
    reject,
  ));
  return Promise.all([
    load('stone', [5, 5]),
    load('copper', [3, 3]),
    load('bark', [2, 5]),
    load('foliage', [3, 3]),
  ]).then(([stone, copper, bark, leaf]) => {
    const replaceMap = (material, texture, suffix) => {
      const map = suffix ? texture.clone() : texture;
      if (suffix) {
        map.name = `${texture.name}-${suffix}`;
        map.needsUpdate = true;
      }
      material.map = map;
      material.needsUpdate = true;
      library.textures[map.name] = map;
    };
    replaceMap(library.stone, stone);
    replaceMap(library.stoneWarm, stone, 'warm');
    replaceMap(library.stoneDark, stone, 'dark');
    replaceMap(library.copper, copper);
    replaceMap(library.copperGlow, copper, 'glow');
    replaceMap(library.bark, bark);
    replaceMap(library.foliage, leaf);
    replaceMap(library.moss, leaf, 'moss');
    return true;
  }).catch(() => false);
}

export function createMaterialLibrary({ atlasUrl = import.meta.env.BASE_URL + 'assets/material-atlas.webp', useAtlas = true } = {}) {
  const textures = {
    stone: createPaintedTexture({ base: '#6f8179', accent: '#a8b79f', seed: 11, repeat: [5, 5] }),
    stoneWarm: createPaintedTexture({ base: '#938f79', accent: '#d2c59d', seed: 12, repeat: [4, 4] }),
    stoneDark: createPaintedTexture({ base: '#394b49', accent: '#718175', seed: 13, repeat: [5, 5] }),
    bark: createPaintedTexture({ base: '#4b4538', accent: '#8c7451', seed: 21, repeat: [2, 8] }),
    leaf: createPaintedTexture({ base: '#345f4e', accent: '#91a85e', seed: 22, repeat: [3, 3] }),
    copper: createPaintedTexture({ base: '#6f5c45', accent: '#cf9b64', seed: 31, repeat: [3, 3] }),
    fabric: createPaintedTexture({ base: '#7f6446', accent: '#d4b175', seed: 41, repeat: [2, 2] }),
  };

  const materials = {
    stone: standard(textures.stone),
    stoneWarm: standard(textures.stoneWarm),
    stoneDark: standard(textures.stoneDark),
    moss: standard(textures.leaf, { color: '#8ca06d', roughness: 1 }),
    bark: standard(textures.bark, { roughness: 1 }),
    foliage: standard(textures.leaf, { color: '#91a665', roughness: 1, side: THREE.DoubleSide }),
    copper: standard(textures.copper, { color: '#a47a50', roughness: 0.55, metalness: 0.48 }),
    copperGlow: new THREE.MeshStandardMaterial({ color: '#d8a86c', emissive: '#7a3c17', emissiveIntensity: 0.42, roughness: 0.5, metalness: 0.55 }),
    fabric: standard(textures.fabric, { side: THREE.DoubleSide, roughness: 0.92 }),
    water: new THREE.MeshPhysicalMaterial({ color: '#6aa3a2', roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.72, transmission: 0.08, depthWrite: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#a8d3cf', roughness: 0.18, transparent: true, opacity: 0.34, transmission: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    shadow: new THREE.MeshStandardMaterial({ color: '#283936', roughness: 1 }),
  };

  for (const material of Object.values(materials)) material.userData.shared = true;

  const library = {
    ...materials,
    textures,
    dispose() {
      Object.values(materials).forEach((material) => material.dispose());
      Object.values(textures).forEach((texture) => texture.dispose());
    },
  };
  library.atlasReady = useAtlas ? loadMaterialAtlas(library, atlasUrl) : Promise.resolve(false);
  return library;
}
