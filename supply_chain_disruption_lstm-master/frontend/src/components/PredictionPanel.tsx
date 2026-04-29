import type { PredictionResponse } from '../types';
import { AlertTriangle, Clock, MapPin, Wind, Thermometer, CloudRain, ShieldAlert, History } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PredictionPanelProps {
  prediction: PredictionResponse;
}

export const PredictionPanel = ({ prediction }: PredictionPanelProps) => {
  const getRiskColor = (prob: number) => {
    if (prob >= 70) return 'text-red-500 border-red-500/50 bg-red-500/10';
    if (prob >= 40) return 'text-amber-500 border-amber-500/50 bg-amber-500/10';
    return 'text-green-500 border-green-500/50 bg-green-500/10';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right duration-500">
      <div className={cn(
        "p-6 rounded-2xl border backdrop-blur-md",
        getRiskColor(prediction.disruption_probability)
      )}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold">Disruption Risk</h3>
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="text-4xl font-black">{prediction.disruption_probability}%</div>
        <div className="text-sm opacity-80 mt-1">Confidence: {prediction.confidence}%</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-2 text-white/60 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Predicted Delay</span>
          </div>
          <div className="text-2xl font-bold text-white">{prediction.predicted_delay_days} Days</div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-2 text-white/60 mb-1">
            <MapPin className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Distance</span>
          </div>
          <div className="text-2xl font-bold text-white">{prediction.distance_km} km</div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Top Risk Factors</h4>
        {prediction.causes.map((cause, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-white">{cause.text}</div>
              <div className="text-xs text-white/60 leading-relaxed">{cause.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Environmental Status</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
            <CloudRain className="w-4 h-4 mx-auto mb-1 text-blue-400" />
            <div className="text-xs font-bold text-white">{prediction.weather.rain}mm</div>
            <div className="text-[10px] text-white/40">Rain</div>
          </div>
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-center">
            <Thermometer className="w-4 h-4 mx-auto mb-1 text-orange-400" />
            <div className="text-xs font-bold text-white">{prediction.weather.temp}°C</div>
            <div className="text-[10px] text-white/40">Temp</div>
          </div>
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-center">
            <Wind className="w-4 h-4 mx-auto mb-1 text-teal-400" />
            <div className="text-xs font-bold text-white">{prediction.weather.wind}kmh</div>
            <div className="text-[10px] text-white/40">Wind</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2 text-white/60 mb-2">
          <History className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Historical Context</span>
        </div>
        <div className="text-sm text-white/80 leading-relaxed">
          {prediction.historical_disruptions.toFixed(1)} average disruptions per day recorded in the origin city.
        </div>
      </div>
    </div>
  );
};
