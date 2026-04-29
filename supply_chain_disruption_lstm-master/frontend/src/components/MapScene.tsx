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
  transportMode?: string;
  theme?: 'dark' | 'light';
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

export const MapScene = ({ cityCoords, origin, destination, transportMode = 'Road', theme = 'dark' }: MapSceneProps) => {
  const { camera } = useThree();
  const arcRef = useRef<any>(null);
  const particleRef = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    return Object.entries(cityCoords).map(([name, [lat, lon]]) => ({
      name,
      position: latLonToVector3(lat, lon)
    }));
  }, [cityCoords]);

  const modeConfig = useMemo(() => {
    switch (transportMode) {
      case 'Air': return { arcHeight: 2.5, speed: 0.8, color: '#60a5fa' };
      case 'Rail': return { arcHeight: 0.8, speed: 0.4, color: '#facc15' };
      case 'Road':
      case 'Road+Rail':
      default: return { arcHeight: 0.2, speed: 0.2, color: '#f87171' };
    }
  }, [transportMode]);

  const routeArc = useMemo(() => {
    if (!origin || !destination || origin === destination) return null;
    const start = latLonToVector3(...cityCoords[origin]);
    const end = latLonToVector3(...cityCoords[destination]);
    
    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      modeConfig.arcHeight // Height of the arc depends on mode
    ];
    
    return { start, end, mid };
  }, [origin, destination, cityCoords, modeConfig.arcHeight]);

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
      const progress = (t * modeConfig.speed) % 1;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...routeArc.start),
        new THREE.Vector3(...routeArc.mid),
        new THREE.Vector3(...routeArc.end)
      );
      const pos = curve.getPoint(progress);
      particleRef.current.position.copy(pos);
      
      // Add a little mode-specific behavior
      if (transportMode === 'Air') {
        particleRef.current.rotation.z += 0.1;
      } else if (transportMode === 'Rail') {
        const pulse = Math.sin(t * 10) * 0.2 + 1;
        particleRef.current.scale.set(pulse, pulse, pulse);
      }
    }
  });

  const themeColors = {
    floor: theme === 'dark' ? '#050505' : '#f8f9fa',
    gridPrimary: theme === 'dark' ? 0x1e1e1e : 0xcccccc,
    gridSecondary: theme === 'dark' ? 0x111111 : 0xeeeeee,
    text: theme === 'dark' ? 'white' : '#171717',
    marker: theme === 'dark' ? '#60a5fa' : '#3b82f6',
  };

  return (
    <>
      <ambientLight intensity={theme === 'dark' ? 0.4 : 0.8} />
      <pointLight position={[10, 10, 10]} intensity={theme === 'dark' ? 1 : 0.5} />
      <spotLight position={[0, 0, 10]} angle={0.3} penumbra={1} intensity={theme === 'dark' ? 2 : 1} castShadow />
      
      {/* City Markers */}
      {points.map((point) => (
        <group key={point.name} position={point.position}>
          <Sphere args={[0.04, 16, 16]}>
            <meshStandardMaterial 
              color={point.name === origin ? "#f87171" : point.name === destination ? "#4ade80" : themeColors.marker} 
              emissive={point.name === origin || point.name === destination ? "#ffffff" : "#000000"}
              emissiveIntensity={point.name === origin || point.name === destination ? 0.8 : 0}
            />
          </Sphere>
          <Text
            position={[0, -0.12, 0]}
            fontSize={0.08}
            color={themeColors.text}
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
            color={modeConfig.color}
            lineWidth={transportMode === 'Air' ? 1 : 3}
            transparent
            opacity={0.6}
          />
          
          {/* Moving Particle */}
          <group ref={particleRef}>
            <Sphere args={[transportMode === 'Air' ? 0.02 : 0.03, 8, 8]}>
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </Sphere>
            <pointLight color={modeConfig.color} intensity={1} distance={1} />
          </group>
        </>
      )}

      {/* Grid and Floor */}
      <gridHelper args={[30, 30, themeColors.gridPrimary, themeColors.gridSecondary]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]} />
      <mesh position={[0, 0, -0.2]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color={themeColors.floor} roughness={0.8} metalness={0.2} />
      </mesh>
    </>
  );
};
