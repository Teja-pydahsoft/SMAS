from .candidate import PlateCandidate
from typing import List

def get_confidence_category(score: float, is_master_match: bool) -> str:
    """
    Categorical confidence:
    OCR = 98%, Master = Yes -> VERY_HIGH
    OCR = 65%, Master = Yes -> HIGH
    OCR = 85%, Master = No  -> MEDIUM
    OCR = 45%, Master = No  -> LOW
    """
    if is_master_match:
        if score >= 0.85:
            return "VERY_HIGH"
        else:
            return "HIGH"
    else:
        if score >= 0.70:
            return "MEDIUM"
        else:
            return "LOW"

def score_candidate(cand: PlateCandidate, det_conf: float, all_cands: List[PlateCandidate]) -> PlateCandidate:
    """
    Current score is mainly: OCR, Regex, Detector, Agreement
    New score: 35% OCR, 20% Detector, 15% Regex, 15% Agreement, 15% Master
    """
    ocr_s = cand.base_confidence * 0.35
    det_s = det_conf * 0.20
    regex_s = 0.15 if cand.is_valid_format else 0.0
    
    # Agreement score
    agree_s = 0.0
    if all_cands and cand.raw:
        agree = sum(1 for c in all_cands if c.raw == cand.raw)
        agree_s = min(agree / len(all_cands), 1.0) * 0.15
        
    # Master match
    master_s = 0.15 if cand.is_master_match else 0.0
    
    cand.final_score = min(ocr_s + det_s + regex_s + agree_s + master_s, 1.0)
    cand.confidence_level = get_confidence_category(cand.final_score, cand.is_master_match)
    
    cand.log(f"Scored {cand.final_score:.3f} (OCR:{ocr_s:.3f}, Det:{det_s:.3f}, Regex:{regex_s:.3f}, Agree:{agree_s:.3f}, Master:{master_s:.3f})")
    cand.log(f"Confidence Category: {cand.confidence_level}")
    
    return cand
