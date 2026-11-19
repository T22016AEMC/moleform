"""表面張力：Parachor 基團加成（任務 P8-2，PLAN 8.6）。直接寫在 Python（D62）。

出處：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，8.2.3 節式 8.4、8.5、Table 8.1（書頁 231）；8.3.2 節（聚合物用非晶莫耳體積）；
8.3.4 節式 8.12（Ps 不隨溫度變，改用該溫度的 V）、式 8.13（Guggenheim，只用於 Table 8.3 列出的聚合物作為文獻對照）。

- Ps ＝ Σ（原子與結構貢獻），γ ＝ (Ps / V)^4（mN/m；Ps 單位 (mN/m)^(1/4)·cm³/mol，V 單位 cm³/mol）。
- Table 8.1 有三組（Sugden、Mumford–Phillips、Quayle），**三組都算、列出範圍，不挑一組當「正確」**；Quayle 雙鍵書印範圍 16.3–19.1，以低、高兩端各算一次。
- 加總方式（原子加成，與書 Example 8.1 的寫法一致：–CH3 ＝ –CH2– ＋ –H，–COO– ＝ >C< ＋ O2）：C、H、N、O、S、鹵素各按 Table 8.1 的原子值；
  酯基（羰基碳連碳、酯氧連碳）的兩個氧合計為 O2 且羰基不另計雙鍵；其餘雙鍵（Kekulé 結構）、參鍵、環（SSSR，3–7 員）按書值加上。
  書沒有逐一說明非酯基含氧基（羥基、醚、酮、醯胺、羧酸、碳酸酯、胺基甲酸酯）、腈、芳香環如何配對，這裡以「各原子值＋鍵與環修正」解讀，
  結果標在 notes（待使用者審）；以書 Table 8.2「From Eq. (8.5)」欄對照（見驗證檔）。
- 缺基團（回報原因，不猜）：Table 8.1 沒有的元素（Si、P、B、金屬等）、帶電荷的原子（硝基、銨等）、含 S=O 的硫、環大於 7 員、Sugden 欄沒有 7 員環。
- V：聚合物用 vm.py 的非晶莫耳體積（298 K）；溶劑用 solvents.csv 的分子量與密度（需要有該溫度的密度，否則 missing）；使用者可輸入 volume 或 density。
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from rdkit import Chem

from . import solvents as _sv
from . import vm as _vm
from .csv_reader import js_number, js_trim
from .mol_graph import mol_from_smiles, read_graph
from .tables import read_data_file
from .y_tables import _records

PARACHOR_FILE = "parachor_groups.csv"
PARACHOR_COLUMNS = ["id", "unit", "kind", "sugden", "mumford_phillips", "quayle_low", "quayle_high", "source", "review_status", "notes"]
TEMPERATURE_FILE = "surface_tension_temperature.csv"
TEMPERATURE_COLUMNS = ["name", "repeat_unit_smiles", "gamma_0", "t_cr_k", "gamma_inf", "ks", "ke", "unit", "source", "review_status", "notes"]

PARACHOR_MODEL = "Parachor 基團加成：Ps = Σ 原子與結構貢獻，γ = (Ps/V)^4（van Krevelen & te Nijenhuis 4th ed. (2009)，式 8.4、8.5，Table 8.1）"
GUGGENHEIM_MODEL = "Guggenheim 式 γ = γ(0)(1 − T/Tcr)^(11/9)（van Krevelen & te Nijenhuis 4th ed. (2009)，式 8.13，Table 8.3 資料；文獻對照）"
SURFACE_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
TREND_NOTE = "參考趨勢，非定量保證；書公式預估誤差見 MODELS.md"
GAMMA_UNIT = "mN/m"
PARACHOR_UNIT = "(mN/m)^(1/4)·cm³/mol"
DEFAULT_TEMPERATURE_C = 25.0
TEMPERATURE_MATCH_TOL_C = 0.01
SETS = (
    ("sugden", "Sugden"),
    ("mumford_phillips", "Mumford–Phillips"),
    ("quayle_low", "Quayle（雙鍵取 16.3）"),
    ("quayle_high", "Quayle（雙鍵取 19.1）"),
)
ALLOWED_ELEMENTS = {6: "C", 7: "N", 8: "O", 9: "F", 16: "S", 17: "Cl", 35: "Br", 53: "I"}
_ATOM_ROW = {6: "PC02", 7: "PC06", 8: "PC04", 9: "PC08", 16: "PC07", 17: "PC09", 35: "PC10", 53: "PC11"}
_RING_ROW = {3: "PC14", 4: "PC15", 5: "PC16", 6: "PC17", 7: "PC18"}
INTERPRETATION_NOTE = (
    "書 Table 8.1 沒有逐一說明非酯基含氧基、腈、芳香環如何配對；此處以原子值加鍵與環修正解讀（酯基用 O2 且羰基不另計雙鍵），待使用者審"
)


class ParachorTableError(Exception):
    """Parachor 或 Table 8.3 資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


