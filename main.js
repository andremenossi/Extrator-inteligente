const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Script injetado para seleção visual - AGORA COM BROADCAST ENTRE FRAMES
const SELECTOR_SCRIPT = ' ' +
  '(function() {' +
    'function initFrame(doc, win) {' +
        'if (win.__automedInitialized) return;' +
        'win.__automedInitialized = true;' +

        'const style = doc.createElement("style");' +
        'style.innerHTML = ".automed-hover { outline: 4px solid #ef4444 !important; cursor: crosshair !important; z-index: 999999; }";' +
        'if(doc.head) doc.head.appendChild(style);' +

        'function setMode(mode) {' +
            'win.__activeMode = mode;' +
            'if(!mode) {' +
                'const el = doc.querySelector(".automed-hover");' +
                'if(el) el.classList.remove("automed-hover");' +
            '}' +
        '}' +

        'win.addEventListener("message", (e) => {' +
            'if(e.data && e.data.type === "AUTOMED_SET_MODE") {' +
                'setMode(e.data.mode);' +
                // Repassa para sub-iframes deste frame
                'const frames = win.frames;' +
                'for(let i=0; i<frames.length; i++) {' +
                    'try { frames[i].postMessage(e.data, "*"); } catch(err){}' +
                '}' +
            '}' +
        '});' +

        'doc.addEventListener("mouseover", (e) => {' +
          'if (!win.__activeMode) return;' +
          'e.stopPropagation();' +
          'const el = doc.querySelector(".automed-hover");' +
          'if(el) el.classList.remove("automed-hover");' +
          'e.target.classList.add("automed-hover");' +
        '}, true);' +

        'doc.addEventListener("click", (e) => {' +
          'if (!win.__activeMode) return;' +
          'e.preventDefault(); e.stopPropagation();' +
          'const t = e.target;' +
          't.classList.remove("automed-hover");' +
          
          'let res = { mode: win.__activeMode, valid: false };' +
          
          'if (win.__activeMode === "TABLE") {' +
             'res.valid = true;' +
             'res.desc = "Tabela identificada";' +
          '}' +
          'else if (win.__activeMode === "BUTTON") {' +
             'const td = t.closest("td");' +
             'if(td) { ' +
               'res.colIndex = td.cellIndex; ' +
               'res.tag = t.tagName; ' +
               'res.valid = true; ' +
               'res.desc = "Botão na Coluna " + (td.cellIndex + 1);' +
             '} else {' +
               'res.valid = true;' +
               'res.desc = "Elemento clicável identificado";' +
               'res.selector = t.className ? "."+t.className.split(" ")[0] : t.tagName;' +
             '}' +
          '}' +
          'else if (win.__activeMode === "DETAILS") {' +
             'res.selector = t.id ? "#"+t.id : t.className ? "."+t.className.split(" ")[0] : t.tagName;' +
             'res.valid = true;' +
             'res.desc = "Área de detalhes";' +
          '}' +

          'if(res.valid) {' +
            // Envia para o Electron (tenta achar o require, pois nodeIntegration: true)
            'try {' +
                'const ipc = require("electron").ipcRenderer;' +
                'ipc.send("element-selected", res);' +
            '} catch(err) {' +
                'console.log("Erro IPC Frame:", err);' +
            '}' +
            // Limpa modo em todos
            'window.top.postMessage({type: "AUTOMED_SET_MODE", mode: null}, "*");' +
          '}' +
        '}, true);' +
    '}' +

    'initFrame(document, window);' +

    // Observa carregamento de novos frames
    'const observer = new MutationObserver(() => {' +
        'const iframes = document.querySelectorAll("iframe, frame");' +
        'iframes.forEach(ifr => {' +
            'try {' +
                'if(ifr.contentDocument && ifr.contentWindow) {' +
                    'initFrame(ifr.contentDocument, ifr.contentWindow);' +
                '}' +
            '} catch(e){}' +
        '});' +
    '});' +
    'observer.observe(document, { childList: true, subtree: true });' +

    // Tenta inicializar frames já existentes
    'const iframes = document.querySelectorAll("iframe, frame");' +
    'iframes.forEach(ifr => {' +
        'try {' +
            'if(ifr.contentDocument && ifr.contentWindow) initFrame(ifr.contentDocument, ifr.contentWindow);' +
             'ifr.addEventListener("load", () => {' +
                 'try { initFrame(ifr.contentDocument, ifr.contentWindow); } catch(e){}' +
             '});' +
        '} catch(e){}' +
    '});' +
    
    // Handler Inicial (só no Top) recebe do Electron e propaga
    'if (window === window.top) {' +
        'const { ipcRenderer } = require("electron");' +
        'ipcRenderer.on("start-selection-mode", (event, mode) => {' +
          'window.postMessage({type: "AUTOMED_SET_MODE", mode: mode}, "*");' +
        '});' +
    '}' +

  '})();';

