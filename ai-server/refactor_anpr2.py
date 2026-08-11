import re

file_path = r'e:\SMAS\ai-server\app\services\anpr_service_v2.py'

with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
if 'CandidateResolver' not in code:
    code = code.replace(
        'from .detectors.heuristic import HeuristicOpenCVDetector',
        'from .detectors.heuristic import HeuristicOpenCVDetector\nfrom .resolver import CandidateResolver, PlateCandidate'
    )

# 2. Init
if 'self.resolver = CandidateResolver()' not in code:
    code = code.replace(
        'self.detector = HeuristicOpenCVDetector()',
        'self.detector = HeuristicOpenCVDetector()\n        self.resolver = CandidateResolver()'
    )

# 3. Rewrite `_process_image` to accumulate candidates and call resolver
# Find _process_image start
import ast
# We'll just replace the body of process_ocr_results to return a list instead of updating best_candidate
old_process_ocr = """            def process_ocr_results(ocr_res):
                best_candidate = None

                def update_best(candidate):
                    nonlocal best_candidate
                    if not candidate:
                        return
                    if candidate["status"] == "success":
                        if not best_candidate or best_candidate["status"] != "success" or \\
                           candidate["confidence"] > best_candidate["confidence"]:
                            best_candidate = candidate
                    elif not best_candidate:
                        best_candidate = candidate"""

new_process_ocr = """            def process_ocr_results(ocr_res):
                all_cands = []

                def update_best(candidate):
                    if candidate:
                        all_cands.append(candidate)"""
code = code.replace(old_process_ocr, new_process_ocr)

code = code.replace("""                if best_candidate and best_candidate["status"] == "success":
                    return best_candidate""", "")
code = code.replace("""                        if best_candidate and best_candidate["status"] == "success":
                            return best_candidate""", "")

code = code.replace("""                return best_candidate""", """                return all_cands""")


# 4. run_scales needs to return list of candidates
old_run_scales = """            def run_scales(img_enh, min_conf=0.30):
                best_valid = None
                best_fallback = None
                
                # If image is already very large, limit scales to prevent OOM
                scales = [1.0, 1.5, 2.0]
                if img_enh.shape[1] >= 800:
                    scales = [1.0, 1.2]
                
                for scale in scales:
                    if scale == 1.0:
                        s_img = img_enh
                    else:
                        s_img = cv2.resize(img_enh, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                        
                    t_ocr_start = time.time()
                    results = self.reader.readtext(s_img, detail=1)
                    t_ocr = (time.time() - t_ocr_start) * 1000
                    print(f"[Timing] OCR (scale {scale}x): {t_ocr:.2f}ms")
                    
                    filtered = self.filter_bboxes(results, s_img.shape, min_conf=min_conf)
                    if not filtered:
                        continue
                        
                    candidate = process_ocr_results(filtered)
                    if not candidate:
                        continue
                    candidate["scale"] = scale
                    
                    if candidate["status"] == "success":
                        if not best_valid or candidate["confidence"] > best_valid["confidence"]:
                            best_valid = candidate
                        # EARLY EXIT: If we found a valid plate with decent confidence, don't waste time on larger scales
                        if best_valid["confidence"] > 0.4:
                            return best_valid
                    else:
                        if not best_fallback or candidate["confidence"] > best_fallback["confidence"]:
                            best_fallback = candidate
                            
                return best_valid if best_valid else best_fallback"""

new_run_scales = """            def run_scales(img_enh, min_conf=0.30):
                all_cands = []
                scales = [1.0, 1.5, 2.0]
                if img_enh.shape[1] >= 800:
                    scales = [1.0, 1.2]
                
                for scale in scales:
                    if scale == 1.0:
                        s_img = img_enh
                    else:
                        s_img = cv2.resize(img_enh, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                        
                    t_ocr_start = time.time()
                    results = self.reader.readtext(s_img, detail=1)
                    t_ocr = (time.time() - t_ocr_start) * 1000
                    print(f"[Timing] OCR (scale {scale}x): {t_ocr:.2f}ms")
                    
                    filtered = self.filter_bboxes(results, s_img.shape, min_conf=min_conf)
                    if not filtered:
                        continue
                        
                    cands = process_ocr_results(filtered)
                    if not cands:
                        continue
                    for c in cands:
                        c["scale"] = scale
                        all_cands.append(c)
                return all_cands"""
code = code.replace(old_run_scales, new_run_scales)


# Now in _process_image body, we need to collect all cands instead of updating best_candidate
code = code.replace("best_candidate = None", "global_cands = []")
code = code.replace("best_candidate = cand", "global_cands.append(cand)")

