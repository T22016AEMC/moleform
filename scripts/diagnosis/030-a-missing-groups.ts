// 任務 030 A 節：缺基團盤點（拋棄式診斷腳本，不進 src、不進建置）。
// 對「使用者材料」與「半導體常用材料（D53，SMILES 待使用者審）」兩組結構，各自跑四種計算（Tg／Joback／VW／莫耳體積），
// 把回報「缺基團」的原子依規則歸成「原子團」標籤（環氧環、酚羥基、稠合環…），輸出 docs/verification/030-診斷-A-缺基團-輸出.md。
// 只呼叫既有的 src 函式，不修改任何 src 或資料表。執行：node scripts/diagnosis/030-a-missing-groups.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { USER_SMALL, USER_UNITS, SEMI } from './030-structures.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '030-診斷-A-缺基團-輸出.md');

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { computeJoback } = await server.ssrLoadModule('/src/core/properties/jobackTbTf.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { computeMolarVolumeDensity } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { readGraph } = await server.ssrLoadModule('/src/core/properties/molGraph.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  type Item = { group: '使用者材料' | '半導體常用材料'; name: string; smiles: string; kind: '小分子' | '聚合物單元'; note: string };
  const items: Item[] = [
    ...USER_SMALL.map((s: any) => ({ group: '使用者材料' as const, name: s.name, smiles: s.smiles, kind: '小分子' as const, note: s.from })),
    ...USER_UNITS.map((s: any) => ({ group: '使用者材料' as const, name: s.name, smiles: s.smiles, kind: '聚合物單元' as const, note: s.from })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ group: '使用者材料' as const, name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, kind: '聚合物單元' as const, note: '骨架範本（任務 023）' })),
    ...SEMI.map((s: any) => ({ group: '半導體常用材料' as const, name: s.name, smiles: s.smiles, kind: s.kind, note: `${s.cls}；待使用者審` })),
  ];

  // ---------- 缺基團原子 → 原子團標籤 ----------
  const matchSets = (mol: any, smarts: string): number[][] => {
    const q = RDKit.get_qmol(smarts);
    try {
      const parsed = JSON.parse(mol.get_substruct_matches(q));
      return Array.isArray(parsed) ? parsed.map((m: any) => m.atoms as number[]) : [];
    } finally {
      q.delete();
    }
  };

  /** 每個原子一個標籤（規則依序，先符合者優先）。這只是「描述缺的是什麼」，不是決定怎麼拆。 */
  function labelAtoms(smiles: string): { labels: (string | null)[]; graph: any; mol: any } {
    const mol = RDKit.get_mol(smiles);
    const g = readGraph(mol);
    const n = g.z.length;
    const labels: (string | null)[] = new Array(n).fill(null);
    const put = (atoms: number[], label: string) => {
      for (const a of atoms) if (labels[a] === null) labels[a] = label;
    };
    // 官能基（先標，整組原子一起）
    for (const m of matchSets(mol, '[CX4;R1]1[CX4;R1][OX2;R1]1')) put(m, '環氧環');
    for (const m of matchSets(mol, '[#6][#6](=O)[#8][#6](=O)[#6]')) put(m, '酸酐（–C(=O)–O–C(=O)–）');
    for (const m of matchSets(mol, '[#6][#6](=O)[#7]([#6]=O)[#6,#0]')) put(m, '醯亞胺');
    for (const m of matchSets(mol, '[CX3](=O)[OX2H]')) put(m, '羧酸 –COOH');
    for (const m of matchSets(mol, '[OX2H]-a')) put(m, '酚羥基 –OH');
    for (const m of matchSets(mol, '[OX2H]-[CX4]')) put(m, '醇羥基 –OH');
    for (const m of matchSets(mol, '[NX3H2]-a')) put(m, '芳香胺 –NH2');
    for (const m of matchSets(mol, '[NX3H2]-[#6]')) put(m, '胺基 –NH2');
    for (const m of matchSets(mol, '[#6]C(=O)[OX2]-[CX4]')) put(m, '脂肪族酯（–COO–，酯基接脂肪碳）');
    for (const m of matchSets(mol, '[#6]C(=O)[OX2]-a')) put(m, '芳香酯（–COO–，酯基接芳香碳）');
    for (const m of matchSets(mol, '[#6]S(=O)(=O)[#6]')) put(m, '碸 –SO2–');
    for (const m of matchSets(mol, '[#15]')) put(m, '磷 P');
    for (const m of matchSets(mol, '[#5]')) put(m, '硼 B');
    for (const m of matchSets(mol, '[#14]')) put(m, '矽 Si');
    for (const m of matchSets(mol, '[#6]C#N')) put(m, '腈 –C≡N');
    for (const m of matchSets(mol, 'N-C(=N)-N')) put(m, '胍／氰胍基');
    for (const m of matchSets(mol, 'N#C')) put(m, '氰基');
    for (const m of matchSets(mol, '[Cl,Br,I]')) put(m, '氯／溴／碘');
    for (const m of matchSets(mol, '[F]')) put(m, '氟');
    for (const m of matchSets(mol, '[CX3]=[CX3]')) put(m, '烯 C=C');
    // 環系統：以環鍵連通分量為單位
    const ringAtoms = new Set<number>(matchSets(mol, '[R]').map((m) => m[0]));
    const ringEdges = matchSets(mol, '[R]@[R]');
    const adj = new Map<number, Set<number>>();
    for (const [a, b] of ringEdges) {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
    const r2 = new Set<number>(matchSets(mol, '[R2]').map((m) => m[0]));
    const seen = new Set<number>();
    for (const start of ringAtoms) {
      if (seen.has(start)) continue;
      const comp: number[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const a = stack.pop()!;
        comp.push(a);
        for (const b of adj.get(a) ?? []) if (!seen.has(b)) (seen.add(b), stack.push(b));
      }
      const hasShared = comp.some((a) => r2.has(a));
      const nArom = comp.filter((a) => g.aromatic[a]).length;
      const hetero = comp.filter((a) => g.z[a] !== 6);
      const exo = comp.reduce((s, a) => s + g.neighbors[a].filter((b: number) => !comp.includes(b)).length, 0);
      let label: string;
      if (comp.length === 3 && hetero.length === 1) label = '環氧環';
      else if (comp.length === 4) label = '四員環（環丁烯並苯等）';
      else if (hetero.length > 0 && nArom === comp.length && comp.length <= 5) label = '五員雜芳香環（咪唑／噁唑等）';
      else if (hasShared && nArom === comp.length && hetero.length === 0) label = '稠合芳香環（萘等）';
      else if (hasShared && nArom === comp.length) label = '稠合雜芳香環（苯并噁唑等）';
      else if (hasShared && nArom > 0) label = '芳香–脂肪稠環（茀／茚滿／螺環等）';
      else if (hasShared) label = '橋環／稠合脂肪環（三環癸烷等）';
      else if (nArom === comp.length && comp.length === 6 && hetero.length === 0) label = `苯環（${exo} 個連接）`;
      else if (nArom === comp.length) label = '雜芳香環';
      else label = '單一脂肪環';
      // 與醯亞胺、酸酐稠合的環系：整個環系算同一個原子團
      const fused = comp.map((a) => labels[a]).find((l) => l === '醯亞胺' || l === '酸酐（–C(=O)–O–C(=O)–）');
      put(comp, fused ?? label);
    }
    for (const m of matchSets(mol, '[OX2H0;!R;$(O(-[#0])-a)]')) put(m, '醚 O 接連接點（*–O–Ar）');
    for (const m of matchSets(mol, '[OX2H0;!R;$(O(-a)-a)]')) put(m, '芳香醚 O（Ar–O–Ar）');
    for (const m of matchSets(mol, '[OX2H0;!R;$(O(-a)-[CX4])]')) put(m, '芳基烷基醚 O（Ar–O–C）');
    for (const m of matchSets(mol, '[OX2H0;!R;$(O(-[CX4])-[CX4])]')) put(m, '脂肪醚 O（C–O–C）');
    for (const m of matchSets(mol, '[CX4H3]')) put(m, '–CH3');
    for (const m of matchSets(mol, '[CX4H2;!R]')) put(m, '–CH2–（鏈上，被鄰近缺基團牽連或側鏈）');
    for (const m of matchSets(mol, '[CX4H1;!R]')) put(m, '>CH–（鏈上）');
    for (const m of matchSets(mol, '[CX4H0;!R]')) put(m, '>C<（鏈上，四級碳）');
    return { labels, graph: g, mol };
  }

  /** 把缺基團原子依標籤彙整成「原子團×個數」（同標籤相連的原子算一個） */
  function summarize(smiles: string, missingIdx: number[]): string {
    if (missingIdx.length === 0) return '—';
    const { labels, graph, mol } = labelAtoms(smiles);
    mol.delete();
    const byLabel = new Map<string, number[]>();
    for (const i of missingIdx) {
      const l = labels[i] ?? `其他（${['*', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F'][graph.z[i]] ?? `Z${graph.z[i]}`}）`;
      if (!byLabel.has(l)) byLabel.set(l, []);
      byLabel.get(l)!.push(i);
    }
    const parts: string[] = [];
    for (const [label, atoms] of byLabel) {
      const set = new Set(atoms);
      const visited = new Set<number>();
      let comps = 0;
      for (const a of atoms) {
        if (visited.has(a)) continue;
        comps++;
        const st = [a];
        visited.add(a);
        while (st.length) {
          const x = st.pop()!;
          for (const y of graph.neighbors[x]) if (set.has(y) && !visited.has(y)) (visited.add(y), st.push(y));
        }
      }
      parts.push(`${label} ×${comps}（${atoms.length} 原子）`);
    }
    return parts.join('；');
  }

  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  const cell = (t: string) => t.replace(/\|/g, '\\|');
  const stat = (r: any, kind: string) => (r.status === 'ok' ? 'ok' : r.status === 'missing' ? 'missing' : r.status === 'not-applicable' || r.status === 'unsupported' ? 'na' : `invalid:${r.message ?? ''}`) + (kind ? '' : '');

  out('# 任務 030 A：缺基團盤點輸出');
  out();
  out('由 `scripts/diagnosis/030-a-missing-groups.ts` 產生（拋棄式診斷腳本，只呼叫既有 src 函式）。「缺的原子團」是依規則對缺基團原子做的描述（環系統、官能基 SMARTS），**不是**拆解建議；每格為「原子團 ×個數（原子數）」。');
  out('「ok」＝四種方法目前都能算；「—」＝該方法不適用於此類型（Joback 只算小分子；莫耳體積只算聚合物單元，小分子液體法未實作）。');
  out();
  out(`RDKit ${RDKit.version()}。半導體常用材料的 SMILES 由 Claude 依結構名稱撰寫，**待使用者審**。`);
  out();

  const rowsData: any[] = [];
  for (const it of items) {
    const tg = computeTg(RDKit, it.smiles);
    const jb = it.kind === '小分子' ? computeJoback(RDKit, it.smiles) : null;
    const vw = computeVdwVolume(RDKit, it.smiles);
    const vm = it.kind === '聚合物單元' ? computeMolarVolumeDensity(RDKit, it.smiles) : null;
    const mIdx = (r: any): number[] => (r && r.status === 'missing' ? r.missing.map((m: any) => m.index) : []);
    const cellFor = (r: any, label: string) => {
      if (!r) return '—';
      if (r.status === 'ok') return 'ok';
      if (r.status === 'missing') return summarize(it.smiles, mIdx(r));
      if (r.status === 'not-applicable' || r.status === 'unsupported') return '—';
      return `無法計算：${r.message ?? r.status}`;
    };
    rowsData.push({ it, tg: cellFor(tg, 'Tg'), jb: cellFor(jb, 'Joback'), vw: cellFor(vw, 'VW'), vm: cellFor(vm, 'Vm'), st: { tg: tg.status, jb: jb?.status ?? 'na', vw: vw.status, vm: vm?.status ?? 'na' } });
  }

  for (const grp of ['使用者材料', '半導體常用材料'] as const) {
    out(`## ${grp}`);
    out();
    out('| 名稱 | 類型 | SMILES | Yg（Tg） | Joback（Tb、Tf） | VW | 莫耳體積／密度 |');
    out('|---|---|---|---|---|---|---|');
    for (const r of rowsData.filter((x) => x.it.group === grp)) {
      out(`| ${cell(r.it.name)} | ${r.it.kind} | \`${cell(r.it.smiles)}\` | ${cell(r.tg)} | ${cell(r.jb)} | ${cell(r.vw)} | ${cell(r.vm)} |`);
    }
    out();
    const tot = rowsData.filter((x) => x.it.group === grp);
    const count = (k: 'tg' | 'jb' | 'vw' | 'vm') => ({ ok: tot.filter((x) => x.st[k] === 'ok').length, miss: tot.filter((x) => x.st[k] === 'missing').length });
    const c = { tg: count('tg'), jb: count('jb'), vw: count('vw'), vm: count('vm') };
    out(`統計（${tot.length} 個結構）：Tg 可算 ${c.tg.ok}／缺基團 ${c.tg.miss}；Joback 可算 ${c.jb.ok}／缺基團 ${c.jb.miss}；VW 可算 ${c.vw.ok}／缺基團 ${c.vw.miss}；莫耳體積可算 ${c.vm.ok}／缺基團 ${c.vm.miss}。`);
    out();
  }

  // 原子團 × 受影響結構的反向索引
  out('## 缺的原子團 → 受影響的結構（反向索引）');
  out();
  const rev = new Map<string, Map<string, Set<string>>>();
  for (const r of rowsData) {
    for (const [k, label] of [['tg', 'Tg'], ['jb', 'Joback'], ['vw', 'VW'], ['vm', '莫耳體積']] as const) {
      const text: string = r[k];
      if (text === 'ok' || text === '—' || text.startsWith('無法')) continue;
      for (const part of text.split('；')) {
        const name = part.replace(/ ×\d+（\d+ 原子）$/, '');
        if (!rev.has(name)) rev.set(name, new Map());
        const m = rev.get(name)!;
        if (!m.has(label)) m.set(label, new Set());
        m.get(label)!.add(`${r.it.name}${r.it.group === '半導體常用材料' ? '※' : ''}`);
      }
    }
  }
  out('※ ＝半導體常用材料組。');
  out();
  out('| 缺的原子團 | Tg | Joback | VW | 莫耳體積 |');
  out('|---|---|---|---|---|');
  for (const [name, m] of [...rev.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
    const cellOf = (k: string) => [...(m.get(k) ?? [])].join('、') || '—';
    out(`| ${cell(name)} | ${cell(cellOf('Tg'))} | ${cell(cellOf('Joback'))} | ${cell(cellOf('VW'))} | ${cell(cellOf('莫耳體積'))} |`);
  }
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
