import re

file_path = r'e:\SMAS\ai-server\app\services\anpr_service_v2.py'

with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
code = code.replace(
    'from .detectors.heuristic import HeuristicOpenCVDetector',
    'from .detectors.heuristic import HeuristicOpenCVDetector\nfrom .resolver import CandidateResolver, PlateCandidate'
)

# 2. Init
code = code.replace(
    'self.detector = HeuristicOpenCVDetector()',
    'self.detector = HeuristicOpenCVDetector()\n        self.resolver = CandidateResolver()'
)

# 3. _extract_candidates_from_boxes
code = code.replace(
    "            if cand['status'] == 'success':\n                return cands",
    "            pass  # Early exit removed so resolver gets all candidates"
)

# 4. _multipass_ocr
old_multi = """            best_so_far = self._vote_best(all_cands, det_conf)
            score       = self._score(best_so_far, det_conf, all_cands) if best_so_far else 0.0
            plate_str   = best_so_far['corrected'] if best_so_far else 'none'
            is_valid    = best_so_far['status'] == 'success' if best_so_far else False
            print(f"  [{label}] Pipeline {pipe_name}: {len(boxes)} box(es), "
                  f"best={plate_str!r} valid={is_valid} score={score:.2f} ({ms:.0f}ms)")

            if best_so_far and self._score(best_so_far, det_conf, all_cands) >= 0.85:
                print(f"  [{label}] Reached high confidence early.")
                break

        return best_so_far"""

new_multi = """            print(f"  [{label}] Pipeline {pipe_name}: {len(boxes)} box(es), ({ms:.0f}ms)")
        
        return all_cands"""

code = code.replace(old_multi, new_multi)

# 5. _doubleline_ocr
old_z4 = """                    # Z→4 variant: district position ambiguity
                    # 'Z' on a plate can represent either '2' or '4' depending on font
                    if 'Z' in joined:
                        norm_z4 = list(self.normalize_plate(joined))
                        for idx in range(2, min(4, len(norm_z4))):
                            if norm_z4[idx] == 'Z':
                                norm_z4[idx] = '4'
                        z4_str = ''.join(norm_z4)
                        if z4_str != joined:
                            corr = self.correct_plate(z4_str)
                            ext  = self.extract_valid_plate(corr)
                            final = ext if ext else corr
                            all_join_cands.append({
                                'raw': joined, 'normalized': z4_str,
                                'corrected': final, 'confidence': avg_conf,
                                'status': 'success' if self.validate_plate(final) else 'validation_failed',
                                'pipeline': '2line_join_z4'
                            })

        best = self._vote_best(all_join_cands, det_conf)
        if best:
            print(f"[2-Line Joined] corrected={best['corrected']!r} "
                  f"valid={best['status'] == 'success'} conf={best['confidence']:.2f}")
        return best"""

new_z4 = """        return all_join_cands"""

code = code.replace(old_z4, new_z4)

# 6. _process_image
old_process = """            print(f"\n{'='*10} OCR {'='*10}")
            if layout == 'DOUBLE_LINE':
                best = self._doubleline_ocr(cropped, det_score)
            else:
                best = self._multipass_ocr(cropped, det_score, label=label)

            if (not best or best['status'] != 'success') and bbox:
                print("\n--- Fallback: bottom-crop of full image ---")
                h_o, w_o = img.shape[:2]
                fb_crop  = img[int(h_o * 0.45):h_o, int(w_o * 0.05):int(w_o * 0.95)]
                fb_crop  = self._resize_max_width(fb_crop, 1280)
                fb_cand  = self._multipass_ocr(fb_crop, det_score, label='FALLBACK', max_pipelines=3)
                if fb_cand:
                    if not best:
                        best = fb_cand
                    elif fb_cand['status'] == 'success' and best['status'] != 'success':
                        best = fb_cand
                    elif fb_cand['status'] == 'success' and best['status'] == 'success':
                        if fb_cand['confidence'] > best['confidence']:
                            best = fb_cand

            if not best:
                print("No plate found.")
                return None

            print(f"\n{'='*10} FINAL {'='*10}")
            print(f"Plate:           {best['corrected']}")
            print(f"Validation:      {best['status']}")
            print(f"Confidence:      {best['confidence']:.2f}")
            print(f"Pipeline:        {best.get('pipeline', 'N/A')}")
            return best"""

new_process = """            print(f"\\n{'='*10} OCR {'='*10}")
            all_raw_cands = []
            if layout == 'DOUBLE_LINE':
                all_raw_cands.extend(self._doubleline_ocr(cropped, det_score) or [])
            else:
                all_raw_cands.extend(self._multipass_ocr(cropped, det_score, label=label) or [])

            if bbox:
                print("\\n--- Fallback: bottom-crop of full image ---")
                h_o, w_o = img.shape[:2]
                fb_crop  = img[int(h_o * 0.45):h_o, int(w_o * 0.05):int(w_o * 0.95)]
                fb_crop  = self._resize_max_width(fb_crop, 1280)
                all_raw_cands.extend(self._multipass_ocr(fb_crop, det_score, label='FALLBACK', max_pipelines=3) or [])

            if not all_raw_cands:
                print("No candidates generated.")
                return None
                
            # Convert to PlateCandidate using original _score as input signal
            plate_cands = []
            for rc in all_raw_cands:
                base_score = self._score(rc, det_score, all_raw_cands)
                pc = PlateCandidate(
                     raw=rc['raw'],
                     corrected=rc['corrected'],
                     base_confidence=base_score,
                     pipeline=rc.get('pipeline', ''),
                     is_valid_format=(rc.get('status') == 'success')
                )
                plate_cands.append(pc)

            best = self.resolver.resolve(plate_cands, det_score)
            if not best:
                print("No plate found.")
                return None

            print(f"\\n{'='*10} FINAL {'='*10}")
            print(f"Plate:           {best['corrected']}")
            print(f"Validation:      {best['status']}")
            print(f"Confidence:      {best['confidence']:.2f}")
            print(f"Pipeline:        {best.get('pipeline', 'N/A')}")
            return best"""

code = code.replace(old_process, new_process)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
print("Refactoring complete.")
