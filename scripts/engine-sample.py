# Task I02: fixed sample requests used to compare the dev engine with the packaged engine (prints JSON; run with -I).
import json, os, sys
sys.path.insert(0, sys.argv[1])
import moleform_engine as e
PMMA = "[*:1]CC([*:2])(C)C(=O)OC"
NOV = "[*:1]Cc1cc([*:2])ccc1O"
ORTHO = "[*:1]Cc1cc([*:2])cc(C)c1O"
comps = [
    {"id": "a", "name": "Cresol", "category": "resin", "canonicalSmiles": ORTHO},
    {"id": "b", "name": "Novolac", "category": "resin", "canonicalSmiles": NOV},
]
out = {
    "tg": e.handle_tg({"smiles": PMMA})[1],
    "vm": e.handle_vm({"smiles": PMMA})[1],
    "tgNovolac": e.handle_tg({"smiles": NOV})[1],
    "mixTg": e.handle_tg_mixing({"components": comps, "wtPct": {"a": 60.0, "b": 40.0}, "mn": {"a": 1000, "b": 1000}})[1],
    "mixDensity": e.handle_mixture_density({"components": [{"name": "PMMA", "w": 0.6, "smiles": PMMA}, {"name": "PS", "w": 0.4, "smiles": "[*:1]CC([*:2])c1ccccc1"}]})[1],
}
print(json.dumps(out, ensure_ascii=True, sort_keys=True))
