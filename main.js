const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow;
let targetWindow;
let isRunning = false;

// --- CONFIGURAÇÃO DE SEGURANÇA E JANELAS ---

function createControlWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  
  controlWindow = new BrowserWindow({
    width: 400, 
    height: 700, 
    x: width - 420,
    y: 50,
    frame: false, // Widget flutuante
    transparent: true, 
    alwaysOnTop: true, 
    resizable: false,
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false, // Necessário para usar 'require' no index.html inline
      webSecurity: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  controlWindow.loadFile('index.html');
  // Se estiver em dev: controlWindow.webContents.openDevTools({ mode: 'detach' });
  controlWindow.on('closed', () => app.quit());
}

function createTargetWindow(url) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.loadURL(url);
    targetWindow.show();
    return;
  }

  targetWindow = new BrowserWindow({
    width: 1280, 
    height: 800,
    webPreferences: { 
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // CRITICO: Permite acessar frames de origens diferentes (comum em intranets)
        sandbox: false,
    }
  });
  
  targetWindow.loadURL(url);
  
  // Injeta o "Agente" em cada navegação
  targetWindow.webContents.on('did-finish-load', () => {
    injectSeleniumAgent();
  });
}

app.whenReady().then(createControlWindow);

ipcMain.on('app-close', () => app.quit());
ipcMain.on('open-browser', (event, url) => createTargetWindow(url || 'https://intranet.hepresidenteprudente.org.br/'));

// --- LÓGICA "SELENIUM" (O Agente Injetado) ---

// Este script é injetado no navegador alvo. Ele se espalha como um vírus benéfico
// por todos os frames e iframes para permitir a seleção e automação.
const SELENIUM_AGENT_SCRIPT = `
(function() {
    if (window.__seleniumAgentActive) return;
    window.__seleniumAgentActive = true;

    // Estilos visuais para o modo de seleção
    const style = document.createElement('style');
    style.innerHTML = \`
        .selenium-highlight { 
            outline: 4px solid #f59e0b !important; 
            outline-offset: -2px !important;
            background: rgba(245, 158, 11, 0.2) !important;
            cursor: crosshair !important;
            z-index: 999999 !important;
        }
        .selenium-clicked {
            outline: 4px solid #22c55e !important;
            background: rgba(34, 197, 94, 0.2) !important;
        }
    \`;
    document.head.appendChild(style);

    // Identificação do Frame Atual (Caminho até o topo)
    function getFramePath() {
        let path = [];
        let win = window;
        while (win !== window.top) {
            // Descobrir qual índice este frame ocupa no pai
            let parent = win.parent;
            for (let i = 0; i < parent.frames.length; i++) {
                if (parent.frames[i] === win) {
                    path.unshift(i); // Adiciona o índice no início
                    break;
                }
            }
            win = parent;
        }
        return path; // Ex: [0, 1] -> Frame 0 > Frame 1
    }

    // Gerador de Seletor CSS Único
    function getCssSelector(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return '#' + el.id;
        
        let path = [];
        while (el && el.nodeType === 1) {
            let selector = el.nodeName.toLowerCase();
            if (el.className) {
                // Pega apenas a primeira classe para evitar classes dinâmicas complexas
                const cleanClass = el.className.split(' ')[0].trim();
                if(cleanClass) selector += '.' + cleanClass;
            }
            
            // Adiciona nth-child se houver irmãos
            let sibling = el, nth = 1;
            while (sibling = sibling.previousElementSibling) {
                if (sibling.nodeName.toLowerCase() == selector.split('.')[0]) nth++;
            }
            if (nth > 1) selector += \`:nth-of-type(\${nth})\`;
            
            path.unshift(selector);
            el = el.parentElement;
            // Para se chegar num ID ou Body
            if (el && el.id) {
                path.unshift('#' + el.id);
                break;
            }
        }
        return path.join(' > ');
    }

    // Listener de Seleção
    function enableSelectionMode(modeType) {
        const handlerOver = (e) => {
            e.stopPropagation();
            e.target.classList.add('selenium-highlight');
        };
        const handlerOut = (e) => {
            e.stopPropagation();
            e.target.classList.remove('selenium-highlight');
        };
        const handlerClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const el = e.target;
            el.classList.remove('selenium-highlight');
            el.classList.add('selenium-clicked');
            
            setTimeout(() => el.classList.remove('selenium-clicked'), 1000);

            // Envia dados para o Electron (Top Window -> Main Process)
            const selector = getCssSelector(el);
            const framePath = getFramePath();
            
            window.top.postMessage({
                type: 'SELENIUM_ELEMENT_SELECTED',
                payload: {
                    mode: modeType,
                    selector: selector,
                    framePath: framePath, // Onde está o elemento
                    tagName: el.tagName,
                    innerText: el.innerText.substring(0, 50)
                }
            }, '*');

            disableSelectionMode();
        };

        window.__seleniumHandlers = { handlerOver, handlerOut, handlerClick };
        document.addEventListener('mouseover', handlerOver, true);
        document.addEventListener('mouseout', handlerOut, true);
        document.addEventListener('click', handlerClick, true);
    }

    function disableSelectionMode() {
        if (window.__seleniumHandlers) {
            document.removeEventListener('mouseover', window.__seleniumHandlers.handlerOver, true);
            document.removeEventListener('mouseout', window.__seleniumHandlers.handlerOut, true);
            document.removeEventListener('click', window.__seleniumHandlers.handlerClick, true);
            window.__seleniumHandlers = null;
        }
    }

    // Escuta comandos do processo principal
    window.addEventListener('message', (e) => {
        if (e.data.type === 'CMD_START_SELECT') {
            enableSelectionMode(e.data.mode);
        }
        if (e.data.type === 'CMD_STOP_SELECT') {
            disableSelectionMode();
        }
    });

    // Propagar agente para frames filhos
    function injectChildren() {
        const frames = document.querySelectorAll('iframe, frame');
        frames.forEach(f => {
            try {
                // Tenta injetar via javascript: se mesmo domínio, ou espera carregar
                if (f.contentWindow) {
                    // O Electron Main Process injetará aqui via executeJavaScript recursivo,
                    // mas podemos tentar propagar a mensagem
                    f.contentWindow.postMessage({ type: 'PING_AGENT' }, '*');
                }
            } catch(err) {}
        });
    }
    setInterval(injectChildren, 2000);
})();
`;

