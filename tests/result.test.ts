import { describe, expect, it } from 'vitest';
import agents from '../AGENTS.md?raw';
import { confidenceLabel, UNIFIED_NOTE } from '../src/core/result';

describe('結果型別', () => {
  it('confidenceLabel 三種輸入', () => {
    expect(confidenceLabel('direct')).toBe('直接計算');
    expect(confidenceLabel('estimate')).toBe('理論估算');
    expect(confidenceLabel('trend')).toBe('參考趨勢');
  });

  it('UNIFIED_NOTE 與 AGENTS.md 鐵則 2 的統一備註完全相同', () => {
    const m = agents.match(/「(本數值為[^」]+)」/);
    expect(m).not.toBeNull();
    expect(UNIFIED_NOTE).toBe(m![1]);
  });
});