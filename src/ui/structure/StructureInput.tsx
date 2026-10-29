// 結構輸入卡片（Phase 2.1–2.4）：SMILES 輸入、Ketcher 繪圖、結構驗證、MOL／SDF 匯入匯出。
// iframe 管理與請求／回應流程取自 CheMScutter src/ui/AnalysisPanel.tsx（已移除 PubChem 與質譜流程）。
// 不計算也不顯示任何物性（D09）；結構只在使用者自己的瀏覽器內處理（D23）。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { InputCategory } from '../../core/structure/inputErrors';
import { parseSdf, sdfRecordLabel, toSdf, type SdfRecord } from '../../core/structure/sdf';
import { detectFormat, type StructureProblem, type StructureValidation } from '../../core/structure/validate';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameResponse, type FrameRequest, type FrameResponse } from '../../shared/ketcherProtocol';
import { validateInput } from '../../worker/client';
import { downloadText } from '../download';
import './structure.css';

const FRAME_URL = `${import.meta.env.BASE_URL}ketcher/`;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHANGE_DEBOUNCE_MS = 300;

type Source = 'smiles' | 'canvas' | 'file' | 'library';
const SOURCE_LABEL: Record<Source, string> = {
  smiles: '來源：SMILES 輸入',
  canvas: '來源：Ketcher 繪圖區',
  file: '來源：匯入的檔案',
  library: '來源：我的化合物',
};

/** 從外部（例如「我的化合物」）要求載入一個結構；id 每次不同才會觸發載入 */
export interface LoadRequest {
  id: number;
  /** Molfile 或 SMILES */
  input: string;
}

interface Props {
  onStructureChange?: (structure: StructureValidation | null) => void;
  loadRequest?: LoadRequest | null;
}

interface View {
  source: Source;
  result: StructureValidation;
  details?: string;
}

const categoryCode = (category: InputCategory | undefined): StructureProblem['code'] => category ?? 'OTHER';

function failedView(source: Source, message: string, code: StructureProblem['code'] = 'OTHER', details?: string): View {
  return {
    source,
    details,
    result: { valid: false, empty: false, canonicalSmiles: '', molblock: '', problems: [{ level: 'error', code, message }] },
  };
}

