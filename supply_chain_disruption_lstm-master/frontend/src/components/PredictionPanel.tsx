import type { PredictionResponse } from '../types';
import { AlertTriangle, Clock, MapPin, Wind, Thermometer, CloudRain, ShieldAlert, History } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PredictionPanelProps {
  prediction: PredictionResponse;
  transportMode?: string;
}

export const PredictionPanel = ({ prediction, transportMode = 'Road' }: PredictionPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear any existing animations
    gsap.killTweensOf(panelRef.current);
    gsap.killTweensOf(".panel-item");

    if (panelRef.current) {
      const tl = gsap.timeline();
      
      // Reset visibility before animation
      gsap.set(panelRef.current, { opacity: 1, x: 0, y: 0, rotationX: 0 });
      gsap.set(".panel-item", { opacity: 1, y: 0 });

      // Mode-specific entrance animations
      switch (transportMode) {
        case 'Air':
          tl.from(panelRef.current, { y: -50, opacity: 0, duration: 0.6, ease: 'power2.out' });
          break;
        case 'Rail':
          tl.from(panelRef.current, { x: 50, opacity: 0, duration: 0.6, ease: 'power2.out' });
          break;
        case 'Road':
        case 'Road+Rail':
        default:
          tl.from(panelRef.current, { y: 50, opacity: 0, duration: 0.6, ease: 'power2.out' });
          break;
      }

      // Stagger child elements
      tl.from(".panel-item", { 
        y: 10, 
        opacity: 0, 
        stagger: 0.05, 
        duration: 0.3, 
        ease: 'power1.out' 
      }, "-=0.3");
    }
    
    return () => {
      gsap.killTweensOf(panelRef.current);
      gsap.killTweensOf(".panel-item");
    };
  }, [prediction, transportMode]);

  const getRiskColor = (prob: number) => {
    if (prob >= 70) return 'text-red-600 dark:text-red-500 border-red-500/50 bg-red-500/5 dark:bg-red-500/10';
    if (prob >= 40) return 'text-amber-600 dark:text-amber-500 border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10';
    return 'text-green-600 dark:text-green-500 border-green-500/50 bg-green-500/5 dark:bg-green-500/10';
  };

  return (
    <div ref={panelRef} className="space-y-6">
      <div className={cn(
        "p-6 rounded-2xl border backdrop-blur-md panel-item shadow-xl",
        getRiskColor(prediction.disruption_probability)
      )}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold italic tracking-tight">Disruption Risk</h3>
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <div className="text-5xl font-black tracking-tighter">{prediction.disruption_probability}%</div>
        <div className="text-sm opacity-80 mt-1 font-mono uppercase tracking-widest">Confidence: {prediction.confidence}%</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-black/40 backdrop-blur-md panel-item shadow-lg">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-white/60 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Predicted Delay</span>
          </div>
          <div className="text-2xl font-black text-neutral-900 dark:text-white">{prediction.predicted_delay_days} Days</div>
        </div>
        <div className="p-4 rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-black/40 backdrop-blur-md panel-item shadow-lg">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-white/60 mb-1">
            <MapPin className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Distance</span>
          </div>
          <div className="text-2xl font-black text-neutral-900 dark:text-white">{Math.round(prediction.distance_km)} km</div>
        </div>
      </div>

      <div className="space-y-3 panel-item">
        <h4 className="text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-[0.3em]">Top Risk Factors</h4>
        {prediction.causes.map((cause, i) => (
          <div key={i} className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 flex gap-4 transition-all hover:bg-black/[0.08] dark:hover:bg-white/[0.08]">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">{cause.text}</div>
              <div className="text-[11px] text-neutral-500 dark:text-white/60 mt-1 leading-relaxed">{cause.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 panel-item">
        <h4 className="text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-[0.3em]">Environmental Status</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/20 text-center transition-all hover:scale-105">
            <CloudRain className="w-5 h-5 mx-auto mb-1 text-blue-500 dark:text-blue-400" />
            <div className="text-sm font-black text-neutral-900 dark:text-white">{prediction.weather.rain.toFixed(1)}mm</div>
            <div className="text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Rain</div>
          </div>
          <div className="p-3 rounded-xl bg-orange-500/10 dark:bg-orange-500/10 border border-orange-500/20 text-center transition-all hover:scale-105">
            <Thermometer className="w-5 h-5 mx-auto mb-1 text-orange-500 dark:text-orange-400" />
            <div className="text-sm font-black text-neutral-900 dark:text-white">{prediction.weather.temp.toFixed(1)}°C</div>
            <div className="text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Temp</div>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/10 dark:bg-teal-500/10 border border-teal-500/20 text-center transition-all hover:scale-105">
            <Wind className="w-5 h-5 mx-auto mb-1 text-teal-500 dark:text-teal-400" />
            <div className="text-sm font-black text-neutral-900 dark:text-white">{prediction.weather.wind.toFixed(1)}kmh</div>
            <div className="text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Wind</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-black/40 backdrop-blur-md panel-item shadow-lg">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-white/60 mb-2">
          <History className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Historical Context</span>
        </div>
        <div className="text-xs font-medium text-neutral-600 dark:text-white/80 leading-relaxed italic">
          "{prediction.historical_disruptions.toFixed(1)} average disruptions per day recorded in the origin city."
        </div>
      </div>
    </div>
  );
};
