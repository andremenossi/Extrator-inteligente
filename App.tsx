import React, { useState, useEffect } from 'react';
import { Play, Square, MousePointer, X, ExternalLink, Activity, Check, Database } from 'lucide-react';

const electron = window['require'] ? window['require']('electron').ipcRenderer : null;

// Tipos para armazenar os passos gravados
interface RecordedStep {
  selector: string;
  framePath: number[];
  tagName: string;
  desc?: string;
  completed: boolean;
}

const App: React.FC = () => {
  const [status, setStatus] = useState('Pronto para Gravar');
  const [progress, setProgress] = useState(0);
  const [maxRows, setMaxRows] = useState(10);
  const [isRunning, setIsRunning] = useState(false);

  // Armazena a configuração "Selenium"
  const [steps, setSteps] = useState<{
    BUTTON: RecordedStep | null;
    DETAILS: RecordedStep | null;
  }>({ BUTTON: null, DETAILS: null });

  useEffect(() => {
    if (electron) {
      electron.send('setup-ipc-listener');

      electron.on('status', (e, msg) => setStatus(msg));
      electron.on('progress', (e, p) => setProgress(Math.round((p.current / p.total) * 100)));
      
      electron.on('element-captured', (e, data) => {
        const { mode, selector, framePath, tagName, innerText } = data;
        
        setSteps(prev => ({
            ...prev,
            [mode]: {
                selector, framePath, tagName, completed: true,
                desc: `${tagName} (${innerText.substring(0, 15)}...)`
            }
        }));
        setStatus(`Elemento ${mode} Capturado!`);
      });
    }
  }, []);

  const triggerSelect = (mode: 'BUTTON' | 'DETAILS') => {
    setStatus(`Selecione o ${mode} no navegador...`);
    electron?.send('trigger-select', mode);
  };

  const startRun = () => {
    if (!steps.BUTTON) return setStatus("Precisa definir onde clicar (Botão)!");
    setIsRunning(true);
    electron?.send('start-selenium-run', { steps, maxRows });
  };

  const stopRun = () => {
    setIsRunning(false);
    electron?.send('stop-extraction');
  };

  const StepCard = ({ mode, label, step }: { mode: 'BUTTON' | 'DETAILS', label: string, step: RecordedStep | null }) => (
    <div className={`p-3 rounded border mb-2 transition-all ${step ? 'bg-green-900/20 border-green-600' : 'bg-slate-800 border-slate-700'}`}>
        <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase">{label}</span>
            {step ? <Check size={14} className="text-green-500"/> : <span className="w-3 h-3 rounded-full bg-slate-600"></span>}
        </div>
        
        {step ? (
            <div className="text-xs text-green-300 font-mono truncate">
                FRAME: [{step.framePath.join(',')}]<br/>
                SEL: {step.selector}
            </div>
        ) : (
            <div className="text-xs text-slate-500 italic">Pendente...</div>
        )}

        <button 
            onClick={() => triggerSelect(mode)}
            className="mt-2 w-full text-xs bg-slate-700 hover:bg-slate-600 py-1 rounded text-white flex justify-center items-center gap-2"
        >
            <MousePointer size={10} /> {step ? 'Redefinir' : 'Selecionar Elemento'}
        </button>
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900/95 text-white border border-slate-700 overflow-hidden select-none">
      
      {/* Header */}
      <div className="h-8 bg-slate-950 flex items-center justify-between px-3 drag-region" style={{WebkitAppRegion: 'drag'}}>
        <div className="flex items-center gap-2">
          <Database size={14} className="text-amber-500"/>
          <span className="text-[10px] font-bold tracking-widest text-slate-300">SELENIUM EXTRACTOR</span>
        </div>
        <button onClick={() => electron?.send('app-close')} className="text-slate-500 hover:text-white" style={{WebkitAppRegion: 'no-drag'}}>
            <X size={14} />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        
        {/* Status Bar */}
        <div className="bg-black/40 rounded p-2 border border-slate-800">
            <div className="flex justify-between items-end">
                <span className="text-[10px] text-slate-500 font-bold">STATUS DO ROBÔ</span>
                <span className="text-lg font-bold text-blue-400">{progress}%</span>
            </div>
            <p className="text-xs text-amber-400 font-mono truncate mt-1">{status}</p>
            <div className="w-full bg-slate-800 h-1 mt-2 rounded overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{width: `${progress}%`}}></div>
            </div>
        </div>

        {/* Browser Link */}
        <button 
            onClick={() => electron?.send('open-browser')}
            className="text-xs flex items-center justify-center gap-2 p-2 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 border border-blue-500/30 transition-all"
        >
            <ExternalLink size={12} /> Abrir Navegador Alvo
        </button>

        <div className="border-t border-slate-800 my-1"></div>

        {/* Steps */}
        <div>
            <StepCard mode="BUTTON" label="1. Botão (Ação)" step={steps.BUTTON} />
            <StepCard mode="DETAILS" label="2. Dados (Extração)" step={steps.DETAILS} />
        </div>

        {/* Controls */}
        <div className="mt-auto">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Repetir (Linhas):</span>
                <input 
                    type="number" value={maxRows} onChange={e => setMaxRows(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-700 text-center text-xs p-1 rounded focus:border-amber-500 outline-none"
                />
            </div>
            
            {!isRunning ? (
                <button onClick={startRun} className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded shadow-lg flex justify-center items-center gap-2 active:scale-95 transition-transform">
                    <Play size={16} fill="currentColor"/> EXECUTAR ROBÔ
                </button>
            ) : (
                <button onClick={stopRun} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg flex justify-center items-center gap-2 animate-pulse">
                    <Square size={16} fill="currentColor"/> PARAR AGORA
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default App;
