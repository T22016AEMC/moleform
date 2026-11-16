"""聚合物模組的共用常數（任務 M04）。對應 src/core/polymer/types.ts；文字與 TS 逐字相同。"""

from __future__ import annotations

DEFAULT_PDI = 2
"""沒有 PDI 時的預設值（D47）"""

END_GROUP_NOTE = "未計入端基"
"""結果附註：沒有端基"""

COPOLYMER_NOTE = "共聚物以平均組成計算，未考慮鏈間組成分布"
"""結果附註：共聚物的組成分布近似（任務 020）。TS 只在 types.ts 定義，五個模組的計算沒有用到；放在這裡供引擎回應附註。"""

RDKIT_AMW_SOURCE = "RDKit 平均分子量（amw；虛擬原子 * 質量為 0，各原子的氫數照重複單元原樣計算）"
