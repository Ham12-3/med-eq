"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FloorPlan, PlanRoom } from "@/lib/map/layout";
import { MAP_STATUSES, MAP_STYLE, type ContextDot, type MapMarker, type MapStatus, type MarkerShape } from "@/lib/map/status";

/** The parts of drei's OrbitControls used here. */
type Orbit = THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void };

// The placeholder floor plan (PLAN.md M5 step 1), drawn from the rooms table. Each room's
// group is named room_<GLN>, as in the Blender model that will replace it (M5 step 2).

export type FloorMapProps = {
  floorId: string;
  plan: FloorPlan;
  markers: MapMarker[];
  /** Devices the filters leave out, drawn as grey dots. */
  context: ContextDot[];
  visible: Record<MapStatus, boolean>;
  /** Changing this refits the whole floor in view ("Reset view"). */
  fitKey: number;
  showLabels: boolean;
  selectedId: string | null;
  onSelect: (marker: MapMarker | null) => void;
  /** The marker under the pointer and where the pointer is in the canvas, for the page's tooltip. */
  onHover: (hover: { marker: MapMarker; x: number; y: number } | null) => void;
};

const ROOM_COLOR: Record<string, string> = {
  ward: "#e0f2fe",
  single_room: "#ecfeff",
  theatre: "#ede9fe",
  equipment_library: "#dcfce7",
  workshop: "#fef9c3",
  store_room: "#f4f4f5",
  other: "#fafafa",
};

export default function FloorMap(props: FloorMapProps) {
  const span = Math.max(props.plan.corridor.length, 20);
  return (
    <Canvas
      camera={{ position: [0, span * 0.62, span * 0.5], fov: 45, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onSelect(null)}
      fallback={<p className="p-6 text-sm">This browser cannot show the 3D map. Use the list below instead.</p>}
    >
      <color attach="background" args={["#f4f4f5"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[20, 40, 15]} intensity={1.1} />
      <Scene {...props} />
      <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={Math.PI * 0.45} minDistance={6} maxDistance={span * 2} />
      <FitCamera plan={props.plan} fitKey={props.fitKey} />
      <FlyTo marker={props.markers.find((m) => m.id === props.selectedId) ?? null} />
      {process.env.NODE_ENV !== "production" && <ScreenProbe markers={props.markers} />}
    </Canvas>
  );
}

declare global {
  interface Window {
    /** Development only: where a marker is on screen, so end-to-end tests can point the real mouse at it. */
    __medassetMarkerOnScreen?: (assetId: string) => { x: number; y: number } | null;
  }
}

function ScreenProbe({ markers }: { markers: MapMarker[] }) {
  const { camera, gl } = useThree();
  useLayoutEffect(() => {
    window.__medassetMarkerOnScreen = (assetId) => {
      const m = markers.find((x) => x.id === assetId);
      if (!m) return null;
      const p = new THREE.Vector3(m.x, 0.06 + m.size * 1.1, m.z).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
    return () => { delete window.__medassetMarkerOnScreen; };
  }, [camera, gl, markers]);
  return null;
}

const ELEVATION = THREE.MathUtils.degToRad(55); // looking down at the floor from 55° above the horizon

/** Places the camera so the whole floor fills the view, and again whenever the canvas is resized. */
function FitCamera({ plan, fitKey }: { plan: FloorPlan; fitKey: number }) {
  const { camera, size, controls } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const width = plan.corridor.length;
    const depth = 2 * Math.max(...plan.rooms.map((r) => Math.abs(r.z) + r.depth / 2), plan.corridor.width / 2);
    const halfV = THREE.MathUtils.degToRad(cam.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * (size.width / Math.max(size.height, 1)));
    // 1.2 leaves room for perspective: the nearer row of rooms looks wider than the floor's true width.
    const distance = 1.2 * Math.max(width / 2 / Math.tan(halfH), (depth * Math.sin(ELEVATION)) / 2 / Math.tan(halfV));
    cam.position.set(0, distance * Math.sin(ELEVATION), distance * Math.cos(ELEVATION));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const orbit = controls as unknown as Orbit | null;
    orbit?.target.set(0, 0, 0);
    orbit?.update();
  }, [camera, controls, plan, size.width, size.height, fitKey]);
  return null;
}

const FLY_DISTANCE = 14; // metres from the device when the flight ends

/**
 * Glides the camera to a newly selected device, keeping the current viewing direction.
 * Grabbing the view (turn, zoom, pan) stops the flight.
 */
function FlyTo({ marker }: { marker: MapMarker | null }) {
  const { camera, controls } = useThree();
  const flight = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);

  useLayoutEffect(() => {
    const orbit = controls as unknown as Orbit | null;
    if (!marker || !orbit) return;
    const target = new THREE.Vector3(marker.x, 0, marker.z);
    const direction = camera.position.clone().sub(orbit.target).normalize();
    flight.current = { target, position: target.clone().add(direction.multiplyScalar(FLY_DISTANCE)) };
  }, [marker, camera, controls]);

  useEffect(() => {
    const orbit = controls as unknown as Orbit | null;
    if (!orbit) return;
    const cancel = () => { flight.current = null; };
    orbit.addEventListener("start", cancel);
    return () => orbit.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, delta) => {
    const f = flight.current;
    const orbit = controls as unknown as Orbit | null;
    if (!f || !orbit) return;
    const k = 1 - Math.exp(-delta * 6); // eases out over about half a second
    camera.position.lerp(f.position, k);
    orbit.target.lerp(f.target, k);
    orbit.update();
    if (camera.position.distanceTo(f.position) < 0.02) flight.current = null;
  });
  return null;
}

