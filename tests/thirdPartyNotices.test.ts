// 第三方聲明檢查（任務 027）：THIRD_PARTY_NOTICES.md 含 thermo 的 MIT 聲明，且建置腳本會把它併入 dist/THIRD-PARTY-NOTICES.txt 並在缺少時使建置失敗。
import { describe, expect, it } from 'vitest';
import notices from '../THIRD_PARTY_NOTICES.md?raw';
import script from '../scripts/third-party-notices.mjs?raw';

describe('thermo（MIT）聲明', () => {
  it('THIRD_PARTY_NOTICES.md 含 thermo 0.6.1、版權與 MIT 全文', () => {
    for (const s of ['## thermo 0.6.1', 'Caleb Bell', 'MIT License', 'Permission is hereby granted']) expect(notices).toContain(s);
  });
  it('建置腳本把 thermo 聲明併入發佈的聲明檔，並檢查內容', () => {
    expect(script).toContain('THIRD_PARTY_NOTICES.md');
    expect(script).toContain('缺少 thermo 聲明');
  });
});
