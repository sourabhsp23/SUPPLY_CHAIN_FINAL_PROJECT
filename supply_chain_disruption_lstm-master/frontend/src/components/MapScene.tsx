import { useMemo, useRef, useEffect } from 'react';
import { Sphere, Text, QuadraticBezierLine } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { gsap } from 'gsap';
import type { CityCoords } from '../types';

interface MapSceneProps {
  cityCoords: CityCoords;
  origin: string | null;
  destination: string | null;
  isPredicting?: boolean;
}

const SCALE = 0.5;
const CENTER_LAT = 22;
const CENTER_LON = 78;

export const latLonToVector3 = (lat: number, lon: number): [number, number, number] => {
  return [
    (lon - CENTER_LON) * SCALE,
    (lat - CENTER_LAT) * SCALE,
    0
  ];
};

export const MapScene = ({ cityCoords, origin, destination }: MapSceneProps) => {
  const { camera } = useThree();
  const arcRef = useRef<any>(null);
  const particleRef = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    return Object.entries(cityCoords).map(([name, [lat, lon]]) => ({
      name,
      position: latLonToVector3(lat, lon)
    }));
  }, [cityCoords]);

  const routeArc = useMemo(() => {
    if (!origin || !destination || origin === destination) return null;
    const start = latLonToVector3(...cityCoords[origin]);
    const end = latLonToVector3(...cityCoords[destination]);
    
    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      1.5 // Height of the arc
    ];
    
    return { start, end, mid };
  }, [origin, destination, cityCoords]);

  // Camera animation on route change
  useEffect(() => {
    if (routeArc) {
      const targetPos = new THREE.Vector3(
        (routeArc.start[0] + routeArc.end[0]) / 2,
        (routeArc.start[1] + routeArc.end[1]) / 2 - 2,
        5
      );
      
      gsap.to(camera.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 2,
        ease: "power3.inOut"
      });
    } else {
      gsap.to(camera.position, {
        x: 0,
        y: -5,
        z: 10,
        duration: 2,
        ease: "power3.inOut"
      });
    }
  }, [routeArc, camera]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (particleRef.current && routeArc) {
      // Simple particle move along the curve
      const progress = (t * 0.5) % 1;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...routeArc.start),
        new THREE.Vector3(...routeArc.mid),
        new THREE.Vector3(...routeArc.end)
      );
      const pos = curve.getPoint(progress);
      particleRef.current.position.copy(pos);
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <spotLight position={[0, 0, 10]} angle={0.3} penumbra={1} intensity={2} castShadow />
      
      {/* City Markers */}
      {points.map((point) => (
        <group key={point.name} position={point.position}>
          <Sphere args={[0.04, 16, 16]}>
            <meshStandardMaterial 
              color={point.name === origin ? "#f87171" : point.name === destination ? "#4ade80" : "#60a5fa"} 
              emissive={point.name === origin || point.name === destination ? "#ffffff" : "#000000"}
              emissiveIntensity={point.name === origin || point.name === destination ? 0.8 : 0}
            />
          </Sphere>
          <Text
            position={[0, -0.12, 0]}
            fontSize={0.08}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {point.name}
          </Text>
        </group>
      ))}

      {/* Route Arc */}
      {routeArc && (
        <>
          <QuadraticBezierLine
            ref={arcRef}
            start={routeArc.start}
            end={routeArc.end}
            mid={routeArc.mid}
            color="#fbbf24"
            lineWidth={3}
            transparent
            opacity={0.6}
          />
          
          {/* Moving Particle */}
          <group ref={particleRef}>
            <Sphere args={[0.03, 8, 8]}>
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </Sphere>
            <pointLight color="#fbbf24" intensity={0.5} distance={1} />
          </group>
        </>
      )}

      {/* Grid and Floor */}
      <gridHelper args={[30, 30, 0x1e1e1e, 0x111111]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]} />
      <mesh position={[0, 0, -0.2]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#050505" roughness={0.8} metalness={0.2} />
      </mesh>
    </>
  );
};