@dataclass(frozen=True)
class ParachorRow:
    id: str
    unit: str
    kind: str
    values: dict[str, float | None]
    source: str
    notes: str


@dataclass(frozen=True)
class TemperatureRow:
    name: str
    smiles: str
    gamma_0: float | None
    t_cr: float | None
    gamma_inf: float | None
    ks: float | None
    ke: float | None
    source: str
    notes: str


def _num(text: str, where: str, issues: list[str]) -> float | None:
    if text == "":
        return None
    v = js_number(text)
    if math.isnan(v):
        issues.append(f"{where}：不是數字「{text}」")
        return None
    return v


@lru_cache(maxsize=1)
def load_parachor_groups() -> dict[str, ParachorRow]:
    issues: list[str] = []
    out: dict[str, ParachorRow] = {}
    for no, c in enumerate(_records(read_data_file(PARACHOR_FILE), PARACHOR_FILE, PARACHOR_COLUMNS), start=2):
        id_, unit, kind, su, mp, ql, qh, source, status, notes = c
        where = f"{PARACHOR_FILE} 第 {no} 列"
        vals = {
            "sugden": _num(su, where, issues), "mumford_phillips": _num(mp, where, issues),
            "quayle_low": _num(ql, where, issues), "quayle_high": _num(qh, where, issues),
        }  # fmt: skip
        if id_ == "" or unit == "":
            issues.append(f"{where}：id、unit 不可空白")
        if "Table 8.1" not in source or "頁" not in source:
            issues.append(f"{where}：出處需寫明書名、表號（Table 8.1）與書頁碼")
        if status != "pending":
            issues.append(f"{where}：review_status 必須是 pending")
        if id_ in out:
            issues.append(f"{where}：id 重複：{id_}")
        out[id_] = ParachorRow(id_, unit, kind, vals, source, notes)
    required = set(_ATOM_ROW.values()) | set(_RING_ROW.values()) | {"PC01", "PC03", "PC05", "PC12", "PC13"}
    for rid in sorted(required - set(out)):
        issues.append(f"{PARACHOR_FILE}：缺少 {rid}")
    if issues:
        raise ParachorTableError(issues)
    return out


@lru_cache(maxsize=1)
def load_temperature_rows() -> tuple[TemperatureRow, ...]:
    issues: list[str] = []
    rows: list[TemperatureRow] = []
    for no, c in enumerate(_records(read_data_file(TEMPERATURE_FILE), TEMPERATURE_FILE, TEMPERATURE_COLUMNS), start=2):
        name, smi, g0, tcr, ginf, ks, ke, unit, source, status, notes = c
        where = f"{TEMPERATURE_FILE} 第 {no} 列"
        if "Table 8.3" not in source or "頁" not in source:
            issues.append(f"{where}：出處需寫明表號（Table 8.3）與書頁碼")
        if status != "pending":
            issues.append(f"{where}：review_status 必須是 pending")
        rows.append(
            TemperatureRow(name, smi, _num(g0, where, issues), _num(tcr, where, issues), _num(ginf, where, issues),
                           _num(ks, where, issues), _num(ke, where, issues), source, notes)
        )  # fmt: skip
    if issues:
        raise ParachorTableError(issues)
    return tuple(rows)


def _q(value: float | None, unit: str, source: str, status: str = "predicted", **extra: Any) -> dict[str, Any]:
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing", **extra}
    return {"value": value, "unit": unit, "source": source, "status": status, **extra}


