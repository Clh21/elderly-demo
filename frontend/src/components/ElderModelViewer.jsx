import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box3, Group, MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DEFAULT_CAMERA_POSITION = [2.8, 1.9, 2.8];

const normalizeScene = (sourceScene) => {
  const scene = sourceScene.clone(true);
  const wrapper = new Group();
  wrapper.add(scene);

  const box = new Box3().setFromObject(wrapper);
  if (box.isEmpty()) {
    return wrapper;
  }

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const largestAxis = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 1.8;
  const scale = targetSize / largestAxis;

  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const grounded = new Box3().setFromObject(wrapper);
  wrapper.position.y -= grounded.min.y;

  return wrapper;
};

const FallbackElder = () => (
  <group>
    <mesh position={[0, 0.08, 0]} castShadow>
      <cylinderGeometry args={[0.24, 0.3, 0.62, 24]} />
      <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.08} />
    </mesh>

    <mesh position={[0, 0.54, 0]} castShadow>
      <sphereGeometry args={[0.18, 24, 24]} />
      <meshStandardMaterial color="#f4c7a1" roughness={0.72} metalness={0.02} />
    </mesh>

    <mesh position={[0.24, 0.22, 0]} rotation={[0, 0, MathUtils.degToRad(-8)]} castShadow>
      <cylinderGeometry args={[0.03, 0.03, 0.6, 12]} />
      <meshStandardMaterial color="#8b5e34" roughness={0.8} />
    </mesh>

    <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[0.42, 40]} />
      <meshStandardMaterial color="#cbd5e1" transparent opacity={0.45} />
    </mesh>
  </group>
);

const ElderModelViewer = ({
  modelUrl,
  autoRotate = true,
  resetCounter = 0,
  canvasHeightClass = 'h-[460px]',
}) => {
  const [normalizedModel, setNormalizedModel] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!modelUrl) {
      setNormalizedModel(null);
      setErrorMessage('No model source selected.');
      setIsLoading(false);
      return undefined;
    }

    let disposed = false;
    const loader = new GLTFLoader();

    setIsLoading(true);
    setErrorMessage('');

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          return;
        }

        const normalized = normalizeScene(gltf.scene);
        setNormalizedModel(normalized);
        setIsLoading(false);
      },
      undefined,
      (error) => {
        if (disposed) {
          return;
        }

        setNormalizedModel(null);
        setIsLoading(false);
        setErrorMessage(error?.message || 'Failed to load GLB/GLTF model.');
      }
    );

    return () => {
      disposed = true;
    };
  }, [modelUrl]);

  const renderObject = useMemo(() => (normalizedModel ? normalizedModel.clone(true) : null), [normalizedModel]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className={canvasHeightClass}>
        <Canvas key={resetCounter} camera={{ position: DEFAULT_CAMERA_POSITION, fov: 42 }} shadows>
          <color attach="background" args={['#f8fafc']} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[3, 6, 2]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <directionalLight position={[-3, 2, -2]} intensity={0.35} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[3.3, 72]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>

          <gridHelper args={[6, 12, '#94a3b8', '#cbd5e1']} position={[0, 0.002, 0]} />

          {renderObject ? <primitive object={renderObject} /> : <FallbackElder />}

          <OrbitControls
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={1.1}
            enablePan={false}
            minDistance={1.2}
            maxDistance={7.5}
            target={[0, 0.9, 0]}
          />
        </Canvas>
      </div>

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/65 text-sm font-medium text-slate-700">
          Loading 3D elder model...
        </div>
      ) : null}

      {!isLoading && errorMessage ? (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-800">
          Model loading issue: {errorMessage} The fallback elder figure is shown for now. You can upload a .glb/.gltf model or regenerate the default file.
        </div>
      ) : null}
    </div>
  );
};

export default ElderModelViewer;