function Scene({ floorId, plan, markers, context, visible, showLabels, selectedId, onSelect, onHover }: FloorMapProps) {
  const selected = markers.find((m) => m.id === selectedId) ?? null;
  return (
    <group name={`floor_${floorId}`}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[plan.corridor.length, 0.02, plan.corridor.width]} />
        <meshStandardMaterial color="#d4d4d8" />
      </mesh>
      {plan.rooms.map((room) => <Room key={room.id} room={room} showLabel={showLabels} />)}
      {context.length > 0 && <ContextDots key={`${floorId}-context-${context.length}`} dots={context} />}

      {MAP_STATUSES.map((status) => {
        const shown = visible[status] ? markers.filter((m) => m.status === status) : [];
        if (shown.length === 0) return null;
        return (
          <MarkerSet key={`${floorId}-${status}-${shown.length}`} status={status} markers={shown}
            onHover={onHover} onSelect={onSelect} />
        );
      })}

      {selected && (
        <mesh position={[selected.x, 0.08, selected.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[selected.size * 1.6, selected.size * 2.1, 32]} />
          <meshBasicMaterial color="#18181b" />
        </mesh>
      )}
    </group>
  );
}

function Room({ room, showLabel }: { room: PlanRoom; showLabel: boolean }) {
  const wall = 0.12;
  const height = 0.9; // cut away so devices stay visible from the side
  const walls: [number, number, number, number][] = [
    [0, -room.depth / 2, room.width, wall],
    [0, room.depth / 2, room.width, wall],
    [-room.width / 2, 0, wall, room.depth],
    [room.width / 2, 0, wall, room.depth],
  ];
  return (
    <group name={room.meshName} position={[room.x, 0, room.z]} userData={{ gln: room.gln, name: room.name }}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[room.width, 0.06, room.depth]} />
        <meshStandardMaterial color={ROOM_COLOR[room.roomType] ?? ROOM_COLOR.other} />
      </mesh>
      {walls.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, height / 2, z]}>
          <boxGeometry args={[w, height, d]} />
          <meshStandardMaterial color="#a1a1aa" />
        </mesh>
      ))}
      {showLabel && <RoomLabel text={room.name} position={[0, height + 0.9, -room.depth / 2 + 0.7]} />}
    </group>
  );
}

