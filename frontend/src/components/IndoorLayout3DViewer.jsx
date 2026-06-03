import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { Box3, Group, MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeIndoorLayout } from '../lib/indoorRooms';

const furnitureStyle = {
  bed: { color: '#fbbf24', accent: '#fef3c7', height: 0.28 },
  sofa: { color: '#22c55e', accent: '#bbf7d0', height: 0.55 },
  toilet: { color: '#60a5fa', accent: '#dbeafe', height: 0.45 },
  chair: { color: '#a78bfa', accent: '#ede9fe', height: 0.55 },
  table: { color: '#fb923c', accent: '#fed7aa', height: 0.45 },
  custom: { color: '#94a3b8', accent: '#e2e8f0', height: 0.35 },
};

const occupancyColor = {
  occupied: '#ef4444',
  free: '#22c55e',
  stale: '#f59e0b',
  unknown: '#64748b',
};

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
  const targetSize = 1.55;
  const scale = targetSize / largestAxis;

  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const grounded = new Box3().setFromObject(wrapper);
  wrapper.position.y -= grounded.min.y;

  return wrapper;
};

const safeDimension = (value) => Math.max(Number(value) || 0, 0.001);

const furnitureModelTargetHeight = {
  bed: 0.58,
  sofa: 0.82,
  toilet: 0.74,
  chair: 0.82,
  table: 0.68,
  custom: 0.62,
};

const normalizeSceneToBox = (sourceScene, targetWidth, targetHeight, targetDepth) => {
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

  const scale = Math.min(
    safeDimension(targetWidth) / safeDimension(size.x),
    safeDimension(targetHeight) / safeDimension(size.y),
    safeDimension(targetDepth) / safeDimension(size.z)
  );

  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const grounded = new Box3().setFromObject(wrapper);
  wrapper.position.y -= grounded.min.y;

  return wrapper;
};

const getFurnitureModelTargetHeight = (item, style) => (
  Math.max(style.height, furnitureModelTargetHeight[item.type] || furnitureModelTargetHeight.custom)
);

export const getWorldPoint = (layout, x, y) => ([
  x - layout.widthM / 2,
  layout.heightM / 2 - y,
]);

const getItemWorldCenter = (layout, item) => {
  const [x, z] = getWorldPoint(layout, item.x + item.width / 2, item.y + item.height / 2);
  return [x, z];
};

export const resolveResidentPose = (layoutInput, position) => {
  const layout = normalizeIndoorLayout(layoutInput);
  if (!position) {
    return {
      pose: 'standing',
      label: 'Standing',
      furniture: null,
    };
  }

  const matched = layout.furniture.find((item) => (
    position.x >= item.x
    && position.x <= item.x + item.width
    && position.y >= item.y
    && position.y <= item.y + item.height
  ));

  if (!matched) {
    return {
      pose: 'standing',
      label: 'Standing',
      furniture: null,
    };
  }

  if (matched.type === 'bed') {
    return {
      pose: 'lying',
      label: 'Lying on bed',
      furniture: matched,
    };
  }

  if (matched.type === 'sofa') {
    return {
      pose: 'sitting',
      label: 'Sitting on sofa',
      furniture: matched,
    };
  }

  if (matched.type === 'toilet') {
    return {
      pose: 'toilet_sitting',
      label: 'Using toilet',
      furniture: matched,
    };
  }

  if (matched.type === 'chair') {
    return {
      pose: 'sitting',
      label: 'Sitting on chair',
      furniture: matched,
    };
  }

  return {
    pose: 'standing',
    label: `Near ${matched.label}`,
    furniture: matched,
  };
};

