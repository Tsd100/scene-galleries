import * as THREE from 'three';

const cloudVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragment = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
  }
  void main() {
    vec2 centered = vUv - .5;
    float edge = smoothstep(.5, .13, length(centered));
    float n = noise(vUv * 4.2 + vec2(uTime * .008, 0.));
    float alpha = edge * smoothstep(.25, .78, n + .28);
    gl_FragColor = vec4(mix(vec3(.70,.79,.78), vec3(1.,.91,.72), vUv.y), alpha * .48);
  }
`;

function makeSky() {
  const geometry = new THREE.SphereGeometry(420, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#263f55') },
      horizonColor: { value: new THREE.Color('#9cb3ab') },
      glowColor: { value: new THREE.Color('#efd39b') },
    },
    vertexShader: `varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vWorld; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 glowColor; void main(){ float h=normalize(vWorld).y; float horizon=exp(-abs(h)*5.); vec3 c=mix(horizonColor,topColor,smoothstep(-.12,.72,h)); c=mix(c,glowColor,horizon*.2); gl_FragColor=vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = '天空渐变穹顶';
  sky.renderOrder = -10;
  return sky;
}

/** Adds a fully local sky, cloud sea, distant silhouettes and a subtle water plane. */
export function createAtmosphere(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = 'atmosphereRoot';
  scene.add(root);

  const sky = makeSky();
  root.add(sky);

  scene.background = new THREE.Color('#718b91');
  scene.fog = new THREE.FogExp2('#91a4a0', 0.0026);

  const hemi = new THREE.HemisphereLight('#d8e4da', '#26332f', 2.15);
  hemi.name = '天空环境光';
  root.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe1a8', 3.1);
  sun.name = '暮色主光';
  sun.position.set(-70, 95, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.00035;
  root.add(sun);

  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
  });
  const cloudGeometry = new THREE.PlaneGeometry(110, 75, 1, 1);
  const cloudLayers = new THREE.Group();
  cloudLayers.name = '环岛云海';
  const cloudPositions = [
    [-105, -15, 30, 0.05], [95, -12, 22, -0.1], [-68, -18, -94, 0.4],
    [38, -20, -112, -0.3], [8, -24, 112, 0.15], [128, -27, -52, -0.2],
  ];
  cloudPositions.forEach(([x, y, z, rotation], index) => {
    const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    cloud.name = `云层-${index + 1}`;
    cloud.rotation.x = -Math.PI / 2;
    cloud.rotation.z = rotation;
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(1 + (index % 3) * 0.22);
    cloud.userData.baseX = x;
    cloudLayers.add(cloud);
  });
  root.add(cloudLayers);

  const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#405b59', roughness: 1, flatShading: true });
  mountainMaterial.userData.shared = true;
  const mountainGeometry = new THREE.ConeGeometry(25, 55, 7);
  const mountains = new THREE.InstancedMesh(mountainGeometry, mountainMaterial, 14);
  mountains.name = '远山剪影';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const radius = 240 + (index % 3) * 18;
    dummy.position.set(Math.cos(angle) * radius, -28 - (index % 2) * 6, Math.sin(angle) * radius);
    dummy.scale.set(0.7 + (index % 4) * 0.18, 0.7 + (index % 3) * 0.25, 0.7 + (index % 4) * 0.18);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    mountains.setMatrixAt(index, dummy.matrix);
  }
  mountains.instanceMatrix.needsUpdate = true;
  root.add(mountains);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(230, 64),
    new THREE.MeshPhysicalMaterial({ color: '#789a9a', roughness: 0.34, metalness: 0.04, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  water.name = '远方水面';
  water.rotation.x = -Math.PI / 2;
  water.position.y = -31;
  root.add(water);

  let motionReduced = reducedMotion;
  const metrics = { cloudLayers: cloudPositions.length, distantMountains: 14, lights: 2 };

  return {
    root,
    sun,
    metrics,
    setReducedMotion(value) { motionReduced = Boolean(value); },
    update(timeSeconds) {
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      cloudMaterial.uniforms.uTime.value = motionReduced ? 0 : time;
      if (!motionReduced) {
        cloudLayers.children.forEach((cloud, index) => {
          cloud.position.x = cloud.userData.baseX + Math.sin(time * 0.025 + index) * 3;
        });
        water.material.opacity = 0.4 + Math.sin(time * 0.22) * 0.025;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (object.material && !object.material.userData?.shared) object.material.dispose?.();
      });
      mountainMaterial.dispose();
    },
  };
}
