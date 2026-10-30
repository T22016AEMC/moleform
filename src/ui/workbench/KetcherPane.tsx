// 彈窗內的 Ketcher（任務 018）：掛載時才載入 iframe，卸載即釋放；同一時間只會有一個 Ketcher 實例
// （「分子工具」分頁的繪圖器只在該分頁開啟時才掛載，見 StructureInput 的 active）。
// 訊息流程與 StructureInput 相同（載入 → 讀回 → 交給 RDKit 驗證），結構只在使用者的瀏覽器內處理（D23）。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StructureValidation } from '../../core/structure/validate';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameResponse, type FrameRequest, type FrameResponse } from '../../shared/ketcherProtocol';
import { validateInput } from '../../worker/client';

const FRAME_URL = `${import.meta.env.BASE_URL}ketcher/`;
const CHANGE_DEBOUNCE_MS = 300;

interface Props {
  /** 開啟時載入的結構（Molfile 或 SMILES）；沒有則是空白畫布 */
  initialInput?: string;
  /** 畫布內容（經 RDKit 驗證）改變時通知 */
  onStructure: (structure: StructureValidation | null) => void;
  /** 使用者在畫布上修改過（尚未套用）時為 true */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * 畫布上有「尚未驗證」的筆畫時為 true（任務 021 後續）：使用者修改後，到匯出並經 RDKit 驗證完成為止。
   * 驗證完成後結構已交給 onStructure，之後還原畫布不會丟失內容。
   */
  onUnverifiedChange?: (unverified: boolean) => void;
  /** 每次從 Ketcher 讀回畫布的 Molfile（不論是否通過驗證）；用來在畫布被借用後還原內容 */
  onExported?: (molfile: string) => void;
}

export function KetcherPane({ initialInput, onStructure, onDirtyChange, onUnverifiedChange, onExported }: Props) {
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState('正在載入繪圖器…');
  const iframe = useRef<HTMLIFrameElement>(null);
  const frameReady = useRef(false);
  const frameId = useRef(0);
  const loadId = useRef(0);
  const exportId = useRef(0);
  const validateSeq = useRef(0);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handler = useRef<(response: FrameResponse) => void>(() => {});
  const onStructureRef = useRef(onStructure);
  onStructureRef.current = onStructure;
  const onDirtyRef = useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  const initialRef = useRef(initialInput);
  const onUnverifiedRef = useRef(onUnverifiedChange);
  onUnverifiedRef.current = onUnverifiedChange;
  const onExportedRef = useRef(onExported);
  onExportedRef.current = onExported;
  /** 上一次匯出之後，畫布又有新的修改 */
  const changedAfterExport = useRef(false);

  const send = useCallback((request: FrameRequest) => {
    iframe.current?.contentWindow?.postMessage(request, location.origin);
  }, []);

  const requestExport = useCallback(() => {
    exportId.current = ++frameId.current;
    changedAfterExport.current = false;
    send({ channel: FRAME_CHANNEL, type: 'export', id: exportId.current });
  }, [send]);

  const validate = useCallback(async (molfile: string) => {
    const seq = ++validateSeq.current;
    const outcome = await validateInput(molfile);
    if (seq !== validateSeq.current) return false;
    onStructureRef.current(outcome.ok ? outcome.result : null);
    return true;
  }, []);

  handler.current = (response) => {
    if (response.type === 'ready') {
      frameReady.current = true;
      setFrameState('ready');
      setMessage('');
      const input = initialRef.current;
      if (input && input.trim() !== '') {
        loadId.current = ++frameId.current;
        send({ channel: FRAME_CHANNEL, type: 'load', id: loadId.current, input });
      }
    } else if (response.type === 'changed') {
      // 載入中的變更不算使用者修改，載入完成後會主動讀取一次
      if (loadId.current !== 0) return;
      onDirtyRef.current?.(true);
      changedAfterExport.current = true;
      onUnverifiedRef.current?.(true);
      clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(requestExport, CHANGE_DEBOUNCE_MS);
    } else if (response.type === 'loaded' && response.id === loadId.current) {
      loadId.current = 0;
      requestExport();
    } else if (response.type === 'structure' && response.id === exportId.current) {
      onExportedRef.current?.(response.structure.molfile);
      void validate(response.structure.molfile).then((applied) => {
        // 驗證完成且之後沒有新的筆畫：畫布上沒有尚未驗證的內容
        if (applied && !changedAfterExport.current) onUnverifiedRef.current?.(false);
      });
    } else if (response.type === 'error') {
      if (response.id === null) {
        setFrameState('failed');
        setMessage(response.message);
      } else if (response.id === loadId.current) {
        loadId.current = 0;
        setMessage('Ketcher 無法載入這個結構。');
      } else if (response.id === exportId.current) {
        setMessage(response.message);
      }
    }
  };

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (fromExpectedWindow(event, location.origin, iframe.current?.contentWindow) && isFrameResponse(event.data)) {
        handler.current(event.data);
      }
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      clearTimeout(changeTimer.current);
      onUnverifiedRef.current?.(false); // 畫布卸下後沒有未驗證的內容可以丟
    };
  }, []);

  return (
    <div className="ketcher-pane">
      <div className="ketcher-container">
        <iframe
          ref={iframe}
          title="Ketcher 結構繪圖器"
          src={FRAME_URL}
          onError={() => {
            setFrameState('failed');
            setMessage('繪圖器載入失敗，請關閉後再試。');
          }}
        />
      </div>
      {message && (
        <p role="status" className={frameState === 'failed' ? 'structure-frame-failed' : 'structure-frame-status'}>
          {message}
        </p>
      )}
    </div>
  );
}
