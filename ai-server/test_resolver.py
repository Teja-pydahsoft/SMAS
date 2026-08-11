import asyncio
from app.services.resolver import CandidateResolver, PlateCandidate
from app.services.resolver.generator import generate_variants
from app.services.resolver.edit_distance import edit_distance

def test_edit_dist():
    print(edit_distance("TG08Q2172", "TG08Q2172")) # 0
    print(edit_distance("TG08QZ1722", "TG08Q2172")) # 2
    print(edit_distance("AP40FD1307", "AP40F01307")) # 1

def test_variants():
    v = generate_variants("TG08QZ1721")
    print(f"Generated {len(v)} variants for TG08QZ1721")
    for var in v:
        print(f" - {var}")

def test_resolver():
    res = CandidateResolver()
    cands = [
        PlateCandidate("TG08QZ1721", "TG08QZ1721", 0.95, "v2_legacy", False)
    ]
    best = res.resolve(cands, 0.9)
    print(best)

if __name__ == "__main__":
    test_edit_dist()
    test_variants()
    test_resolver()
