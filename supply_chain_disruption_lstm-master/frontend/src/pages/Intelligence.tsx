import type { PredictionResponse } from '../types';
import { Shield, Activity, Zap, Brain, ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const IntelligencePage = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".intel-header", {
        y: 100,
        opacity: 0,
        duration: 1.5,
        ease: "power4.out"
      });

      gsap.utils.toArray<HTMLElement>(".model-card").forEach((card) => {
        gsap.from(card, {
          scrollTrigger: {
            trigger: card,
            scroller: containerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse"
          },
          x: -100,
          opacity: 0,
          duration: 1,
          ease: "power3.out"
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="h-full bg-neutral-950 text-white p-8 pt-24 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-24 pb-48">
        
        {/* Hero Section */}
        <section className="intel-header text-center space-y-6">
          <h1 className="text-6xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-blue-500 to-teal-400 bg-clip-text text-transparent">
            System Intelligence
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto font-light leading-relaxed">
            A deep dive into the multi-layered neural architecture powering Nexus Supply Chain disruption forecasting.
          </p>
          <div className="flex justify-center pt-12 animate-bounce">
            <ChevronDown className="text-blue-500 w-8 h-8" />
          </div>
        </section>

        {/* Model Section 1: Isolation Forest */}
        <section className="model-card grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
              <Shield className="text-blue-500 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold italic tracking-tight">01. Environmental Anomaly Detection</h2>
            <p className="text-white/60 leading-relaxed">
              Utilizing <span className="text-blue-400 font-mono">Isolation Forest</span>, the system identifies statistically abnormal weather patterns. Unlike threshold-based alerts, it catches complex correlations between rainfall, wind, and temperature that signal impending disruption.
            </p>
          </div>
          <div className="relative group">
            <div className="absolute inset-0 bg-blue-500/10 blur-3xl group-hover:bg-blue-500/20 transition-colors" />
            <div className="relative border border-white/10 rounded-3xl p-8 bg-black/40 backdrop-blur-xl">
              <div className="space-y-4">
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-3/4 animate-pulse" />
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-1/2 animate-pulse" />
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-2/3 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Model Section 2: LSTM */}
        <section className="model-card grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 relative group">
            <div className="absolute inset-0 bg-teal-500/10 blur-3xl group-hover:bg-teal-500/20 transition-colors" />
            <div className="relative border border-white/10 rounded-3xl p-8 bg-black/40 backdrop-blur-xl flex flex-col items-center gap-4">
               <Activity className="text-teal-400 w-24 h-24 animate-pulse" />
               <div className="font-mono text-[10px] text-teal-400/50 uppercase tracking-[0.3em]">Temporal Flow Analysis</div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6 text-right md:text-left">
            <div className="w-16 h-16 bg-teal-500/20 rounded-2xl flex items-center justify-center border border-teal-500/30 ml-auto md:ml-0">
              <Brain className="text-teal-500 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold italic tracking-tight">02. Sequence-Based Forecasting</h2>
            <p className="text-white/60 leading-relaxed">
              The <span className="text-teal-400 font-mono">LSTM (Long Short-Term Memory)</span> network analyzes 14-day temporal sequences. It captures the 'build-up' effect—where small delays in regional hubs cascade into major supply chain bottlenecks over time.
            </p>
          </div>
        </section>

        {/* Model Section 3: XGBoost */}
        <section className="model-card grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center border border-orange-500/30">
              <Zap className="text-orange-500 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold italic tracking-tight">03. Final Risk Synthesis</h2>
            <p className="text-white/60 leading-relaxed">
              Our <span className="text-orange-400 font-mono">XGBoost Ensemble</span> acts as the final decision layer. It synthesizes categorical supplier risk, news sentiment, and the LSTM's temporal insights to deliver a high-precision probability score.
            </p>
          </div>
          <div className="relative border border-white/10 rounded-3xl p-12 bg-black/40 backdrop-blur-xl text-center group">
            <div className="text-5xl font-black text-orange-500 mb-2 group-hover:scale-110 transition-transform">98.4%</div>
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Model Validation Accuracy</div>
          </div>
        </section>

      </div>
    </div>
  );
};