old_pass0 = """                if top_text and bottom_text:
                    joined_bboxes = top_bboxes + bot_bboxes
                    joined_confs  = top_confs  + bot_confs
                    cand = try_join_candidate([top_text, bottom_text], joined_bboxes, joined_confs)
                    if cand and cand["status"] == "success":
                        global_cands.append(cand)
                        print(f"Enhancement Mode: 2-Line Split")
                elif top_text or bottom_text:
                    part_text = top_text or bottom_text
                    part_boxes = top_bboxes or bot_bboxes
                    part_confs = top_confs or bot_confs
                    cand = try_join_candidate([part_text], part_boxes, part_confs)
                    if cand and cand["status"] == "success":
                        global_cands.append(cand)

            # PASS 1: Base enhancement
            if not global_cands or global_cands["status"] != "success":"""
            
new_pass0 = """                if top_text and bottom_text:
                    joined_bboxes = top_bboxes + bot_bboxes
                    joined_confs  = top_confs  + bot_confs
                    cand = try_join_candidate([top_text, bottom_text], joined_bboxes, joined_confs)
                    if cand: global_cands.append(cand)
                elif top_text or bottom_text:
                    part_text = top_text or bottom_text
                    part_boxes = top_bboxes or bot_bboxes
                    part_confs = top_confs or bot_confs
                    cand = try_join_candidate([part_text], part_boxes, part_confs)
                    if cand: global_cands.append(cand)

            # PASS 1: Base enhancement
            if True:"""
code = code.replace(old_pass0, new_pass0)

# Replace the run_scales calls
code = code.replace("best_candidate = run_scales(enhanced)", "global_cands.extend(run_scales(enhanced))")
code = code.replace('if not global_cands or global_cands["status"] != "success":\n                print("No valid plate found', 'if True:\n                print("Attempting')
code = code.replace("best_candidate_2 = run_scales(enh_thresh)", "global_cands.extend(run_scales(enh_thresh))")
code = code.replace("""                if best_candidate_2:
                    is_new_valid = best_candidate_2["status"] == "success"
                    is_old_valid = global_cands and global_cands["status"] == "success"
                    
                    if (is_new_valid and not is_old_valid) or \\
                       (is_new_valid == is_old_valid and (not global_cands or best_candidate_2["confidence"] > global_cands["confidence"])):
                        global_cands.append(cand)
                        print(f"Enhancement Mode: Threshold")""", "")
                        
# Pass 3
code = code.replace('if bbox and (not global_cands or global_cands["status"] != "success"):', 'if bbox:')
code = code.replace("""                def _update_best_candidate(cand3, label):
                    nonlocal best_candidate
                    if not cand3:
                        return
                    is_new_valid = cand3["status"] == "success"
                    is_old_valid = global_cands and global_cands["status"] == "success"
                    if (is_new_valid and not is_old_valid) or \\
                       (is_new_valid == is_old_valid and (not global_cands or cand3["confidence"] > global_cands["confidence"])):
                        global_cands.append(cand3)
                        print(f"Enhancement Mode: {label}")

                # 3a: bottom-half crop with lower confidence threshold
                bc_bottom = _try_passes_on(bottom_crop, min_conf=0.20)
                _update_best_candidate(bc_bottom, "Full Image Bottom-Half Fallback")

                # 3b: If still not found, try the full image (wide but lower res)
                if not global_cands or global_cands["status"] != "success":
                    print("Still no valid plate, attempting OCR on FULL image...")
                    fallback_crop = img[int(h_orig * 0.10):int(h_orig * 0.95), int(w_orig * 0.05):int(w_orig * 0.95)]
                    fallback_crop = self._resize_max_width(fallback_crop, 1280)
                    bc_full = _try_passes_on(fallback_crop, min_conf=0.15)
                    _update_best_candidate(bc_full, "Full Image Fallback")""", 
"""                # 3a: bottom-half crop with lower confidence threshold
                bc_bottom = _try_passes_on(bottom_crop, min_conf=0.20)
                if bc_bottom: global_cands.extend(bc_bottom)

                # 3b: try the full image
                print("Attempting OCR on FULL image...")
                fallback_crop = img[int(h_orig * 0.10):int(h_orig * 0.95), int(w_orig * 0.05):int(w_orig * 0.95)]
                fallback_crop = self._resize_max_width(fallback_crop, 1280)
                bc_full = _try_passes_on(fallback_crop, min_conf=0.15)
                if bc_full: global_cands.extend(bc_full)""")


old_final = """            if not global_cands:
                return None
                
            print(f"OCR Scale: {global_cands.get('scale', 1.0)}x")
            print(f"Raw OCR: {global_cands['raw']}")
            print(f"Normalized: {global_cands['normalized']}")
            print(f"Corrected: {global_cands['corrected']}")
            print(f"Validation: {global_cands['status']}")
            print(f"Confidence: {global_cands['confidence']:.2f}")
            
            return global_cands"""
            
new_final = """            if not global_cands:
                return None
                
            plate_cands = []
            for c in global_cands:
                plate_cands.append(PlateCandidate(
                    raw=c['raw'],
                    corrected=c['corrected'],
                    base_confidence=c['confidence'],
                    pipeline='v2_legacy',
                    is_valid_format=False
                ))
                
            best = self.resolver.resolve(plate_cands, det_score)
            return best"""

code = code.replace(old_final, new_final)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
    
print("Second refactor applied")
