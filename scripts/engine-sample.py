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
# Task I05: crosslink page requests (same bodies as SAMPLE_CALLS in desktop/selftest.cjs)
P_NOV = "[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O"
E_GMA = "[*:1]CC([*:2])(C)C(=O)OCC1CO1"
out["crosslink"] = e.handle_crosslink_analyze({"components": [
    {"id": "P", "name": "P", "category": "Resin", "canonicalSmiles": P_NOV, "polymer": {"mnInput": 6000}},
    {"id": "E", "name": "E", "category": "Resin", "canonicalSmiles": E_GMA, "polymer": {"dpInput": 21}},
]})[1]
out["layer1"] = e.handle_crosslink_layer1({
    "setup": {
        "nameA": "A", "nameB": "B", "totalMass": 100,
        "components": [
            {"id": "a", "name": "a", "side": "A", "isPolymer": False, "mass": 70, "molarMass": 340.4, "groupsPerMolecule": 2},
            {"id": "b", "name": "b", "side": "B", "isPolymer": False, "mass": 30, "molarMass": 60.1, "groupsPerMolecule": 4},
        ],
    },
    "conversion": 1,
    "stoichiometric": True,
})[1]
print(json.dumps(out, ensure_ascii=True, sort_keys=True))
