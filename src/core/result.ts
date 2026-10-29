// 所有計算結果共用的型別與統一備註（AGENTS.md 鐵則 2、D03）。純 TypeScript，不可引用 React。

/** 可信度：直接計算／理論估算／參考趨勢 */
export type Confidence = 'direct' | 'estimate' | 'trend';

export interface CalcResult {
  /** 數值；不適用或算不出時為 null */
  value: number | null;
  unit: string;
  modelName: string;
  confidence: Confidence;
  /** 出處清單（書名／論文／套件，含頁碼或表格編號）；可為空 */
  sources: string[];
  /** 不適用時的原因 */
  notApplicable?: string;
}

export const UNIFIED_NOTE =
  '本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。';

const LABELS: Record<Confidence, string> = {
  direct: '直接計算',
  estimate: '理論估算',
  trend: '參考趨勢',
};

export function confidenceLabel(confidence: Confidence): string {
  return LABELS[confidence];
}