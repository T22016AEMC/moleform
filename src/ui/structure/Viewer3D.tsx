// 3D 顯示與量測（Phase 2.6、2.7）。這個檔案是唯一引用 3Dmol 的地方，由 Conformer3DCard 以 React.lazy 載入，
// 所以 3Dmol 只在使用者按「產生 3D」之後才下載（任務 011 D-14）。
import { useEffect, useMemo, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import { UNOPTIMIZED_MEASURE_NOTE } from '../../core/conformer/types';
import { angleDegrees,dihedralDegrees, distance, type Vec3 } from '../../core/geometry';

export type ViewStyle = 'ballstick' | 'stick' | 'spacefill';
const STYLE_LABEL: Record<ViewStyle, string> = {
  ballstick: 'Ball-and-Stick',
  stick: 'Stick',
  spacefill: 'Space-Filling',
};

interface PickedAtom {
  /** 0 起算，與 RDKit 的原子索引相同（重原子）；畫面顯示時加 1 */
  index: number;
  element: string;
  xyz: Vec3;
  bonded: number[];
}

const MAX_PICKED = 4;
const SELECT_COLOR = '#ff8c00';

const styleSpec = (style: ViewStyle) =>
  style === 'stick'
    ? { stick: { radius: 0.2, colorscheme: 'Jmol' } }
    : style === 'spacefill'
      ? { sphere: { scale: 1, colorscheme: 'Jmol' } }
      : { stick: { radius: 0.14, colorscheme: 'Jmol' }, sphere: { scale: 0.28, colorscheme: 'Jmol' } };

const fixed = (value: number, digits: number) => (Number.isFinite(value) ? value.toFixed(digits) : '無法計算');

export function Viewer3D({ molfile, optimized = true }: { molfile: string; optimized?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<$3Dmol.GLViewer | null>(null);
  const [style, setStyle] = useState<ViewStyle>('ballstick');
  const [showNumbers, setShowNumbers] = useState(false);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const [picked, setPicked] = useState<PickedAtom[]>([]);
  const [glError, setGlError] = useState('');
  const pickedRef = useRef<PickedAtom[]>([]);
  pickedRef.current = picked;
  const lastMolfile = useRef<string | null>(null);

  // 建立檢視器（只一次）
  useEffect(() => {
    if (!container.current) return;
    try {
      viewer.current = $3Dmol.createViewer(container.current, { backgroundColor: 'white', antialias: true });
    } catch (e) {
      setGlError(e instanceof Error ? e.message : String(e));
      return;
    }
    const v = viewer.current;
    return () => {
      try {
        v.clear();
      } catch {
        /* 已被釋放 */
      }
      viewer.current = null;
      if (container.current) container.current.replaceChildren();
    };
  }, []);

  // 換構象時清除量測
  useEffect(() => {
    setPicked([]);
  }, [molfile]);

  // 重新繪製：模型、樣式、編號、已選原子都在這裡
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const newModel = lastMolfile.current !== molfile;
    lastMolfile.current = molfile;
    v.removeAllLabels();
    v.removeAllModels();
    const model = v.addModel(molfile, 'sdf');
    v.setStyle({}, styleSpec(style));
    if (!showHydrogens) v.setStyle({ elem: 'H' }, {});

    const atoms = model.selectedAtoms({});
    if (showNumbers) {
      for (const atom of atoms) {
        if (!showHydrogens && atom.elem === 'H') continue;
        v.addLabel(String((atom.index ?? 0) + 1), {
          position: { x: atom.x ?? 0, y: atom.y ?? 0, z: atom.z ?? 0 },
          fontSize: 12,
          fontColor: 'black',
          backgroundColor: 'white',
          backgroundOpacity: 0.65,
          borderThickness: 0,
          inFront: true,
          showBackground: true,
        });
      }
    }
    picked.forEach((p, order) => {
      v.addStyle({ index: p.index }, { sphere: { color: SELECT_COLOR, radius: 0.5, opacity: 0.55 } });
      v.addLabel(`選取 ${order + 1}`, {
        position: { x: p.xyz[0], y: p.xyz[1], z: p.xyz[2] },
        fontSize: 11,
        fontColor: 'white',
        backgroundColor: SELECT_COLOR,
        backgroundOpacity: 0.9,
        alignment: 'bottomCenter',
        inFront: true,
      });
    });

    v.setClickable({}, true, (atom: $3Dmol.AtomSpec) => {
      if (atom.index === undefined) return;
      const current = pickedRef.current.length >= MAX_PICKED ? [] : pickedRef.current;
      if (current.some((p) => p.index === atom.index)) return;
      setPicked([
        ...current,
        {
          index: atom.index,
          element: atom.elem ?? '?',
          xyz: [atom.x ?? 0, atom.y ?? 0, atom.z ?? 0],
          bonded: atom.bonds ?? [],
        },
      ]);
    });
    if (newModel) v.zoomTo();
    v.render();
  }, [molfile, style, showNumbers, showHydrogens, picked]);

  const measurement = useMemo(() => {
    const [a, b, c, d] = picked;
    return {
      length: a && b ? { value: distance(a.xyz, b.xyz), bonded: a.bonded.includes(b.index) } : null,
      angle: a && b && c ? angleDegrees(a.xyz, b.xyz, c.xyz) : null,
      dihedral: a && b && c && d ? dihedralDegrees(a.xyz, b.xyz, c.xyz, d.xyz) : null,
    };
  }, [picked]);

  if (glError) {
    return (
      <p className="error" role="alert">
        此瀏覽器無法啟動 3D 顯示（WebGL）：{glError}
      </p>
    );
  }

  return (
    <div className="viewer3d">
      <div className="viewer3d-toolbar" role="group" aria-label="3D 顯示選項">
        <label>
          樣式
          <select value={style} onChange={(event) => setStyle(event.target.value as ViewStyle)}>
            {(Object.keys(STYLE_LABEL) as ViewStyle[]).map((key) => (
              <option key={key} value={key}>{STYLE_LABEL[key]}</option>
            ))}
          </select>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={showNumbers} onChange={(event) => setShowNumbers(event.target.checked)} />
          顯示原子編號
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={showHydrogens} onChange={(event) => setShowHydrogens(event.target.checked)} />
          顯示氫原子
        </label>
      </div>
      {showNumbers && <small>編號從 1 起算（對應結構原子索引加 1；氫原子編號接在重原子之後）。</small>}

      <div ref={container} className="viewer3d-canvas" aria-label="3D 分子模型" />
      <small>滑鼠左鍵旋轉、滾輪縮放、右鍵（或兩指）平移；點選原子可量測。</small>

      <div className="viewer3d-measure">
        <h4>量測</h4>
        {!optimized && <p className="structure-notice" role="note">{UNOPTIMIZED_MEASURE_NOTE}</p>}
        <p>依序點選 2、3、4 個原子，分別得到鍵長（距離）、鍵角、二面角。再點第 5 個原子時重新開始。</p>
        {picked.length === 0 ? (
          <p className="structure-placeholder">尚未選取原子</p>
        ) : (
          <>
            <p>
              已選：
              {picked.map((p, i) => `${i + 1}. ${p.element}${p.index + 1}`).join('　')}
            </p>
            <ul>
              {measurement.length && (
                <li>
                  {measurement.length.bonded ? '鍵長' : '原子間距離（未直接鍵結）'}（{picked[0].element}{picked[0].index + 1}–{picked[1].element}{picked[1].index + 1}）：
                  {fixed(measurement.length.value, 3)} Å
                </li>
              )}
              {measurement.angle !== null && (
                <li>鍵角（{picked[0].index + 1}–{picked[1].index + 1}–{picked[2].index + 1}）：{fixed(measurement.angle, 1)}°</li>
              )}
              {measurement.dihedral !== null && (
                <li>
                  二面角（{picked[0].index + 1}–{picked[1].index + 1}–{picked[2].index + 1}–{picked[3].index + 1}）：
                  {fixed(measurement.dihedral, 1)}°
                </li>
              )}
            </ul>
          </>
        )}
        <button type="button" disabled={picked.length === 0} onClick={() => setPicked([])}>清除量測</button>
      </div>
    </div>
  );
}

export default Viewer3D;
