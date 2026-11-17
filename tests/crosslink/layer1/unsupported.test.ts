import { describe, expect, it } from 'vitest';
import { MESSAGE_UNSUPPORTED_SYSTEM, prepareLayer1 } from '../../../src/core/crosslink/layer1/prepare';
import type { CrosslinkResult } from '../../../src/core/crosslink/types';

// P7-1A（D65）：第 1 層遇到不支援的體系（環氧＋酸酐等）回報原因，不給數值。
describe('第 1 層：不支援的體系', () => {
  it('epoxy+anhydride 回報「尚未支援」與原因', () => {
    const pair = { ruleId: 'epoxy+anhydride', a: { componentId: 'a', groupId: 'ether.epoxide' }, b: { componentId: 'b', groupId: 'anhydride' } };
    const result = { pairs: [pair], components: [] } as unknown as CrosslinkResult;
    const out = prepareLayer1(result, null as never, null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason.startsWith(MESSAGE_UNSUPPORTED_SYSTEM)).toBe(true);
      expect(out.reason).toContain('epoxy+anhydride');
    }
  });
});