def _canonical_unmapped(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    for a in mol.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(mol)


def temperature_row_for(smiles: str) -> TemperatureRow | None:
    key = _canonical_unmapped(smiles)
    if key is None:
        return None
    for r in load_temperature_rows():
        if r.smiles != "" and _canonical_unmapped(r.smiles) == key:
            return r
    return None


# ---------- Ps（式 8.4 的加成） ----------


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def count_parachor_units(mol: Chem.Mol) -> dict[str, Any]:
    """數出 Table 8.1 各單位的個數。回傳 {counts: {row id: n}, missing: [...], notes: [...], ringSizes: {...}}。
    counts 的鍵為資料表的 id（PC02 碳、PC03 氫、PC05 酯基 O2、PC12 雙鍵…）。"""
    g = read_graph(mol)
    n = mol.GetNumAtoms()
    dummies = [i for i in range(n) if g.z[i] == 0]
    # 連接點的週期性鄰接：兩個連接點時，各自的鄰居互為對面（用於判定跨越單元邊界的酯基等）
    partner: dict[int, int] = {}
    if len(dummies) == 2:
        a1 = next((x for x in g.neighbors[dummies[0]] if g.z[x] != 0), None)
        a2 = next((x for x in g.neighbors[dummies[1]] if g.z[x] != 0), None)
        if a1 is not None and a2 is not None:
            partner[dummies[0]] = a2
            partner[dummies[1]] = a1

    def adj(i: int) -> list[int]:
        out: list[int] = []
        for nb in g.neighbors[i]:
            if g.z[nb] == 0:
                p = partner.get(nb)
                if p is not None:
                    out.append(p)
            else:
                out.append(nb)
        return out

    kek = Chem.Mol(mol)
    try:
        Chem.Kekulize(kek, clearAromaticFlags=True)
    except Exception:  # noqa: BLE001
        kek = Chem.Mol(mol)

    def bond_order(i: int, j: int) -> float:
        b = kek.GetBondBetweenAtoms(i, j)
        return 1.0 if b is None else b.GetBondTypeAsDouble()

    counts: dict[str, int] = {}
    missing: list[dict[str, Any]] = []
    notes: list[str] = []
    generic_used: set[str] = set()

    def bump(rid: str, k: int = 1) -> None:
        counts[rid] = counts.get(rid, 0) + k

    def miss(i: int, reason: str) -> None:
        h = g.h_count[i]
        sym = Chem.GetPeriodicTable().GetElementSymbol(g.z[i])
        missing.append({"index": i, "element": sym, "description": f"{sym}{'H' + str(h) if h else ''}", "reason": reason})

    ester_atoms: set[int] = set()
    # 酯基：羰基碳（連一個碳或連接點對面的碳、一個 =O、一個連碳的酯氧）
    for c in range(n):
        if g.z[c] != 6:
            continue
        carbonyl_o = [x for x in adj(c) if g.z[x] == 8 and bond_order(c, x) == 2.0]
        single_o = [x for x in adj(c) if g.z[x] == 8 and bond_order(c, x) == 1.0 and len(adj(x)) == 2]
        carbon_nb = [x for x in adj(c) if g.z[x] == 6]
        if len(carbonyl_o) != 1 or len(single_o) != 1 or len(carbon_nb) != 1 or len(adj(c)) != 3:
            continue
        o2 = single_o[0]
        if g.h_count[o2] != 0 or any(g.z[x] != 6 for x in adj(o2)):
            continue
        if {c, carbonyl_o[0], o2} & ester_atoms:
            continue
        ester_atoms.update({carbonyl_o[0], o2})
        bump("PC05")  # O2（兩個氧）
        generic_used.add("ester")
    for i in range(n):
        z = g.z[i]
        if z == 0:
            continue
        if z == 1:
            bump("PC03")
            continue
        if z not in ALLOWED_ELEMENTS:
            miss(i, f"Table 8.1 沒有這個元素（只有 C、H、N、O、S、F、Cl、Br、I）")
            continue
        atom = mol.GetAtomWithIdx(i)
        if atom.GetFormalCharge() != 0:
            miss(i, "帶電荷的原子（硝基、銨、N-氧化物等），Table 8.1 沒有")
            continue
        if z == 16 and any(g.z[x] == 8 and bond_order(i, x) >= 2.0 for x in adj(i)):
            miss(i, "含 S=O 的硫（亞碸、碸、磺酸），Table 8.1 只有 –S–")
            continue
        bump("PC03", g.h_count[i])
        if z == 8 and i in ester_atoms:
            continue  # 已計入 O2
        bump(_ATOM_ROW[z])
        if z == 8 and any(g.z[x] == 6 and bond_order(i, x) == 2.0 for x in adj(i)):
            generic_used.add("carbonyl")
        elif z == 7:
            generic_used.add("nitrogen")
    # 雙鍵與參鍵（Kekulé 結構；酯基的 C=O 已含在 O2）
    for b in kek.GetBonds():
        i, j = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        if g.z[i] == 0 or g.z[j] == 0:
            continue
        order = b.GetBondTypeAsDouble()
        if order == 2.0:
            if (i in ester_atoms) or (j in ester_atoms):
                continue
            bump("PC12")
        elif order == 3.0:
            bump("PC13")
    # 環（SSSR；環資訊取自帶連接點的原分子，連接點的度為 1，不會進環）
    ring_sizes: dict[int, int] = {}
    for ring in mol.GetRingInfo().AtomRings():
        size = len(ring)
        if size in _RING_ROW:
            bump(_RING_ROW[size])
            ring_sizes[size] = ring_sizes.get(size, 0) + 1
        else:
            for a in ring:
                miss(a, f"{size} 員環：Table 8.1 只有 3–7 員環")
            break
    if any(a.GetIsAromatic() for a in mol.GetAtoms()):
        generic_used.add("aromatic")
    if generic_used - {"ester"}:
        notes.append(INTERPRETATION_NOTE)
    if len(dummies) not in (0, 2):
        notes.append("連接點不是 2 個：跨單元邊界的酯基無法判定，只在單元內配對")
    return {"counts": counts, "missing": missing, "notes": notes, "ringSizes": ring_sizes, "nAtoms": n}


def parachor_sets(counts: Mapping[str, int]) -> dict[str, dict[str, Any]]:
    """三組（Quayle 兩端）的 Ps。某組缺任何用到的單位值（例如 Sugden 沒有 7 員環）→ 該組 value 為 None 並說明。"""
    table = load_parachor_groups()
    out: dict[str, dict[str, Any]] = {}
    for key, label in SETS:
        total = 0.0
        reason = None
        for rid, k in counts.items():
            v = table[rid].values[key]
            if v is None:
                reason = f"Table 8.1 的 {label} 欄沒有「{table[rid].unit}」的值"
                break
            total += k * v
        out[key] = {"label": label, "value": None if reason else total, "reason": reason}
    return out


# ---------- V ----------


def _density_rows(s: _sv.Solvent) -> list[_sv.SolventValue]:
    return list(s.values.get("density", []))


def volume_for(smiles: str, mass: float | None, polymer: bool, temperature_c: float | None, volume: float | None, density: float | None,
               solvent_id: str | None) -> tuple[dict[str, Any] | None, str | None]:
    """V（cm³/mol）：輸入 volume ＞ 輸入 density（V = M/ρ）＞ 聚合物 vm.py（298 K，非晶）＞ 溶劑資料表（該溫度的密度）。回傳 (volume dict, 缺的原因)。"""
    if volume is not None:
        return {"value": volume, "unit": "cm³/mol", "basis": "使用者輸入的摩爾體積", "temperatureC": temperature_c}, None
    if density is not None:
        if mass is None or mass <= 0:
            return None, "分子量無法計算（原子量表沒有的元素）"
        return {"value": mass / density, "unit": "cm³/mol", "basis": "使用者輸入的密度（V = M/ρ）", "temperatureC": temperature_c, "density": density}, None
    if polymer:
        if temperature_c is not None and abs(temperature_c - DEFAULT_TEMPERATURE_C) > TEMPERATURE_MATCH_TOL_C:
            return None, (
                f"聚合物的 V 只有 25 °C（298 K）的非晶莫耳體積（vm.py）；沒有 {temperature_c:g} °C 的密度。"
                "書 8.3.4 節的做法需要該溫度的密度，本引擎不外推（可輸入該溫度的 density 或 volume）"
            )
        res = _vm.compute_molar_volume_density(smiles)
        if res["status"] == "ok" and res.get("amorphous"):
            a = res["amorphous"]
            return {"value": a["vm"], "unit": "cm³/mol", "basis": "Vm 模組（Table 4.10，非晶，298 K）", "temperatureC": DEFAULT_TEMPERATURE_C, "density": a["density"]}, None
        n = len(res.get("missing", []))
        return None, f"沒有摩爾體積：Vm 模組缺 {n} 個基團的莫耳體積增量（可輸入 density 或 volume）"
    s = _sv.get_solvent(solvent_id) if solvent_id else None
    if s is None:
        sid = _sv.solvent_id_for_smiles(smiles)
        s = _sv.get_solvent(sid) if sid else None
    if s is None:
        return None, "小分子需要摩爾體積：不在溶劑資料表內，請輸入 volume（cm³/mol）或 density（g/cm³）"
    mw = s.pick("molecular_weight")
    rows = _density_rows(s)
    if mw is None or not rows:
        return None, "溶劑資料表沒有分子量或密度"
    if temperature_c is None:
        d = s.pick("density", DEFAULT_TEMPERATURE_C)
    else:
        d = next((r for r in rows if r.temperature_c is not None and abs(r.temperature_c - temperature_c) <= TEMPERATURE_MATCH_TOL_C), None)
        if d is None:
            temps = "、".join(f"{r.temperature_c:g} °C" for r in rows if r.temperature_c is not None)
            return None, f"溶劑資料表沒有 {temperature_c:g} °C 的密度（有：{temps}）；不內插、不換算，可輸入該溫度的 density"
    assert d is not None
    return {
        "value": mw.value / d.value, "unit": "cm³/mol", "basis": f"溶劑資料表（{s.id}）：M ÷ ρ，ρ 為 {d.temperature_c:g} °C 的值", "temperatureC": d.temperature_c,
        "density": d.value, "solventId": s.id,
    }, None


# ---------- 主函式 ----------


def compute_surface_tension(
    smiles: str, temperature_c: float | None = None, volume: float | None = None, density: float | None = None, solvent_id: str | None = None,
) -> dict[str, Any]:
    """純液體與聚合物重複單元的表面張力（Parachor）。status：ok／missing／invalid。"""
    text = js_trim(smiles)
    if text == "" and solvent_id:
        s = _sv.get_solvent(solvent_id)
        if s is None:
            return _invalid(smiles, f"溶劑資料表沒有這個溶劑：{solvent_id}")
        text = s.smiles
    if text == "":
        return _invalid(smiles, "沒有結構（SMILES 是空的）")
    try:
        mol = mol_from_smiles(text)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    if mol.GetNumAtoms() == 0:
        return _invalid(smiles, "分子沒有任何原子")
    g = read_graph(mol)
    n_dummy = sum(1 for z in g.z if z == 0)
    if n_dummy not in (0, 2):
        return _invalid(smiles, "連接點（*）必須是 0 個（小分子）或 2 個（重複單元）")
    if len(Chem.GetMolFrags(mol)) > 1:
        return _invalid(smiles, "含多個分子（以 . 分隔）；一次只算一個")
    polymer = n_dummy == 2
    mass = _vm.unit_mass_of(g)
    counted = count_parachor_units(mol)
    base: dict[str, Any] = {
        "smiles": text, "polymer": polymer, "model": PARACHOR_MODEL, "confidence": "理論估算", "trend": TREND_NOTE,
        "temperatureC": temperature_c, "notes": list(counted["notes"]),
    }  # fmt: skip
    absent = {k: _q(None, GAMMA_UNIT, PARACHOR_MODEL) for k in ("gammaMin", "gammaMax")}
    if counted["missing"]:
        return {
            **base, "status": "missing", "quantities": absent, "sets": [], "groups": counted["counts"], "missing": counted["missing"],
            "volume": None, "reasons": {"gamma": f"Table 8.1 沒有涵蓋的原子或結構（{len(counted['missing'])} 處）"},
        }  # fmt: skip
    sets = parachor_sets(counted["counts"])
    vol, vol_reason = volume_for(text, mass, polymer, temperature_c, volume, density, solvent_id)
    table = load_parachor_groups()
    groups = [{"id": rid, "unit": table[rid].unit, "count": k, "source": table[rid].source} for rid, k in sorted(counted["counts"].items())]
    reasons: dict[str, str] = {}
    set_rows: list[dict[str, Any]] = []
    gammas: list[float] = []
    for key, label in SETS:
        info = sets[key]
        ps = info["value"]
        gamma = None
        if ps is None:
            reasons[key] = info["reason"]
        elif vol is None:
            reasons[key] = vol_reason or "V 無法取得"
        else:
            gamma = (ps / vol["value"]) ** 4
            gammas.append(gamma)
        set_rows.append({
            "key": key, "label": label,
            "parachor": _q(ps, PARACHOR_UNIT, PARACHOR_MODEL + "；Ps 為各單位值加總"),
            "gamma": _q(gamma, GAMMA_UNIT, PARACHOR_MODEL),
        })  # fmt: skip
    if gammas:
        quantities = {
            "gammaMin": _q(min(gammas), GAMMA_UNIT, PARACHOR_MODEL + "；三組的最小值"),
            "gammaMax": _q(max(gammas), GAMMA_UNIT, PARACHOR_MODEL + "；三組的最大值"),
        }
        status = "ok"
    else:
        quantities = absent
        reasons["gamma"] = vol_reason or "三組的 Ps 都算不出（見 reasons）"
        status = "missing"
    warnings = [
        "三組 Table 8.1 並列，不挑其中一組當「正確」；書 8.3.2 節指出聚合物用 Sugden 原值與實驗值最接近（僅供參考）",
    ]
    if polymer:
        warnings.append("聚合物的 V 取非晶態（書 8.3.2 節：半結晶聚合物的表面通常是非晶）")
    result: dict[str, Any] = {
        **base, "status": status, "quantities": quantities, "sets": set_rows, "groups": groups, "missing": [], "volume": vol, "reasons": reasons,
        "warnings": warnings, "ringSizes": counted["ringSizes"], "unitMass": mass,
    }  # fmt: skip
    result["literature"] = literature_block(text, polymer, temperature_c, solvent_id)
    return result


def guggenheim(row: TemperatureRow, temperature_c: float) -> float | None:
    """式 8.13：γ = γ(0)(1 − T/Tcr)^(11/9)；T 以 K（t + 273.15）。T ≥ Tcr 或缺 γ(0)／Tcr 回傳 None。"""
    if row.gamma_0 is None or row.t_cr is None:
        return None
    t = temperature_c + 273.15
    if t >= row.t_cr:
        return None
    return row.gamma_0 * (1 - t / row.t_cr) ** (11 / 9)


def literature_block(smiles: str, polymer: bool, temperature_c: float | None, solvent_id: str | None) -> dict[str, Any]:
    """文獻對照（不參與計算，不用來外推其他聚合物）：Table 8.3 的 Guggenheim 與 Table 8.7 的 −dγs/dT、γs；溶劑資料表的 γ。"""
    from . import interfacial as _if  # 延後載入，避免循環匯入

    out: dict[str, Any] = {"note": "文獻對照，不用來外推別的聚合物；書 Table 8.3、8.7 的數據各只適用於表中列出的聚合物"}
    t = DEFAULT_TEMPERATURE_C if temperature_c is None else temperature_c
    if polymer:
        row = temperature_row_for(smiles)
        if row is None:
            out["table83"] = {"status": "missing", "reason": "這個聚合物不在書 Table 8.3（只有 11 種），不外推"}
        else:
            g = guggenheim(row, t)
            out["table83"] = {
                "name": row.name, "gamma0": row.gamma_0, "tCrK": row.t_cr, "temperatureC": t,
                "guggenheim": _q(g, GAMMA_UNIT, GUGGENHEIM_MODEL, "literature"),
                "source": row.source,
                "reason": None if g is not None else "Table 8.3 對這個聚合物沒有 γ(0) 或 Tcr（書印「–」）",
            }  # fmt: skip
        se = _if.polymer_row_for(smiles, table="8.7")
        if se is not None:
            out["table87"] = {
                "name": se.name_en, "gammaS": _q(se.gamma, GAMMA_UNIT, se.source, "literature"),
                "negDgammaDt": _q(se.neg_dgamma_dt, "mN/(m·K)", se.source, "literature"),
                "note": "書 Table 8.7 未標溫度",
            }  # fmt: skip
        else:
            out["table87"] = {"status": "missing", "reason": "這個聚合物不在書 Table 8.7"}
    else:
        sid = solvent_id or _sv.solvent_id_for_smiles(smiles)
        s = _sv.get_solvent(sid) if sid else None
        v = None if s is None else s.pick("surface_tension", t)
        if v is None:
            out["solventTable"] = {"status": "missing", "reason": "溶劑資料表沒有這個液體的表面張力"}
        else:
            out["solventTable"] = {
                "gamma": _q(v.value, v.unit, f"{v.source}；{v.source_detail}", "literature"), "temperatureC": v.temperature_c,
                "note": "文獻值（溶劑資料表，待使用者審），與 Parachor 結果並列對照",
            }  # fmt: skip
    return out
