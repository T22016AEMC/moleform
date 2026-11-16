// preload（任務 I01）：只暴露兩個函式給網頁；權杖、埠、引擎位址都不經過這裡。
// sandbox 的 preload 只能用 contextBridge 與 ipcRenderer。路徑白名單在主程式端（bridge.cjs）檢查。
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'moleformEngine',
  Object.freeze({
    /** call('/tg', { smiles }) → { ok, status, body } 或 { ok: false, error } */
    call: (path, body) => ipcRenderer.invoke('moleform-engine:call', path, body),
    /** → { state: 'starting' | 'ready' | 'unavailable' | 'not-started', error? } */
    status: () => ipcRenderer.invoke('moleform-engine:status'),
  }),
);