const LoadedElderModel = ({ modelUrl, pose }) => {
  const [normalizedModel, setNormalizedModel] = useState(null);

  useEffect(() => {
    if (!modelUrl) {
      setNormalizedModel(null);
      return undefined;
    }

    let disposed = false;
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!disposed) {
          setNormalizedModel(normalizeScene(gltf.scene));
        }
      },
      undefined,
      () => {
        if (!disposed) {
          setNormalizedModel(null);
        }
      }
    );

    return () => {
      disposed = true;
    };
  }, [modelUrl]);

  const renderObject = useMemo(() => (normalizedModel ? normalizedModel.clone(true) : null), [normalizedModel]);

  if (!renderObject) {
    return <FallbackElderPose pose={pose} />;
  }

  if (pose === 'lying') {
    return (
      <group position={[0, 0.28, 0]} rotation={[0, 0, MathUtils.degToRad(90)]}>
        <primitive object={renderObject} />
      </group>
    );
  }

  if (pose === 'sitting' || pose === 'toilet_sitting') {
    return (
      <group position={[0, 0.08, 0]} scale={[1, 0.76, 1]}>
        <primitive object={renderObject} />
      </group>
    );
  }

  return <primitive object={renderObject} />;
};

const FallbackElderPose = ({ pose }) => {
  if (pose === 'lying') {
    return (
      <group rotation={[0, 0, MathUtils.degToRad(90)]} position={[0, 0.32, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.9, 24]} />
          <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.62, 0]} castShadow>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshStandardMaterial color="#f4c7a1" roughness={0.72} metalness={0.02} />
        </mesh>
      </group>
    );
  }

  if (pose === 'sitting' || pose === 'toilet_sitting') {
    return (
      <group>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.23, 0.55, 24]} />
          <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.82, 0]} castShadow>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshStandardMaterial color="#f4c7a1" roughness={0.72} metalness={0.02} />
        </mesh>
        <mesh position={[-0.12, 0.16, 0.18]} rotation={[MathUtils.degToRad(70), 0, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.68} />
        </mesh>
        <mesh position={[0.12, 0.16, 0.18]} rotation={[MathUtils.degToRad(70), 0, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.68} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.75, 24]} />
        <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.94, 0]} castShadow>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial color="#f4c7a1" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[0.23, 0.36, 0]} rotation={[0, 0, MathUtils.degToRad(-8)]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.65, 12]} />
        <meshStandardMaterial color="#8b5e34" roughness={0.8} />
      </mesh>
    </group>
  );
};

const FurnitureModelPlaceholder = ({ item, style, failed = false }) => {
  const height = getFurnitureModelTargetHeight(item, style);

  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, height, item.height]} />
        <meshStandardMaterial
          color={failed ? '#ef4444' : style.color}
          transparent
          opacity={failed ? 0.26 : 0.18}
          roughness={0.75}
        />
      </mesh>
      <Text
        position={[0, height + 0.06, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.max(0.12, Math.min(item.width, item.height) * 0.12)}
        color={failed ? '#991b1b' : '#475569'}
        anchorX="center"
        anchorY="middle"
      >
        {failed ? 'Model failed' : 'Loading model'}
      </Text>
    </group>
  );
};

const LoadedFurnitureModel = ({ modelUrl, item, style }) => {
  const [normalizedModel, setNormalizedModel] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!modelUrl) {
      setNormalizedModel(null);
      setLoadFailed(false);
      return undefined;
    }

    let disposed = false;
    const loader = new GLTFLoader();
    const targetHeight = getFurnitureModelTargetHeight(item, style);

    setNormalizedModel(null);
    setLoadFailed(false);

    loader.load(
      modelUrl,
      (gltf) => {
        if (!disposed) {
          setNormalizedModel(normalizeSceneToBox(gltf.scene, item.width, targetHeight, item.height));
          setLoadFailed(false);
        }
      },
      undefined,
      () => {
        if (!disposed) {
          setNormalizedModel(null);
          setLoadFailed(true);
        }
      }
    );

    return () => {
      disposed = true;
    };
  }, [modelUrl, item.width, item.height, item.type, style.height]);

  const renderObject = useMemo(() => (normalizedModel ? normalizedModel.clone(true) : null), [normalizedModel]);

  if (!renderObject) {
    return <FurnitureModelPlaceholder item={item} style={style} failed={loadFailed} />;
  }

  return <primitive object={renderObject} />;
};