export function StructureInput({ onStructureChange, loadRequest }: Props) {
  const [smilesText, setSmilesText] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [frameMessage, setFrameMessage] = useState('正在載入繪圖器與本機 WASM…');
  const [records, setRecords] = useState<SdfRecord[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [recordIndex, setRecordIndex] = useState(0);
  const [fileError, setFileError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const iframe = useRef<HTMLIFrameElement>(null);
  const frameReady = useRef(false);
  const frameId = useRef(0);
  const loadId = useRef(0);
  const exportId = useRef(0);
  const validateSeq = useRef(0);
  const pendingLoad = useRef<string | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const openedAt = useRef(performance.now());
  const frameHandler = useRef<(message: FrameResponse) => void>(() => {});

  const sendFrame = useCallback((request: FrameRequest) => {
    iframe.current?.contentWindow?.postMessage(request, location.origin);
  }, []);

  /** 交給 Worker 驗證；只採用最新一次請求的結果，避免舊回應覆蓋新結果。 */
  const validateAndShow = useCallback(async (source: Source, input: string): Promise<StructureValidation | null> => {
    const seq = ++validateSeq.current;
    const outcome = await validateInput(input);
    if (seq !== validateSeq.current) return null;
    if (outcome.ok) {
      setView({ source, result: outcome.result });
      return outcome.result;
    }
    setView(failedView(source, '結構驗證未完成，請重新整理頁面後再試。', 'OTHER', `來源：Worker；${outcome.error}`));
    return null;
  }, []);

  /** 向 Ketcher 要目前畫布的結構（之後由 structure 回應交給 RDKit 驗證）。 */
  const requestExport = useCallback(() => {
    exportId.current = ++frameId.current;
    sendFrame({ channel: FRAME_CHANNEL, type: 'export', id: exportId.current });
  }, [sendFrame]);

  const loadIntoFrame = useCallback(
    (input: string) => {
      if (!frameReady.current) {
        pendingLoad.current = input;
        return;
      }
      loadId.current = ++frameId.current;
      sendFrame({ channel: FRAME_CHANNEL, type: 'load', id: loadId.current, input });
    },
    [sendFrame],
  );

  frameHandler.current = (response) => {
    if (response.type === 'ready') {
      frameReady.current = true;
      setFrameState('ready');
      setFrameMessage(`繪圖器已就緒，首次載入耗時 ${((performance.now() - openedAt.current) / 1000).toFixed(2)} 秒。`);
      if (pendingLoad.current !== null) {
        const input = pendingLoad.current;
        pendingLoad.current = null;
        loadIntoFrame(input);
      }
    } else if (response.type === 'changed') {
      // 載入中的變更不處理，載入完成後會主動讀取一次，避免兩邊互相觸發。
      if (loadId.current !== 0) return;
      clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(requestExport, CHANGE_DEBOUNCE_MS);
    } else if (response.type === 'loaded' && response.id === loadId.current) {
      loadId.current = 0;
      requestExport();
    } else if (response.type === 'structure' && response.id === exportId.current) {
      void validateAndShow('canvas', response.structure.molfile);
    } else if (response.type === 'error') {
      if (response.id === null) {
        setFrameState('failed');
        setFrameMessage(response.message);
      } else if (response.id === loadId.current) {
        loadId.current = 0;
        setView(failedView('smiles', 'Ketcher 無法載入這個結構，請檢查輸入內容。', categoryCode(response.category), response.details));
      } else if (response.id === exportId.current) {
        setView(failedView('canvas', response.message, categoryCode(response.category), response.details));
      }
    }
  };

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (fromExpectedWindow(event, location.origin, iframe.current?.contentWindow) && isFrameResponse(event.data)) {
        frameHandler.current(event.data);
      }
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      clearTimeout(changeTimer.current);
    };
  }, []);

  /** 驗證通過才送進 Ketcher；不合法或被拒絕時只顯示訊息，不動畫布。 */
  async function showAndLoad(source: Source, input: string, frameInput: (result: StructureValidation) => string) {
    const result = await validateAndShow(source, input);
    if (result?.valid) loadIntoFrame(frameInput(result));
  }

  function onLoadSmiles() {
    // Ketcher 自己匯入 SMILES 時，會把 [*:1] 變成 R 基團標籤（R1），不是連接點；
    // 含連接點時改送 RDKit 產生的 Molfile（連接點寫成 *），Ketcher 才會顯示成 * 原子。
    void showAndLoad('smiles', smilesText, (r) => (r.canonicalSmiles.includes('*') ? r.molblock : smilesText.trim()));
  }

  // 外部要求載入：Molfile 原樣送進繪圖器（保留圖面排列），SMILES 比照「載入」按鈕
  useEffect(() => {
    if (!loadRequest) return;
    const { input } = loadRequest;
    const isMolfile = detectFormat(input) === 'molfile';
    void showAndLoad('library', input, (r) =>
      isMolfile ? input : r.canonicalSmiles.includes('*') ? r.molblock : input.trim(),
    );
    // 只在新的要求（id 改變）時載入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRequest?.id]);

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError('');
    setRecords(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`檔案太大（超過 ${MAX_FILE_BYTES / 1024 / 1024} MB），請改用較小的檔案。`);
      return;
    }
    let parsed: SdfRecord[];
    try {
      parsed = parseSdf(await file.text());
    } catch {
      setFileError('無法讀取這個檔案。');
      return;
    }
    if (!parsed.length) {
      setFileError('檔案中找不到結構。');
      return;
    }
    setFileName(file.name);
    setRecordIndex(0);
    if (parsed.length === 1) {
      void showAndLoad('file', parsed[0].molblock, () => parsed[0].molblock);
    } else {
      setRecords(parsed);
    }
  }

  function onLoadRecord() {
    const record = records?.[recordIndex];
    if (record) void showAndLoad('file', record.molblock, () => record.molblock);
  }

  async function onCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('已複製');
    } catch {
      setCopyMessage('無法自動複製，請手動選取文字');
    }
    setTimeout(() => setCopyMessage(''), 2500);
  }

  const result = view?.result;
  // 把目前驗證結果交給下方的 3D 卡片（只在結果物件改變時通知）
  useEffect(() => {
    onStructureChange?.(result ?? null);
  }, [result, onStructureChange]);
  const exportable = !!result?.valid;

  return (
    <section className="card structure-input" aria-labelledby="structure-title">
      <h2 id="structure-title">結構輸入</h2>
      <p>可用 Ketcher 畫分子，或輸入 SMILES 後按「載入」；兩邊會同步。結構只在您的瀏覽器內處理，不會上傳。</p>

      <div className="smiles-row">
        <label htmlFor="smiles-input">SMILES</label>
        <input
          id="smiles-input"
          type="text"
          value={smilesText}
          spellCheck={false}
          autoComplete="off"
          placeholder="例如 CCO"
          onChange={(event) => setSmilesText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onLoadSmiles();
          }}
        />
        <button type="button" onClick={onLoadSmiles}>載入</button>
      </div>

      <div className="ketcher-container">
        <iframe
          ref={iframe}
          title="Ketcher 結構繪圖器"
          src={FRAME_URL}
          onError={() => {
            setFrameState('failed');
            setFrameMessage('繪圖器載入失敗，請重新整理後再試。');
          }}
        />
      </div>
      <p role="status" className={frameState === 'failed' ? 'structure-frame-failed' : 'structure-frame-status'}>{frameMessage}</p>

      <div className="structure-output">
        <h3>目前結構</h3>
        {result?.valid ? (
          <div className="smiles-output">
            <code aria-label="canonical SMILES">{result.canonicalSmiles}</code>
            <button type="button" onClick={() => void onCopy(result.canonicalSmiles)}>複製</button>
            {copyMessage && <small role="status">{copyMessage}</small>}
          </div>
        ) : (
          <p className="structure-placeholder">{result ? '（沒有可用的結構）' : '（尚未輸入結構）'}</p>
        )}
        {view && result?.valid && <small>{SOURCE_LABEL[view.source]}；canonical SMILES 由 RDKit 產生。</small>}

        {result?.problems.map((problem) =>
          problem.level === 'error' ? (
            <div className="error" role="alert" key={problem.code + problem.message}>
              <p>{problem.message}</p>
              {view?.details && (
                <details><summary>技術細節</summary><pre>{view.details}</pre></details>
              )}
            </div>
          ) : (
            <p className="structure-notice" role="status" key={problem.code + problem.message}>{problem.message}</p>
          ),
        )}

        <div className="structure-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".mol,.sdf,.sd"
            hidden
            onChange={(event) => void onPickFile(event)}
          />
          <button type="button" onClick={() => fileInput.current?.click()}>匯入 MOL／SDF</button>
          <button
            type="button"
            disabled={!exportable}
            onClick={() => result && downloadText(result.molblock, 'moleform-structure.mol', 'chemical/x-mdl-molfile')}
          >
            下載 MOL
          </button>
          <button
            type="button"
            disabled={!exportable}
            onClick={() => result && downloadText(toSdf(result.molblock), 'moleform-structure.sdf', 'chemical/x-mdl-sdfile')}
          >
            下載 SDF
          </button>
        </div>
        <small>檔案只在瀏覽器內讀取與產生，不會上傳。匯出為 Molfile V2000（2D 座標）。</small>

        {fileError && <p className="error" role="alert">{fileError}</p>}

        {records && (
          <div className="record-picker">
            <p>
              「{fileName}」含有 {records.length} 筆結構，請選擇要載入的一筆：
            </p>
            <label htmlFor="sdf-record">結構</label>
            <select id="sdf-record" value={recordIndex} onChange={(event) => setRecordIndex(Number(event.target.value))}>
              {records.map((record, i) => (
                <option key={record.index} value={i}>{sdfRecordLabel(record)}</option>
              ))}
            </select>
            <button type="button" onClick={onLoadRecord}>載入選取的結構</button>
          </div>
        )}
      </div>
    </section>
  );
}