let controlWindow;
let targetWindow;
let isStopped = false;

// Configuração do Robô
let robotConfig = {
  tableConfigured: false,
  btnColIndex: -1,
  btnSelector: null,
  detailsSelector: 'body'
};

function createControlWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  
  controlWindow = new BrowserWindow({
    width: 350, 
    height: 600, 
    x: width - 380,
    y: 100,
    frame: false, 
    transparent: true, 
    alwaysOnTop: true, 
    resizable: false,
    hasShadow: true,
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false 
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  controlWindow.loadFile('index.html'); 
  controlWindow.on('closed', () => { app.quit(); });
}

function createTargetWindow(url) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.loadURL(url);
    targetWindow.focus();
    return;
  }

  targetWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { 
        nodeIntegration: true, 
        contextIsolation: false,
        webSecurity: false, // CRITICO: Permite acesso cross-frame em intranet
        allowRunningInsecureContent: true,
        backgroundThrottling: false
    }
  });
  
  targetWindow.loadURL(url);
  
  // Injeta o script em cada navegação
  targetWindow.webContents.on('did-finish-load', () => {
    targetWindow.webContents.executeJavaScript(SELECTOR_SCRIPT).catch(e => console.log('Erro injeção:', e));
  });
}

app.whenReady().then(() => {
  createControlWindow();
});

// --- IPC HANDLERS ---

ipcMain.on('app-close', () => app.quit());
ipcMain.on('app-minimize', () => controlWindow.minimize());

ipcMain.on('open-browser', (event, url) => {
  createTargetWindow(url || 'https://intranet.hepresidenteprudente.org.br/');
});

ipcMain.on('trigger-select', (event, mode) => {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.focus();
  // Envia para o TOP frame, o script lá vai fazer o broadcast para os iframes
  targetWindow.webContents.send('start-selection-mode', mode);
});

ipcMain.on('cancel-select', () => {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  // Envia mode: null para cancelar
  targetWindow.webContents.send('start-selection-mode', null);
});

ipcMain.on('element-selected', (event, data) => {
  if (data.mode === 'TABLE') robotConfig.tableConfigured = true;
  else if (data.mode === 'BUTTON') {
    robotConfig.btnColIndex = data.colIndex;
    robotConfig.btnSelector = data.selector;
  } 
  else if (data.mode === 'DETAILS') robotConfig.detailsSelector = data.selector;
  
  controlWindow.webContents.send('config-update', { ...data });
});

ipcMain.on('stop-extraction', () => {
  isStopped = true;
});