const Furniture3D = ({ layout, item, modelUrl }) => {
  const style = furnitureStyle[item.type] || furnitureStyle.custom;
  const [x, z] = getItemWorldCenter(layout, item);
  const y = style.height / 2;
  const rotationY = -MathUtils.degToRad(Number(item.rotation || 0));
  const status = occupancyColor[item.occupancyState] || occupancyColor.unknown;

  if (modelUrl) {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <LoadedFurnitureModel modelUrl={modelUrl} item={item} style={style} />
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  if (item.type === 'bed') {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, style.height, item.height]} />
          <meshStandardMaterial color={style.color} roughness={0.7} />
        </mesh>
        <mesh position={[-item.width * 0.28, style.height + 0.07, -item.height * 0.25]} castShadow>
          <boxGeometry args={[item.width * 0.32, 0.1, item.height * 0.32]} />
          <meshStandardMaterial color={style.accent} roughness={0.8} />
        </mesh>
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  if (item.type === 'sofa') {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, style.height * 0.32, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, style.height * 0.55, item.height]} />
          <meshStandardMaterial color={style.color} roughness={0.72} />
        </mesh>
        <mesh position={[0, style.height * 0.72, -item.height * 0.35]} castShadow>
          <boxGeometry args={[item.width, style.height * 0.7, item.height * 0.18]} />
          <meshStandardMaterial color={style.accent} roughness={0.78} />
        </mesh>
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  if (item.type === 'toilet') {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, style.height * 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[Math.min(item.width, item.height) * 0.34, Math.min(item.width, item.height) * 0.38, style.height * 0.78, 28]} />
          <meshStandardMaterial color={style.accent} roughness={0.5} />
        </mesh>
        <mesh position={[0, style.height * 0.82, -item.height * 0.25]} castShadow>
          <boxGeometry args={[item.width * 0.65, style.height * 0.35, item.height * 0.18]} />
          <meshStandardMaterial color={style.color} roughness={0.55} />
        </mesh>
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  if (item.type === 'chair') {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, style.height * 0.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, style.height * 0.22, item.height]} />
          <meshStandardMaterial color={style.color} roughness={0.72} />
        </mesh>
        <mesh position={[0, style.height * 0.72, -item.height * 0.38]} castShadow>
          <boxGeometry args={[item.width, style.height * 0.75, item.height * 0.12]} />
          <meshStandardMaterial color={style.accent} roughness={0.78} />
        </mesh>
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  if (item.type === 'table') {
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, style.height, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, 0.12, item.height]} />
          <meshStandardMaterial color={style.color} roughness={0.72} />
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}-${sz}`} position={[sx * item.width * 0.38, style.height * 0.45, sz * item.height * 0.35]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, style.height * 0.9, 10]} />
            <meshStandardMaterial color={style.accent} roughness={0.8} />
          </mesh>
        )))}
        <FurnitureStatusRing item={item} color={status} />
      </group>
    );
  }

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, y, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, style.height, item.height]} />
        <meshStandardMaterial color={style.color} roughness={0.75} />
      </mesh>
      <FurnitureStatusRing item={item} color={status} />
    </group>
  );
};

const FurnitureStatusRing = ({ item, color }) => (
  <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[Math.min(item.width, item.height) * 0.42, Math.min(item.width, item.height) * 0.5, 40]} />
    <meshBasicMaterial color={color} transparent opacity={0.85} />
  </mesh>
);

const Zone3D = ({ layout, zone, active }) => {
  const [x, z] = getItemWorldCenter(layout, zone);
  return (
    <group position={[x, 0.012, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[zone.width, zone.height]} />
        <meshStandardMaterial color={zone.color} transparent opacity={active ? 0.32 : 0.14} roughness={0.9} />
      </mesh>
      <Text
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.max(0.18, Math.min(zone.width, zone.height) * 0.12)}
        color={active ? '#0f172a' : '#475569'}
        anchorX="center"
        anchorY="middle"
      >
        {zone.label}
      </Text>
    </group>
  );
};

const Anchor3D = ({ layout, anchor }) => {
  const [x, z] = getWorldPoint(layout, anchor.x, anchor.y);
  const height = Math.max(0.25, anchor.z || 1);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, height, 12]} />
        <meshStandardMaterial color={anchor.enabled ? '#0f766e' : '#94a3b8'} roughness={0.45} />
      </mesh>
      <mesh position={[0, height + 0.06, 0]} castShadow>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color={anchor.enabled ? '#14b8a6' : '#cbd5e1'} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.27, 32]} />
        <meshBasicMaterial color={anchor.enabled ? '#14b8a6' : '#94a3b8'} transparent opacity={0.55} />
      </mesh>
    </group>
  );
};

const RoomShell = ({ layout }) => {
  const wallHeight = 0.42;
  const wallThickness = 0.08;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[layout.widthM, layout.heightM]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.92} />
      </mesh>
      <mesh position={[0, wallHeight / 2, -layout.heightM / 2]} castShadow receiveShadow>
        <boxGeometry args={[layout.widthM, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[0, wallHeight / 2, layout.heightM / 2]} castShadow receiveShadow>
        <boxGeometry args={[layout.widthM, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[-layout.widthM / 2, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, layout.heightM]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[layout.widthM / 2, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, layout.heightM]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
    </group>
  );
};

const Resident3D = ({ layout, position, modelUrl, pose }) => {
  if (!position) {
    return null;
  }

  const [x, z] = getWorldPoint(layout, position.x, position.y);
  return (
    <group position={[x, 0.04, z]}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.45, 40]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.16} />
      </mesh>
      <LoadedElderModel modelUrl={modelUrl} pose={pose} />
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.55, 40]} />
        <meshBasicMaterial color="#e11d48" transparent opacity={0.82} />
      </mesh>
    </group>
  );
};

const IndoorLayout3DViewer = ({
  layout,
  position,
  modelUrl = '/models/elderly.glb',
  furnitureModelUrls = {},
  autoRotate = false,
  resetCounter = 0,
  canvasHeightClass = 'h-[620px]',
}) => {
  const normalizedLayout = useMemo(() => normalizeIndoorLayout(layout), [layout]);
  const poseInfo = useMemo(() => resolveResidentPose(normalizedLayout, position), [normalizedLayout, position]);
  const cameraDistance = Math.max(normalizedLayout.widthM, normalizedLayout.heightM) * 0.92;
  const cameraHeight = Math.max(5.0, Math.max(normalizedLayout.widthM, normalizedLayout.heightM) * 0.62);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className={canvasHeightClass}>
        <Canvas
          key={resetCounter}
          camera={{ position: [0, cameraHeight, cameraDistance], fov: 42 }}
          shadows
          dpr={[1, 1.6]}
        >
          <color attach="background" args={['#f8fafc']} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[normalizedLayout.widthM * 0.35, 8, normalizedLayout.heightM * 0.35]} intensity={1.15} castShadow shadow-mapSize-width={1536} shadow-mapSize-height={1536} />
          <directionalLight position={[-normalizedLayout.widthM * 0.3, 3, -normalizedLayout.heightM * 0.4]} intensity={0.35} />

          <RoomShell layout={normalizedLayout} />

          {normalizedLayout.zones.map((zone) => (
            <Zone3D key={zone.id} layout={normalizedLayout} zone={zone} active={position?.roomId === zone.id} />
          ))}

          {normalizedLayout.furniture.map((item) => (
            <Furniture3D
              key={item.id}
              layout={normalizedLayout}
              item={item}
              modelUrl={furnitureModelUrls[item.id] || furnitureModelUrls[item.type]}
            />
          ))}

          {normalizedLayout.anchors.map((anchor) => (
            <Anchor3D key={anchor.id} layout={normalizedLayout} anchor={anchor} />
          ))}

          <Resident3D layout={normalizedLayout} position={position} modelUrl={modelUrl} pose={poseInfo.pose} />

          <gridHelper args={[Math.max(normalizedLayout.widthM, normalizedLayout.heightM), Math.ceil(Math.max(normalizedLayout.widthM, normalizedLayout.heightM)), '#94a3b8', '#e2e8f0']} position={[0, 0.018, 0]} />

          <OrbitControls
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={0.55}
            enablePan
            minDistance={2.5}
            maxDistance={Math.max(12, cameraDistance * 1.9)}
            target={[0, 0.3, 0]}
          />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">
        Pose: <span className="font-semibold text-slate-900">{poseInfo.label}</span>
        {poseInfo.furniture ? <span> - {poseInfo.furniture.label}</span> : null}
      </div>
    </div>
  );
};

export default IndoorLayout3DViewer;
