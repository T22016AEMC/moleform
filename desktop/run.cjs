// 啟動 Electron（開發與自我檢查用）。
// VS Code 的終端機會帶 ELECTRON_RUN_AS_NODE=1，Electron 會因此變成純 Node 執行、不開視窗，所以先移除它。
'use strict';

const { spawn } = require('node:child_process');
const electronPath = require('electron'); // 從 Node 載入時回傳 electron.exe 路徑（缺少時會先下載）

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], { cwd: __dirname, env, stdio: 'inherit', windowsHide: false });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