ipcMain.on('start-extraction', async (event, { maxRows }) => {
  if (!targetWindow) return;
  isStopped = false;
  let collectedData = [];
  
  event.reply('status', 'Iniciando...');

  try {
    // Tenta contar linhas (buscando em todos os frames)
    const rowsCount = await targetWindow.webContents.executeJavaScript(`
      (function(){
          let max = 0;
          function count(doc) {
              const trs = doc.querySelectorAll('tr').length;
              if(trs > max) max = trs;
              const frames = doc.querySelectorAll('iframe, frame');
              frames.forEach(f => { try { if(f.contentDocument) count(f.contentDocument); } catch(e){} });
          }
          count(document);
          return max;
      })()
    `);
    
    // Injeção de Iframe Seguro para evitar Reload
    await targetWindow.webContents.executeJavaScript(`
      if(!document.getElementById('automed-frame')) {
        const ifr = document.createElement('iframe');
        ifr.name = 'automed-frame';
        ifr.id = 'automed-frame';
        ifr.style.width = '0'; ifr.style.height = '0';
        document.body.appendChild(ifr);
      }
      const form = document.querySelector('form');
      if(form) form.target = 'automed-frame';
    `);

    for (let i = 1; i < Math.min(rowsCount, maxRows + 5); i++) {
       if (isStopped) {
         event.reply('status', 'Parado.');
         break;
       }

       event.reply('status', `Paciente ${i}...`);
       event.reply('progress', { current: i, total: maxRows });

       const success = await targetWindow.webContents.executeJavaScript(`
         (function(){
            // Função recursiva de busca e clique
            function findAndClick(doc) {
                const rows = doc.querySelectorAll('tr');
                let btn = null;
                
                // Só tenta clicar se a linha existir neste frame
                if(rows[${i}]) {
                    if (${robotConfig.btnColIndex} >= 0) {
                       const cell = rows[${i}].cells[${robotConfig.btnColIndex}];
                       if(cell) btn = cell.querySelector('a, input, img, button');
                    } else {
                       btn = rows[${i}].querySelector('${robotConfig.btnSelector || 'input'}');
                    }
                }

                if(btn) {
                    // Clicar
                    const mE = new MouseEvent('click', {bubbles:true, cancelable:true, view:window});
                    btn.dispatchEvent(mE);
                    return true;
                }

                // Busca em frames filhos
                const frames = doc.querySelectorAll('iframe, frame');
                for(let f=0; f<frames.length; f++) {
                    try {
                        if(frames[f].contentDocument) {
                            if(findAndClick(frames[f].contentDocument)) return true;
                        }
                    } catch(e){}
                }
                return false;
            }

            return findAndClick(document);
         })()
       `);

       if (success) {
         await new Promise(r => setTimeout(r, 2500)); 
         
         const details = await targetWindow.webContents.executeJavaScript(`
            (function() {
              const res = {};
              const ifr = document.getElementById('automed-frame');
              
              let docToRead = document;
              // Se tiver iframe de carga, usa ele
              if (ifr && ifr.contentDocument && ifr.contentDocument.body.innerHTML.length > 50) {
                  docToRead = ifr.contentDocument;
              }
              
              function extract(d) {
                  // Estratégia Input
                  d.querySelectorAll('input[type=text]').forEach(i => {
                     let label = 'Desconhecido';
                     const parentTd = i.closest('td');
                     if(parentTd && parentTd.previousElementSibling) {
                        label = parentTd.previousElementSibling.innerText.trim().replace(':','');
                     }
                     if(i.value) res[label] = i.value;
                  });
                  // Estratégia Select
                  d.querySelectorAll('select').forEach(s => {
                      let label = s.id || 'Select';
                      const parentTd = s.closest('td');
                      if(parentTd && parentTd.previousElementSibling) {
                        label = parentTd.previousElementSibling.innerText.trim().replace(':','');
                      }
                      res[label] = s.options[s.selectedIndex]?.text || '';
                  });
                  // Estratégia Radio Checked
                  d.querySelectorAll('input[type=radio]:checked').forEach(r => {
                      let label = r.name || 'Radio';
                      const lbl = d.querySelector('label[for="'+r.id+'"]');
                      const val = lbl ? lbl.innerText : r.value;
                      res[label] = val;
                  });
              }

              extract(docToRead);
              
              const frames = docToRead.querySelectorAll('iframe, frame');
              frames.forEach(f => { try { if(f.contentDocument) extract(f.contentDocument); } catch(e){} });

              return res;
            })()
         `);
         collectedData.push(details);
       }
    }

    if (collectedData.length > 0) {
      const { filePath } = await dialog.showSaveDialog(controlWindow, { defaultPath: 'Extracao_G_O.csv' });
      if(filePath) {
        const allKeys = [...new Set(collectedData.flatMap(Object.keys))];
        const header = allKeys.join(';');
        const csvRows = collectedData.map(row => {
          return allKeys.map(k => (row[k] || '').replace(/;/g, ',').replace(/[\r\n]+/g, ' ')).join(';');
        });
        
        const csvContent = "sep=;\n" + header + "\n" + csvRows.join('\n');
        fs.writeFileSync(filePath, csvContent, 'utf-8');
        event.reply('status', 'Salvo com sucesso!');
      }
    } else {
      event.reply('status', 'Sem dados para salvar.');
    }

  } catch (err) {
    event.reply('status', 'Erro: ' + err.message);
  }
});