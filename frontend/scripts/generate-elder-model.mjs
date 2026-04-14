import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SphereGeometry,
  CylinderGeometry,
  CapsuleGeometry,
  TorusGeometry,
  BoxGeometry,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }

  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
      if (typeof this.onloadend === 'function') {
        this.onloadend();
      }
    } catch (error) {
      if (typeof this.onerror === 'function') {
        this.onerror(error);
      }
    }
  }

  async readAsDataURL(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const mimeType = blob.type || 'application/octet-stream';
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      this.result = `data:${mimeType};base64,${base64}`;
      if (typeof this.onloadend === 'function') {
        this.onloadend();
      }
    } catch (error) {
      if (typeof this.onerror === 'function') {
        this.onerror(error);
      }
    }
  }
}

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = NodeFileReader;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = resolve(__dirname, '../public/models/elderly.glb');

const createMaterial = (color, roughness = 0.62, metalness = 0.08) => (
  new MeshStandardMaterial({ color, roughness, metalness })
);

const addMesh = (parent, geometry, material, position, rotation = [0, 0, 0], castShadow = true) => {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const buildElderModel = () => {
  const root = new Group();
  root.name = 'ElderResident';

  const palette = {
    skin: createMaterial('#f2c7a2', 0.72, 0.02),
    coatDark: createMaterial('#31425f', 0.58, 0.1),
    coatLight: createMaterial('#5d7397', 0.42, 0.16),
    pants: createMaterial('#334155', 0.64, 0.08),
    shoe: createMaterial('#111827', 0.55, 0.2),
    hair: createMaterial('#e5e7eb', 0.88, 0.0),
    glass: createMaterial('#94a3b8', 0.24, 0.32),
    cane: createMaterial('#8b5e34', 0.82, 0.03),
    badge: createMaterial('#f59e0b', 0.35, 0.15),
  };

  const body = new Group();
  body.name = 'BodyRig';
  root.add(body);

  addMesh(body, new CylinderGeometry(0.28, 0.35, 0.86, 28), palette.coatDark, [0, 0.98, 0]);
  addMesh(body, new CylinderGeometry(0.26, 0.32, 0.44, 24), palette.coatLight, [0, 1.35, 0]);

  addMesh(body, new CapsuleGeometry(0.085, 0.58, 8, 14), palette.pants, [-0.11, 0.45, 0], [0, 0, MathUtils.degToRad(3)]);
  addMesh(body, new CapsuleGeometry(0.085, 0.58, 8, 14), palette.pants, [0.11, 0.45, 0], [0, 0, MathUtils.degToRad(-3)]);

  addMesh(body, new CapsuleGeometry(0.09, 0.44, 8, 14), palette.coatLight, [-0.33, 1.08, 0.02], [0, 0, MathUtils.degToRad(14)]);
  addMesh(body, new CapsuleGeometry(0.09, 0.44, 8, 14), palette.coatLight, [0.33, 1.08, 0.02], [0, 0, MathUtils.degToRad(-26)]);

  addMesh(body, new SphereGeometry(0.11, 20, 20), palette.skin, [-0.37, 0.8, 0.02]);
  addMesh(body, new SphereGeometry(0.11, 20, 20), palette.skin, [0.36, 0.8, 0.02]);

  addMesh(body, new SphereGeometry(0.235, 28, 28), palette.skin, [0, 1.78, 0]);
  addMesh(body, new SphereGeometry(0.205, 28, 24), palette.hair, [0, 1.86, -0.02]);
  addMesh(body, new SphereGeometry(0.05, 16, 16), palette.hair, [-0.2, 1.8, -0.01]);
  addMesh(body, new SphereGeometry(0.05, 16, 16), palette.hair, [0.2, 1.8, -0.01]);

  addMesh(body, new TorusGeometry(0.055, 0.01, 10, 20), palette.glass, [-0.068, 1.79, 0.21], [MathUtils.degToRad(85), 0, 0]);
  addMesh(body, new TorusGeometry(0.055, 0.01, 10, 20), palette.glass, [0.068, 1.79, 0.21], [MathUtils.degToRad(85), 0, 0]);
  addMesh(body, new BoxGeometry(0.05, 0.01, 0.01), palette.glass, [0, 1.79, 0.23]);

  addMesh(body, new SphereGeometry(0.016, 10, 10), palette.badge, [0.08, 1.25, 0.28]);

  addMesh(body, new BoxGeometry(0.21, 0.1, 0.34), palette.shoe, [-0.12, 0.08, 0.06]);
  addMesh(body, new BoxGeometry(0.21, 0.1, 0.34), palette.shoe, [0.12, 0.08, 0.06]);

  const caneGroup = new Group();
  caneGroup.name = 'Cane';
  body.add(caneGroup);
  addMesh(caneGroup, new CylinderGeometry(0.022, 0.022, 1.02, 12), palette.cane, [0, 0.82, 0], [0, 0, MathUtils.degToRad(4)]);
  addMesh(caneGroup, new TorusGeometry(0.09, 0.018, 8, 16, Math.PI), palette.cane, [0.0, 1.33, 0], [Math.PI / 2, 0, MathUtils.degToRad(92)]);
  caneGroup.position.set(0.54, 0.03, 0.05);

  const base = addMesh(root, new CylinderGeometry(0.48, 0.54, 0.06, 36), createMaterial('#cbd5e1', 0.88, 0.02), [0, 0.03, 0], [0, 0, 0], false);
  base.name = 'Pedestal';

  root.traverse((node) => {
    if (node instanceof Object3D) {
      node.updateMatrix();
    }
  });

  return root;
};

const exportModel = async () => {
  const scene = new Scene();
  scene.name = 'ElderlyModelScene';
  scene.add(buildElderModel());

  const exporter = new GLTFExporter();

  const glbArrayBuffer = await new Promise((resolvePromise, rejectPromise) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolvePromise(result);
          return;
        }

        rejectPromise(new Error('Exporter did not return binary GLB data.'));
      },
      (error) => {
        rejectPromise(error || new Error('Unknown GLB export error.'));
      },
      { binary: true }
    );
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(glbArrayBuffer));
  console.log(`Generated elder model: ${outputPath}`);
};

exportModel().catch((error) => {
  console.error('Failed to generate elder model:', error);
  process.exitCode = 1;
});
