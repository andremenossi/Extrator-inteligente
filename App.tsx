import React, { useState, useEffect } from 'react';
import { 
  Play, Square, Settings, MousePointer, 
  X, ExternalLink, Activity, FileText, Check, AlertCircle 
} from 'lucide-react';

const electron = window['require'] ? window['require']('electron').ipcRenderer : null;

const App: React.FC = () => {
  const [status, setStatus] = useState('Pronto');
  const [progress, setProgress] = useState(0);
  const [maxRows, setMaxRows] = useState(50);
  const [isRunning, setIsRunning] = useState(false);

  const [config, setConfig] = useState({
    table: false,
    button: false,
    details: false
  });

  useEffect(() => {
    if (electron) {
      electron.on('status', (e, msg) => setStatus(msg));
      electron.on('progress', (e, p) => setProgress(Math.round((p.current / p.total) * 100)));
      electron.on('config-update', (e, data) => {
        if(data.mode === 'TABLE') setConfig(p => ({...p, table: true}));
        if(data.mode === 'BUTTON') setConfig(p => ({...p, button: true}));
        if(data.mode === 'DETAILS') setConfig(p => ({...p, details: true}));
      });
    }
  }, []);

  const closeApp = () => electron?.send('app-close');
  const openSystem = () => electron?.send('open-browser');
  
  const start = () => {
    if (!config.button) return setStatus("Configure o Botão primeiro!");
    setIsRunning(true);
    electron?.send('start-extraction', { maxRows });
  };

  const stop = () => {
    setIsRunning(false);
    setStatus("Parando...");
    electron?.send('stop-extraction');
  };

  const ConfigBtn = ({ label, active, onClick }) => (
    <button 
      onClick={onClick}
      className={`group flex items-center justify-between w-full p-3 rounded-lg border transition-all
        ${active 
          ? 'bg-green-500/10 border-green-500/50 text-green-400' 
          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}
      `}
    >
      <div className="flex items-center gap-3">
        {active ? <Check size={16} /> : <MousePointer size={16} />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">DEFINIR</span>
    </button>
  );

  return (
    // Container Principal Transparente
    <div className="h-screen w-screen flex flex-col bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/50 overflow-hidden shadow-2xl rounded-xl">
      
      {/* Barra de Título Customizada (Drag Region) */}
      <div className="h-10 bg-slate-950/50 flex items-center justify-between px-3 select-none" style={{WebkitAppRegion: 'drag'}}>
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-500"/>
          <span className="text-xs font-bold tracking-wider text-slate-300">AUTOMED WIDGET</span>
        </div>
        <button 
          onClick={closeApp} 
          className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors"
          style={{WebkitAppRegion: 'no-drag'}}
        >
          <X size={16} />
        </button>
      </div>

      {/* Corpo do Widget */}
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
        
        {/* Status Display */}
        <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 relative overflow-hidden">
          <div className="relative z-10 flex justify-between items-center">
             <div>
               <p className="text-[10px] text-slate-500 uppercase tracking-widest">Status</p>
               <p className="text-sm font-mono text-blue-400 truncate w-48">{status}</p>
             </div>
             <div className="text-right">
                <span className="text-xl font-bold">{progress}%</span>
             </div>
          </div>
          {/* Progress Bar Background */}
          <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300" style={{width: `${progress}%`}}></div>
        </div>

        {/* Link Sistema */}
        <button 
          onClick={openSystem}
          className="flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white py-2 border border-dashed border-slate-700 rounded hover:bg-slate-800 transition-colors"
        >
          <ExternalLink size={12} /> Abrir/Focar Sistema Hospitalar
        </button>

        {/* Configuração (Steps) */}
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 uppercase font-bold pl-1">Configuração Visual</p>
          <ConfigBtn 
            label="1. Tabela" 
            active={config.table} 
            onClick={() => electron?.send('trigger-select', 'TABLE')} 
          />
          <ConfigBtn 
            label="2. Botão Ação" 
            active={config.button} 
            onClick={() => electron?.send('trigger-select', 'BUTTON')} 
          />
          <ConfigBtn 
            label="3. Área Detalhes" 
            active={config.details} 
            onClick={() => electron?.send('trigger-select', 'DETAILS')} 
          />
        </div>

        {/* Controles de Execução */}
        <div className="mt-auto pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-3 px-1">
             <div className="flex items-center gap-2 text-xs text-slate-400" title="Para automaticamente após X pacientes">
               <Settings size={12} />
               <span>Limite Linhas:</span>
             </div>
             <input 
               type="number" 
               value={maxRows}
               onChange={e => setMaxRows(Number(e.target.value))}
               className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center focus:border-blue-500 outline-none"
             />
          </div>

          {!isRunning ? (
            <button 
              onClick={start}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Play size={18} fill="currentColor" /> INICIAR
            </button>
          ) : (
            <button 
              onClick={stop}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all active:scale-95 animate-pulse"
            >
              <Square size={18} fill="currentColor" /> PARAR
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;