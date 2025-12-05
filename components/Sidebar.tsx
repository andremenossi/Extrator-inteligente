import React from 'react';
import { Terminal, Code, HelpCircle, FileSpreadsheet, Activity } from 'lucide-react';

interface SidebarProps {
  activeTab: 'scraper' | 'macro_surgery';
  setActiveTab: (tab: 'scraper' | 'macro_surgery') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="w-64 bg-slate-900 border-r border-slate-700 text-slate-300 flex flex-col h-full shadow-xl z-20">
      <div className="p-6 border-b border-slate-700">
        <div className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
          <Code className="text-blue-500" />
          <span>AUTOMED</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Web Automation Suite</p>
      </div>

      <div className="flex-1 py-4">
        <div className="px-4 text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Robôs Disponíveis</div>
        
        <button 
          onClick={() => setActiveTab('scraper')}
          className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-r-2 mb-1
            ${activeTab === 'scraper' 
              ? 'bg-slate-800 text-blue-400 border-blue-500' 
              : 'border-transparent hover:bg-slate-800 hover:text-white'}
          `}
        >
          <FileSpreadsheet size={18} />
          <span>Extrator (Tabela)</span>
        </button>

        <button 
          onClick={() => setActiveTab('macro_surgery')}
          className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-r-2
            ${activeTab === 'macro_surgery' 
              ? 'bg-slate-800 text-purple-400 border-purple-500' 
              : 'border-transparent hover:bg-slate-800 hover:text-white'}
          `}
        >
          <Activity size={18} />
          <span>Macro (Cirurgia)</span>
        </button>

        <div className="mt-8 px-4 text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Suporte</div>
        <div className="px-6 py-2 text-sm flex items-center gap-3 text-slate-400">
          <HelpCircle size={18} />
          <span>F.A.Q.</span>
        </div>
      </div>
      
      <div className="p-4 text-xs text-slate-600 border-t border-slate-800 text-center">
        v6.0 Suite
      </div>
    </div>
  );
};

export default Sidebar;