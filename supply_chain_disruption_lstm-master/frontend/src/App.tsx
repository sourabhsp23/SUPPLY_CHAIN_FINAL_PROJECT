import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { gsap } from 'gsap';
import { Package, Truck, MapPin, Building2, ChevronRight, Loader2, Sparkles, BrainCircuit, Globe2 } from 'lucide-react';
import { MapScene } from './components/MapScene';
import { PredictionPanel } from './components/PredictionPanel';
import { IntelligencePage } from './pages/Intelligence';
import { getApiConfig, predictDisruption } from './services/api';
import type { Config, PredictionResponse, PredictionRequest } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState<'nexus' | 'intelligence'>('nexus');
  const [config, setConfig] = useState<Config | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<PredictionRequest>({
    origin_city: 'Mumbai',
    destination_city: 'Delhi',
    product_category: 'Electronics',
    transport_mode: 'Road',
    quantity_units: 500,
    order_date: new Date().toISOString().split('T')[0],
    supplier_name: 'TechLogix India',
  });

  const sidebarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getApiConfig();
        setConfig(data);
        if (data.suppliers.length > 0) {
          setFormData(prev => ({ ...prev, supplier_name: data.suppliers[0] }));
        }
      } catch (error) {
        console.error('Failed to load config', error);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config) {
      // Logic for predictions or other state updates
    }
  }, [config]);

  // Removed animations for debugging visibility

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await predictDisruption(formData);
      setPrediction(result);
      gsap.from('.prediction-content', { opacity: 0, scale: 0.95, duration: 0.5, ease: 'back.out(1.7)' });
    } catch (error) {
      console.error('Prediction failed', error);
    } finally {
      setLoading(false);
    }
  };

  if (!config) return (
    <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center text-white font-mono overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-500/20 blur-3xl animate-pulse" />
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 relative z-10" />
      </div>
      <span className="mt-8 tracking-[0.5em] text-[10px] text-blue-500 font-bold uppercase animate-pulse">Initializing Nexus Intelligence Layer...</span>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white overflow-hidden relative font-sans selection:bg-blue-500/30">
      
      {/* Navigation */}
      <nav ref={navRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <div className="flex items-center gap-1 p-1 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl">
          <button 
            onClick={() => setCurrentPage('nexus')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all ${currentPage === 'nexus' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-white/5 text-white/40'}`}
          >
            <Globe2 className="w-4 h-4" />
            NEXUS CORE
          </button>
          <button 
            onClick={() => setCurrentPage('intelligence')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all ${currentPage === 'intelligence' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-white/5 text-white/40'}`}
          >
            <BrainCircuit className="w-4 h-4" />
            INTELLIGENCE
          </button>
        </div>
      </nav>

      {/* Pages Container */}
      <div className="relative w-full h-full">
        
        {/* Nexus Page */}
        <div className={`absolute inset-0 transition-all duration-1000 ease-in-out ${currentPage === 'nexus' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none'}`}>
          
          {/* 3D Background */}
          <div className="absolute inset-0 z-0">
            <Canvas shadows>
              <PerspectiveCamera makeDefault position={[0, -5, 10]} fov={40} />
              <OrbitControls enablePan={false} maxDistance={20} minDistance={5} />
              <MapScene 
                cityCoords={config.city_coords} 
                origin={formData.origin_city} 
                destination={formData.destination_city} 
              />
            </Canvas>
          </div>

          {/* Overlay UI */}
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col">
            
            <header ref={headerRef} className="p-6 pointer-events-auto bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tighter uppercase italic">Nexus Supply Chain</h1>
                  <div className="text-[10px] font-bold text-blue-500 tracking-[0.3em] uppercase opacity-80">Advanced Disruption Intelligence</div>
                </div>
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
              <aside ref={sidebarRef} className="w-[400px] p-6 pointer-events-auto overflow-y-auto bg-black/40 backdrop-blur-xl border-r border-white/5 scrollbar-hide">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-widest">
                      <MapPin className="w-4 h-4" />
                      Route Configuration
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Origin</label>
                        <select name="origin_city" value={formData.origin_city} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none appearance-none transition-all">
                          {config.cities.map(c => <option key={c} value={c} className="bg-neutral-900">{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Destination</label>
                        <select name="destination_city" value={formData.destination_city} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none appearance-none transition-all">
                          {config.cities.map(c => <option key={c} value={c} className="bg-neutral-900">{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-widest">
                      <Package className="w-4 h-4" />
                      Cargo Details
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Product Category</label>
                        <select name="product_category" value={formData.product_category} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none appearance-none transition-all">
                          {config.products.map(p => <option key={p} value={p} className="bg-neutral-900">{p}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] text-white/40 uppercase font-bold">Mode</label>
                          <select name="transport_mode" value={formData.transport_mode} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none appearance-none transition-all">
                            {config.transport_modes.map(m => <option key={m} value={m} className="bg-neutral-900">{m}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-white/40 uppercase font-bold">Quantity</label>
                          <input type="number" name="quantity_units" value={formData.quantity_units} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                      </div>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-widest">
                      <Building2 className="w-4 h-4" />
                      Entity & Timing
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Supplier</label>
                        <select name="supplier_name" value={formData.supplier_name} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none appearance-none transition-all">
                          {config.suppliers.map(s => <option key={s} value={s} className="bg-neutral-900">{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Shipment Date</label>
                        <input type="date" name="order_date" value={formData.order_date} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none [color-scheme:dark]" />
                      </div>
                    </div>
                  </section>
                  <button type="submit" disabled={loading} className="w-full group bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-white/20 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 overflow-hidden relative">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>ANALYZE RISK PROFILE</span><ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>}
                  </button>
                </form>
              </aside>
              <main className="flex-1 p-6 flex flex-col justify-center items-end relative">
                {prediction && (
                  <div className="w-[450px] prediction-content pointer-events-auto overflow-y-auto max-h-[calc(100vh-180px)] scrollbar-hide pr-2">
                    <PredictionPanel prediction={prediction} />
                  </div>
                )}
              </main>
            </div>

            <footer className="p-4 px-6 border-t border-white/5 bg-black/60 backdrop-blur-md flex justify-between items-center">
              <div className="flex gap-8">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-[10px] text-white/40 font-mono uppercase">SYSTEM STATUS: NOMINAL</span></div>
                <div className="flex items-center gap-2"><Truck className="w-3 h-3 text-blue-500" /><span className="text-[10px] text-white/40 font-mono uppercase">ACTIVE MODELS: XGB/LSTM/ISO</span></div>
              </div>
              <div className="text-[10px] text-white/20 font-mono uppercase">{formData.origin_city} ➔ {formData.destination_city}</div>
            </footer>
          </div>
        </div>

        {/* Intelligence Page */}
        <div className={`absolute inset-0 transition-all duration-1000 ease-in-out ${currentPage === 'intelligence' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-12 pointer-events-none'}`}>
          <IntelligencePage />
        </div>

      </div>
    </div>
  );
}

export default App;
