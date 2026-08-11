from typing import List, Dict, Optional
from .candidate import PlateCandidate
from .generator import generate_variants, is_valid_plate
from .vehicle_client import VehicleMasterClient
from .scorer import score_candidate
from .edit_distance import edit_distance

class CandidateResolver:
    def __init__(self):
        self.vehicle_client = VehicleMasterClient()

    def resolve(self, candidates: List[PlateCandidate], det_conf: float) -> Optional[Dict]:
        """
        Executes Steps 1-8 of the Candidate Resolution engine.
        Returns a dictionary compatible with the existing API schema.
        """
        if not candidates:
            return None
            
        all_plates_to_check = set()
        
        # 1. & 2. Collect candidates and generate variants
        for cand in candidates:
            cand.log(f"Base OCR: {cand.raw} (Conf: {cand.base_confidence:.2f})")
            # The 'corrected' text from the old heuristic is our base plate
            base_plate = cand.corrected if cand.corrected else cand.raw
            base_plate = base_plate.replace(" ", "").upper()
            
            cand.is_valid_format = is_valid_plate(base_plate)
            if cand.is_valid_format:
                all_plates_to_check.add(base_plate)
                
            # Generate variants
            variants = generate_variants(base_plate, max_subs=2, max_variants=20)
            cand.variants = variants
            for v in variants:
                all_plates_to_check.add(v)
                
        # 3. Vehicle Master Verification (Batch Lookup)
        master_results = self.vehicle_client.lookup_batch(list(all_plates_to_check))
        
        # 4. Scoring and Edit Distance Recovery
        for cand in candidates:
            base_plate = cand.corrected.replace(" ", "").upper() if cand.corrected else cand.raw.replace(" ", "").upper()
            
            # Check exact match on base
            if master_results.get(base_plate):
                cand.is_master_match = True
                cand.matched_string = base_plate
                cand.log(f"Exact Vehicle Master Match: {base_plate}")
            else:
                # Near Match Recovery using variants
                matched_variant = None
                for var in cand.variants:
                    if master_results.get(var):
                        matched_variant = var
                        break
                        
                if matched_variant:
                    cand.is_master_match = True
                    cand.matched_string = matched_variant
                    dist = edit_distance(base_plate, matched_variant)
                    cand.log(f"Near Match Recovery (Dist {dist}): {base_plate} -> {matched_variant}")
                else:
                    cand.matched_string = base_plate if cand.is_valid_format else cand.raw
                    cand.log("No Vehicle Master Match found for base or variants.")
            
            # Score candidate
            score_candidate(cand, det_conf, candidates)

        # Sort candidates by final score descending
        candidates.sort(key=lambda c: c.final_score, reverse=True)
        
        best = candidates[0]
        
        # Determine status
        status = 'success'
        if not best.is_valid_format and not best.is_master_match:
            status = 'validation_failed'
            
        print("\n--- Resolver Decision ---")
        for log in best.debug_log:
            print(log)
            
        # Keep a ranked list for debugging
        top_candidates = []
        for i, c in enumerate(candidates[:5]):
            top_candidates.append({
                'plate': c.matched_string if c.matched_string else c.corrected,
                'score': c.final_score,
                'pipeline': c.pipeline
            })
            
        # Return exact original schema
        return {
            'raw': best.raw,
            'normalized': best.raw.replace(" ", ""),
            'corrected': best.matched_string if best.matched_string else best.corrected,
            'confidence': best.final_score,
            'status': status,
            'pipeline': best.pipeline,
            # Extra fields for debugging
            'confidence_category': best.confidence_level,
            'is_master_match': best.is_master_match,
            'top_candidates': top_candidates
        }