/** A room name drawn on a canvas and shown as a sprite, so it always faces the camera. */
function RoomLabel({ text, position }: { text: string; position: [number, number, number] }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "600 40px sans-serif";
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + 24;
    canvas.width = width;
    canvas.height = 56;
    ctx.font = font;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(0, 0, width, 56);
    ctx.fillStyle = "#3f3f46";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 12, 30);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: width / 56 };
  }, [text]);
  const height = 1.1;
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} raycast={() => null}>
      <spriteMaterial map={texture} depthWrite={false} />
    </sprite>
  );
}

/** Devices left out by the filters: small, grey, and not clickable. */
function ContextDots({ dots }: { dots: ContextDot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    dots.forEach((d, i) => {
      tmp.p.set(d.x, 0.06 + d.size, d.z);
      tmp.s.set(d.size, d.size, d.size);
      ref.current?.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s));
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [dots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, dots.length]} raycast={() => null} name="markers_filtered_out">
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color="#a1a1aa" transparent opacity={0.6} />
    </instancedMesh>
  );
}

function shapeGeometry(shape: MarkerShape): THREE.BufferGeometry {
  switch (shape) {
    case "sphere": return new THREE.SphereGeometry(1, 16, 12);
    case "cylinder": return new THREE.CylinderGeometry(1, 1, 0.7, 20);
    case "cone": return new THREE.ConeGeometry(1, 1.9, 16);
    case "octahedron": return new THREE.OctahedronGeometry(1.25);
    case "box": return new THREE.BoxGeometry(1.6, 1.6, 1.6);
  }
}

/** A flat "!" disc that sits on top of markers needing action. */
function useAlertTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 32, 35);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

const tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/** Writes each marker's position and size (times `pulse`), and its "!" disc if it has one. */
function placeMarkers(markers: MapMarker[], body: THREE.InstancedMesh | null, icons: THREE.InstancedMesh | null, pulse: number) {
  markers.forEach((m, i) => {
    const r = m.size * pulse;
    tmp.p.set(m.x, 0.06 + m.size * 1.1, m.z);
    tmp.s.set(r, r, r);
    body?.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s));
    if (icons) {
      tmp.p.set(m.x, 0.06 + m.size * 2.6, m.z);
      tmp.s.set(m.size * 1.3, m.size * 1.3, 1);
      icons.setMatrixAt(i, tmp.m.compose(tmp.p, flat, tmp.s));
    }
  });
  if (body) body.instanceMatrix.needsUpdate = true;
  if (icons) icons.instanceMatrix.needsUpdate = true;
}

function MarkerSet({ status, markers, onHover, onSelect }: {
  status: MapStatus;
  markers: MapMarker[];
  onHover: FloorMapProps["onHover"];
  onSelect: (m: MapMarker) => void;
}) {
  const style = MAP_STYLE[status];
  const body = useRef<THREE.InstancedMesh>(null);
  const icons = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => shapeGeometry(style.shape), [style.shape]);
  const alertTexture = useAlertTexture();

  useLayoutEffect(() => {
    placeMarkers(markers, body.current, icons.current, 1);
    body.current?.computeBoundingSphere();
  }, [markers]);

  // Markers needing action pulse, so they are noticed without relying on colour.
  useFrame(({ clock }) => {
    if (style.alert) placeMarkers(markers, body.current, icons.current, 1 + 0.22 * Math.sin(clock.elapsedTime * 4));
  });

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : markers[e.instanceId] ?? null);

  return (
    <>
      <instancedMesh
        ref={body}
        args={[geometry, undefined, markers.length]}
        name={`markers_${status}`}
        onPointerMove={(e) => {
          e.stopPropagation();
          const marker = pick(e);
          onHover(marker ? { marker, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY } : null);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); const m = pick(e); if (m) onSelect(m); }}
      >
        <meshStandardMaterial color={style.color} roughness={0.5} />
      </instancedMesh>
      {style.alert && (
        <instancedMesh ref={icons} args={[undefined, undefined, markers.length]} raycast={() => null}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial map={alertTexture} transparent />
        </instancedMesh>
      )}
    </>
  );
}
