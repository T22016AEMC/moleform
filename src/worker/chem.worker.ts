import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { getRDKit } from '../core/rdkit/loader';
import { analyzeCrosslink } from '../core/crosslink/analyze';
import { drawMarkedStructure, reactiveAtomsOf } from '../core/crosslink/draw';
import { bundledTexts, loadTables } from '../core/data/load';
import { averageMolecularWeight } from '../core/formulation/molecularWeight';
import { analyzePolymerUnits } from '../core/polymer/copolymer';
import { capRepeatUnit } from '../core/polymer/unitFragment';
import { validateStructure } from '../core/structure/validate';
import { isChemRequest, type ChemRequest, type ChemResponse } from './protocol';

// 由 Vite 產生包含部署 base 的資源網址，避免相對於 Worker 腳本尋找 WASM。
// getRDKit() 是單例，只初始化一次。
const loadRDKit = () =>
  getRDKit({ locateFile: (file, prefix) => (file.endsWith('.wasm') ? wasmUrl : prefix + file) });

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const tables = () => {
  const { tables: loaded } = loadTables(bundledTexts);
  return { functionalGroups: loaded.functionalGroups.rows, reactionRules: loaded.reactionRules.rows };
};

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
      return { type: 'repeatUnit', id: request.id, ok: true, analysis: analyzePolymerUnits(rdkit, request.smiles, { units: request.units, fractionBasis: request.fractionBasis, endGroups: request.endGroups }) };
    } catch (e) {
      return { type: 'repeatUnit', id: request.id, ok: false, error: message(e) };
    }
  }
  if (request.type === 'crosslink') {
    try {
      const rdkit = await loadRDKit();
      const result = analyzeCrosslink(rdkit, request.components, tables());
      const svgs: Record<string, string> = {};
      for (const analysis of result.components) {
        const marked = result.markedAtoms[analysis.id];
        if (!marked) continue; // 不參與反應的成分不畫
        const svg = drawMarkedStructure(rdkit, analysis.source, marked, { color: request.color });
        if (svg) svgs[analysis.id] = svg;
        // 共聚物：第二種以後的單元各畫一張，鍵為「成分編號#單元序號」（序號從 1 起算，第 0 種用成分編號）
        // 聚合物端基（任務 022）：有反應原子的端基各畫一張，鍵為「成分編號@end1／@end2」
        const perEnd = result.markedEndAtoms[analysis.id];
        if (perEnd && analysis.ends) {
          perEnd.forEach((atoms, k) => {
            const end = analysis.ends?.[k];
            if (!atoms || !end) return;
            const endSvg = drawMarkedStructure(rdkit, end.smiles, atoms, { color: request.color, width: 240, height: 180 });
            if (endSvg) svgs[`${analysis.id}@end${k + 1}`] = endSvg;
          });
        }
        const perUnit = result.markedUnitAtoms[analysis.id];
        if (perUnit && analysis.units) {
          for (let k = 1; k < analysis.units.length; k++) {
            const unitSvg = drawMarkedStructure(rdkit, analysis.units[k].smiles, perUnit[k] ?? [], { color: request.color });
            if (unitSvg) svgs[`${analysis.id}#${k}`] = unitSvg;
          }
          if (analysis.units[0] && perUnit[0]) {
            const first = drawMarkedStructure(rdkit, analysis.units[0].smiles, perUnit[0], { color: request.color });
            if (first) svgs[analysis.id] = first;
          }
        }
      }
      return { type: 'crosslink', id: request.id, ok: true, result, svgs };
    } catch (e) {
      return { type: 'crosslink', id: request.id, ok: false, error: message(e) };
    }
  }
  if (request.type === 'draw') {
    try {
      const rdkit = await loadRDKit();
      let marked: number[] = [];
      if (request.mark) {
        const t = tables();
        marked = reactiveAtomsOf(rdkit, request.source, t.functionalGroups, t.reactionRules, request.polymer);
      }
      const svg = drawMarkedStructure(rdkit, request.source, marked, { color: request.color, width: request.width, height: request.height });
      return { type: 'draw', id: request.id, ok: true, svg, marked: marked.length };
    } catch (e) {
      return { type: 'draw', id: request.id, ok: false, error: message(e) };
    }
  }
  if (request.type === 'unitFragment') {
    try {
      const rdkit = await loadRDKit();
      const capped = capRepeatUnit(rdkit, request.smiles);
      if (!capped.ok) return { type: 'unitFragment', id: request.id, ok: true, fragment: null, message: capped.message, reactiveAtoms: [] };
      const t = tables();
      // 反應原子以原單元計算並排除連接點，與 2D 單元圖相同；封端不改變原子順序，所以編號直接適用於 3D
      const reactiveAtoms = reactiveAtomsOf(rdkit, request.smiles, t.functionalGroups, t.reactionRules, true);
      return { type: 'unitFragment', id: request.id, ok: true, fragment: capped.fragment, message: '', reactiveAtoms };
    } catch (e) {
      return { type: 'unitFragment', id: request.id, ok: false, error: message(e) };
    }
  }
  if (request.type === 'reactiveAtoms') {
    try {
      const rdkit = await loadRDKit();
      const t = tables();
      return { type: 'reactiveAtoms', id: request.id, ok: true, atoms: reactiveAtomsOf(rdkit, request.source, t.functionalGroups, t.reactionRules) };
    } catch (e) {
      return { type: 'reactiveAtoms', id: request.id, ok: false, error: message(e) };
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
