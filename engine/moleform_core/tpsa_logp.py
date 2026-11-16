"""TPSA（拓撲極性表面積）與 Crippen LogP。對應 src/core/properties/tpsaLogp.ts 與 src/core/polymer/unitFragment.ts 的 `capRepeatUnit`
（任務 M05 組 1-6；D62／D63）。

直接呼叫 RDKit 的描述子，不自行實作：
- TPSA：`rdMolDescriptors.CalcTPSA(mol)`，**`includeSandP` 用預設值 False**（只計 N、O 片段），與 RDKit.js 的 `tpsa` 描述子一致。
- Crippen LogP：`rdMolDescriptors.CalcCrippenDescriptors(mol)[0]`（`includeHs=True`，預設），對應 RDKit.js 的 `CrippenClogP`。
  不用 `Descriptors.MolLogP`：`Descriptors` 會匯入 numpy，在引擎的處理執行緒中匯入會卡住（M04 的實測），兩者是同一個 C++ 函式。
含連接點（`*`）的重複單元：連接點換成甲基碳再計算（原子順序不變）。TS 的 `capRepeatUnit` 另外回傳分子式與 molblock（3D 用），
本模組只需要封端後的 SMILES，所以只實作「有沒有連接點、能不能解析、封端後的結構有效、原子順序不變」這幾個判斷（訊息逐字相同）。
`validateStructure` 對 SMILES 輸入的「有效」＝沒有 `>`（反應）、沒有 `~`（查詢鍵）、RDKit 能解析、canonical SMILES 不是空字串。
"""

from __future__ import annotations

import re
from typing import Any

from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

from .csv_reader import js_trim

TPSA_MODEL = "Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717"
LOGP_MODEL = "Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873"
TPSA_LOGP_DISCLAIMER = "TPSA 與 Crippen LogP 為依結構估算的經驗值，非實測；原為小分子方法。"
CAPPED_NOTE = "以甲基封端的單元估算；LogP 僅供相對比較"

_ATTACHMENT_TOKEN = re.compile(r"\[\*(?::[0-9]+)?\]|\*", re.ASCII)


def _parse(smiles: str) -> Chem.Mol | None:
    try:
        return Chem.MolFromSmiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch
        return None


def cap_repeat_unit(unit_smiles: str) -> dict[str, Any]:
    """對應 capRepeatUnit：回傳 { ok: True, fragment: { smiles, cappedAtoms } } 或 { ok: False, message }。"""
    text = js_trim(unit_smiles)
    if not _ATTACHMENT_TOKEN.search(text):
        return {"ok": False, "message": "這個結構沒有連接點（*），不是重複單元。"}
    original = _parse(text)
    if original is None:
        return {"ok": False, "message": "無法解析這個重複單元。"}
    original_z = [a.GetAtomicNum() for a in original.GetAtoms()]
    capped_atoms = [i for i, z in enumerate(original_z) if z == 0]
    capped = _ATTACHMENT_TOKEN.sub("C", text)
    # validateStructure（SMILES 輸入）
    valid = False
    if ">" not in capped and "~" not in capped:
        m = _parse(capped)
        valid = m is not None and Chem.MolToSmiles(m) != ""
    if not valid:
        return {"ok": False, "message": "連接點改成甲基後無法解析，無法產生單元片段的 3D。"}
    mol = _parse(capped)
    if mol is None:
        return {"ok": False, "message": "連接點改成甲基後無法解析，無法產生單元片段的 3D。"}
    atoms = [a.GetAtomicNum() for a in Chem.AddHs(mol).GetAtoms()]
    same_order = all((atoms[i] if i < len(atoms) else 6) == (6 if z == 0 else z) for i, z in enumerate(original_z))
    if not same_order:
        return {"ok": False, "message": "封端後的原子順序與原結構不一致，無法產生單元片段的 3D。"}
    return {"ok": True, "fragment": {"smiles": capped, "cappedAtoms": capped_atoms}}


def compute_tpsa_logp(smiles: str) -> dict[str, Any]:
    """對應 computeTpsaLogp。回傳與 TS 的 TpsaLogpResult 同樣欄位名稱的 dict（status 為 ok／invalid）。"""
    if js_trim(smiles) == "":
        return {"status": "invalid", "smiles": smiles, "message": "沒有結構（SMILES 是空的）"}
    computed = smiles
    capped = False
    if "*" in smiles:
        # 只有連接點（沒有任何原子）的字串不是單元，不能封端成甲烷
        rest = _ATTACHMENT_TOKEN.sub("", smiles)
        if re.sub(r"[^A-Za-z]", "", rest, flags=re.ASCII) == "":
            return {"status": "invalid", "smiles": smiles, "message": "只有連接點（*），沒有原子"}
        c = cap_repeat_unit(smiles)
        if not c["ok"]:
            return {"status": "invalid", "smiles": smiles, "message": c["message"]}
        computed = c["fragment"]["smiles"]
        capped = True
    mol = _parse(computed)
    if mol is None:
        return {"status": "invalid", "smiles": smiles, "message": "RDKit 無法解析這個 SMILES"}
    if "." in computed:
        return {"status": "invalid", "smiles": smiles, "message": "含多個分子（以 . 分隔）；TPSA 與 LogP 一次只算一個分子"}
    tpsa = rdMolDescriptors.CalcTPSA(mol)
    log_p = rdMolDescriptors.CalcCrippenDescriptors(mol)[0]
    return {
        "status": "ok",
        "smiles": smiles,
        "tpsa": tpsa,
        "logP": log_p,
        "capped": capped,
        "computedSmiles": computed,
        "note": CAPPED_NOTE if capped else None,
        "models": {"tpsa": TPSA_MODEL, "logP": LOGP_MODEL},
    }