function injectSeleniumAgent() {
    if (!targetWindow || targetWindow.isDestroyed()) return;
    
    // Injeção Recursiva Poderosa: Navega por todos os webFrames do Electron
    targetWindow.webContents.executeJavaScript(`
        (function() {
             const script = \`${SELENIUM_AGENT_SCRIPT.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`;
             
             // Função para injetar em uma janela e seus frames
             function propagate(win) {
                try {
                    win.eval(script);
                    for (let i = 0; i < win.frames.length; i++) {
                        propagate(win.frames[i]);
                    }
                } catch(e) { console.log('Bloqueio de segurança em frame ignorado'); }
             }
             
             propagate(window);
             
             // Setup do listener de comunicação no TOPO
             if (window === window.top && !window.__ipcBridge) {
                window.__ipcBridge = true;
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.type === 'SELENIUM_ELEMENT_SELECTED') {
                        // Converte para string segura para o console do Electron capturar
                        console.log('__SELENIUM_IPC__:' + JSON.stringify(e.data.payload));
                    }
                });
             }
        })()
    `).catch(err => console.log("Erro de injeção:", err));
}

// Captura mensagens do console da janela alvo (ponte IPC improvisada e segura)
ipcMain.on('setup-ipc-listener', () => {
    if(!targetWindow) return;
    targetWindow.webContents.on('console-message', (e, level, msg) => {
        if (msg.startsWith('__SELENIUM_IPC__:')) {
            const payload = JSON.parse(msg.replace('__SELENIUM_IPC__:', ''));
            controlWindow.webContents.send('element-captured', payload);
            
            // Para a seleção visual
            targetWindow.webContents.executeJavaScript(`
                (function(){
                    function stopAll(win) {
                        win.postMessage({type: 'CMD_STOP_SELECT'}, '*');
                        for(let i=0; i<win.frames.length; i++) stopAll(win.frames[i]);
                    }
                    stopAll(window.top);
                })()
            `);
        }
    });
});

// --- COMANDOS DO USUÁRIO ---

ipcMain.on('trigger-select', (event, mode) => {
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.focus();
    
    // Manda comando para TODOS os frames iniciarem modo de seleção
    targetWindow.webContents.executeJavaScript(`
        (function(){
            function startAll(win) {
                win.postMessage({type: 'CMD_START_SELECT', mode: '${mode}'}, '*');
                for(let i=0; i<win.frames.length; i++) startAll(win.frames[i]);
            }
            startAll(window.top);
        })()
    `);
});

ipcMain.on('stop-extraction', () => { isRunning = false; });

ipcMain.on('start-selenium-run', async (event, config) => {
    if (!targetWindow || targetWindow.isDestroyed()) return;
    isRunning = true;
    
    // Função auxiliar executada no contexto do navegador
    // Ela navega até o frame correto usando o caminho [0, 1, etc] e executa ação
    const browserActionScript = (framePath, selector, action, value = null) => `
        (function() {
            let win = window.top;
            const path = ${JSON.stringify(framePath)};
            
            // Viaja pelos frames
            for (let i = 0; i < path.length; i++) {
                if (win.frames[path[i]]) {
                    win = win.frames[path[i]];
                } else {
                    return { success: false, error: 'Frame path not found: ' + i };
                }
            }
            
            const el = win.document.querySelector('${selector}');
            if (!el) return { success: false, error: 'Element not found' };
            
            if ('${action}' === 'click') {
                el.click();
                return { success: true };
            }
            
            if ('${action}' === 'read') {
                 // Lógica inteligente de leitura
                 if (el.tagName === 'TABLE') {
                     // Retorna HTML da tabela para processar no main process ou JSON simples
                     const rows = Array.from(el.querySelectorAll('tr'));
                     return { success: true, data: rows.length };
                 }
                 return { success: true, data: el.innerText };
            }

            return { success: false, error: 'Unknown action' };
        })()
    `;

    try {
        event.reply('status', 'Iniciando Robô Selenium...');

        // 1. Encontrar Tabela (Loop Principal)
        // Aqui assumimos que o seletor da tabela aponta para um TR genérico ou a própria TABLE
        // Para simplificar, vamos assumir que o usuário clicou em uma linha da tabela ou no botão
        
        const limit = config.maxRows || 10;
        
        // LOOP DE PACIENTES
        for (let i = 0; i < limit; i++) {
            if (!isRunning) break;
            
            event.reply('status', `Processando Linha ${i + 1}...`);
            event.reply('progress', { current: i, total: limit });

            // A Lógica "Selenium" aqui é complexa pois depende de como a tabela é construída
            // Vamos tentar encontrar o botão baseado no Path gravado, mas alterando o índice do TR se possível
            // Ou simplesmente procurando TODOS os botões naquele frame específico.

            // ESTRATÉGIA ROBUSTA:
            // 1. Ir até o frame do botão.
            // 2. Pegar todos os elementos que correspondem ao seletor do botão.
            // 3. Clicar no elemento [i].
            
            const btnConfig = config.steps.BUTTON;
            
            const clickResult = await targetWindow.webContents.executeJavaScript(`
                (function() {
                    let win = window.top;
                    const path = ${JSON.stringify(btnConfig.framePath)};
                    for (let idx of path) win = win.frames[idx];
                    
                    // Tenta achar lista de botões similares
                    // Remove :nth-child e IDs específicos para tentar pegar a lista
                    // Esta é uma heurística simples.
                    
                    // Se o usuário selecionou um botão específico, vamos tentar clicar nele
                    // Mas num loop, precisamos do "próximo".
                    // Vamos tentar pegar todos os elementos com a mesma classe/tag do alvo
                    
                    const selector = '${btnConfig.selector}';
                    // Tenta simplificar o seletor para pegar todos da coluna
                    const simpleSelector = selector.split(':nth')[0]; 
                    
                    const allBtns = win.document.querySelectorAll(simpleSelector);
                    const btn = allBtns[${i}]; // Pega o i-ésimo botão
                    
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            `);

            if (clickResult) {
                // Espera carregamento (delay simples ou esperar elemento aparecer)
                event.reply('status', 'Aguardando carregamento...');
                await new Promise(r => setTimeout(r, 3000));
                
                // Extrair Detalhes
                if (config.steps.DETAILS) {
                     const detConfig = config.steps.DETAILS;
                     const text = await targetWindow.webContents.executeJavaScript(
                        browserActionScript(detConfig.framePath, detConfig.selector, 'read')
                     );
                     // Salvar dados (mock)
                     console.log("Dados extraídos:", text);
                }
                
                // Voltar (se necessário - browser back)
                targetWindow.webContents.goBack();
                await new Promise(r => setTimeout(r, 2000));
                // Re-injetar script pois a página recarregou
                injectSeleniumAgent();
                await new Promise(r => setTimeout(r, 1000));

            } else {
                event.reply('status', 'Fim da lista ou botão não encontrado.');
                break;
            }
        }
        
        event.reply('status', 'Finalizado com Sucesso.');
        
    } catch (err) {
        event.reply('status', 'Erro: ' + err.message);
    }
    
    isRunning = false;
});