import { Resources } from 'openchemlib';
// openchemlib 的 package.json exports 沒有開放 dist/resources.json，所以用相對路徑；?url 讓 Vite 產生含部署 base 的網址。
import resourcesUrl from '../../node_modules/openchemlib/dist/resources.json?url';
import { ConformerSession } from '../core/conformer/session';
import { isConformerRequest, type ConformerRequest, type ConformerResponse } from './conformerProtocol';

// resources.json 只在第一次收到「產生 3D」請求時才載入（任務 011 B-5），之後重複使用。
let resources: Promise<void> | null = null;
let resourcesMs = 0;
function loadResources(): Promise<void> {
  if (!resources) {
    const start = performance.now();
    resources = Resources.registerFromUrl(resourcesUrl).then(() => {
      resourcesMs = performance.now() - start;
    });
    resources.catch(() => {
      resources = null; // 失敗時下次可重試
    });
  }
  return resources;
}

// 同一個結構與種子沿用同一個工作階段，「產生更多構象」才能接續產生。
let session: { key: string; value: ConformerSession } | null = null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const post = (response: ConformerResponse) => self.postMessage(response);

async function handle(request: ConformerRequest): Promise<void> {
  const { id } = request;
  try {
    const firstLoad = resources === null;
    if (firstLoad) post({ type: 'progress', id, stage: 'loading', done: 0, total: request.target });
    await loadResources();
    const key = `${request.seed}\n${request.molblock}`;
    if (!session || session.key !== key) session = { key, value: new ConformerSession(request.molblock, request.seed) };
    const batch = session.value.generate(request.target, (done, total) =>
      post({ type: 'progress', id, stage: 'generating', done, total }),
    );
    post({ type: 'result', id, ok: true, batch, resourcesMs: firstLoad ? resourcesMs : 0 });
  } catch (e) {
    post({ type: 'result', id, ok: false, error: message(e) });
  }
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isConformerRequest(event.data)) void handle(event.data);
});
