import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { getRDKit } from '../core/rdkit/loader';
import { isChemRequest, type ChemResponse } from './protocol';

// 由 Vite 產生包含部署 base 的資源網址，避免相對於 Worker 腳本尋找 WASM。
// getRDKit() 是單例，只初始化一次。
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isChemRequest(request)) return;
  void (async () => {
    let response: ChemResponse;
    try {
      const rdkit = await getRDKit({
        locateFile: (file, prefix) => (file.endsWith('.wasm') ? wasmUrl : prefix + file),
      });
      response = { type: 'status', id: request.id, ready: true, version: rdkit.version() };
    } catch (e) {
      response = { type: 'status', id: request.id, ready: false, error: e instanceof Error ? e.message : String(e) };
    }
    self.postMessage(response);
  })();
});