import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { getRDKit } from '../core/rdkit/loader';
import { averageMolecularWeight } from '../core/formulation/molecularWeight';
import { analyzeRepeatUnit } from '../core/polymer/repeatUnit';
import { validateStructure } from '../core/structure/validate';
import { isChemRequest, type ChemRequest, type ChemResponse } from './protocol';

// 由 Vite 產生包含部署 base 的資源網址，避免相對於 Worker 腳本尋找 WASM。
// getRDKit() 是單例，只初始化一次。
const loadRDKit = () =>
  getRDKit({ locateFile: (file, prefix) => (file.endsWith('.wasm') ? wasmUrl : prefix + file) });

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function handle(request: ChemRequest): Promise<ChemResponse> {
  if (request.type === 'status') {
    try {
      const rdkit = await loadRDKit();
      return { type: 'status', id: request.id, ready: true, version: rdkit.version() };
    } catch (e) {
      return { type: 'status', id: request.id, ready: false, error: message(e) };
    }
  }
  if (request.type === 'weight') {
    try {
      const rdkit = await loadRDKit();
      return { type: 'weight', id: request.id, ok: true, weight: averageMolecularWeight(rdkit, request.smiles) };
    } catch (e) {
      return { type: 'weight', id: request.id, ok: false, error: message(e) };
    }
  }
  if (request.type === 'repeatUnit') {
    try {
      const rdkit = await loadRDKit();
      return { type: 'repeatUnit', id: request.id, ok: true, analysis: analyzeRepeatUnit(rdkit, request.smiles) };
    } catch (e) {
      return { type: 'repeatUnit', id: request.id, ok: false, error: message(e) };
    }
  }
  try {
    const rdkit = await loadRDKit();
    return { type: 'validate', id: request.id, ok: true, result: validateStructure(rdkit, request.input) };
  } catch (e) {
    return { type: 'validate', id: request.id, ok: false, error: message(e) };
  }
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isChemRequest(request)) return;
  void handle(request).then((response) => self.postMessage(response));
});
