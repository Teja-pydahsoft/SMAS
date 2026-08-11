import re
import cv2
import numpy as np
import easyocr
import time
import os
from .detectors.heuristic import HeuristicOpenCVDetector

class ANPRServiceV2:
    def __init__(self):
        print("Initializing EasyOCR Models V2...")
        self.reader = easyocr.Reader(['en'], gpu=True)
        print("EasyOCR Models V2 Initialized")
        self.detector = HeuristicOpenCVDetector()

    def _resize_max_width(self, img: np.ndarray, max_width=1280) -> np.ndarray:
        h, w = img.shape[:2]
        if w > max_width:
            scale = max_width / float(w)
            return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        return img



    def enhance_plate(self, img: np.ndarray, use_threshold=False) -> np.ndarray:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        
        # Only scale up if the image is a small crop. If it's already large, skip scaling.
        if gray.shape[1] < 400:
            resized = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        else:
            resized = gray.copy()
            
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        clahe_img = clahe.apply(resized)
        
        if use_threshold:
            bfilter = cv2.bilateralFilter(clahe_img, 11, 17, 17)
            thresh = cv2.adaptiveThreshold(bfilter, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
            # Apply slight erosion to thicken black text (helps connect carbon-fiber dotted fonts)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            thickened = cv2.erode(thresh, kernel, iterations=1)
            return thickened
            
        return clahe_img

    def filter_bboxes(self, results, img_shape, min_conf=0.30):
        if not results:
            return []
            
        # Sort by Top (tolerance 20px) then Left
        results_sorted = sorted(results, key=lambda r: (r[0][0][1] // 20, r[0][0][0]))
        
        valid_results = []
        
        for bbox, text, conf in results_sorted:
            if conf < min_conf:
                continue
            valid_results.append((bbox, text, conf))
            
        return valid_results

    def normalize_plate(self, text: str) -> str:
        if not text: return ""
        text = re.sub(r'[^A-Z0-9]', '', text.upper())
        text = text.replace('IND', '')
        return text

    def correct_plate(self, text: str) -> str:
        if not text or len(text) < 4:
            return text
            
        chars = list(text)
        
        # State: 0-1 (Should be letters)
        for i in range(min(2, len(chars))):
            if chars[i] == '0': chars[i] = 'O'
            elif chars[i] == '8': chars[i] = 'B'
            elif chars[i] == '1': chars[i] = 'I'
            elif chars[i] == '5': chars[i] = 'S'
            elif chars[i] == '4': chars[i] = 'A'
            
        # Vehicle Number: last 1-4
        num_count = 0
        for i in range(len(chars) - 1, -1, -1):
            if chars[i] in '0123456789OQIBLZSGAT':
                if chars[i] in 'OQ': chars[i] = '0'
                elif chars[i] == 'I': chars[i] = '1'
                elif chars[i] == 'B': chars[i] = '8'
                elif chars[i] == 'L': chars[i] = '4'
                elif chars[i] == 'Z': chars[i] = '2'
                elif chars[i] == 'S': chars[i] = '5'
                elif chars[i] == 'G': chars[i] = '6'
                elif chars[i] == 'A': chars[i] = '4'
                elif chars[i] == 'T': chars[i] = '7'
                num_count += 1
                if num_count == 4: break
            else:
                break
                
        # District: 2-3 (Should be numbers)
        if len(chars) > 2:
            if chars[2] in 'OQD': chars[2] = '0'
            elif chars[2] == 'I': chars[2] = '1'
            elif chars[2] == 'Z': chars[2] = '2'   # Z looks like 2; also commonly confused with 4
            elif chars[2] == 'L': chars[2] = '4'
            elif chars[2] == 'A': chars[2] = '4'   # A can be misread from 4 in bold plate fonts
            elif chars[2] == 'S': chars[2] = '5'
            elif chars[2] == 'G': chars[2] = '6'
            elif chars[2] == 'B': chars[2] = '8'
            elif chars[2] == 'P': chars[2] = '9'
        if len(chars) > 3:
            if chars[3] in 'OQD': chars[3] = '0'
            elif chars[3] == 'I': chars[3] = '1'
            elif chars[3] == 'Z': chars[3] = '2'
            elif chars[3] == 'L': chars[3] = '4'
            elif chars[3] == 'A': chars[3] = '4'   # A can be misread from 4 in bold plate fonts
            elif chars[3] == 'S': chars[3] = '5'
            elif chars[3] == 'G': chars[3] = '6'
            elif chars[3] == 'B': chars[3] = '8'
            elif chars[3] == 'P': chars[3] = '9'
            
        # Series: middle
        # Series: middle (should be letters — convert common digit misreads)
        start_series = 4
        end_series = len(chars) - num_count
        DIGIT_TO_LETTER = {'0': 'O', '1': 'I', '8': 'B', '4': 'A', '5': 'S', '6': 'G', '2': 'Z', '7': 'T', '3': 'E'}
        for i in range(start_series, end_series):
            if chars[i] in DIGIT_TO_LETTER:
                chars[i] = DIGIT_TO_LETTER[chars[i]]
            
        return "".join(chars)

    def extract_valid_plate(self, text: str) -> str:
        # Attempts to find a valid Indian plate pattern within a noisy string
        if not text: return ""
        # Match XX00XX0000 or similar variants. Allow 1-3 letters in the middle.
        pattern = re.compile(r'[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}')
        match = pattern.search(text)
        if match:
            return match.group(0)
        return ""

    def validate_plate(self, text: str) -> bool:
        if not text: return False
        pattern = re.compile(r'^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$')
        return bool(pattern.match(text))

    def _get_candidates(self, image_bytes: bytes, label: str):
        print(f"\n======== {label.upper()} ========")
        if not image_bytes:
            print("No image provided.")
            return [], 0.0
            
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return None
                
            print(f"Original Size: {img.shape}")
            
            img = self._resize_max_width(img, 1280)
            
            t0 = time.time()
            cropped, det_score, bbox = self.detector.detect(img)
            t_detect = (time.time() - t0) * 1000
            print(f"[Timing] Detection: {t_detect:.2f}ms")
            
            print(f"Plate Detection Score: {det_score:.2f}")
            if bbox:
                print(f"Bounding Box: x={bbox[0]}, y={bbox[1]}, w={bbox[2]}, h={bbox[3]}")
                print(f"Crop Size: {cropped.shape}")
            else:
                print("Bounding Box: None")
                print(f"Crop Size: {cropped.shape}")

            # Detect if it's a 2-line plate (roughly square aspect ratio)
            aspect = cropped.shape[1] / float(max(cropped.shape[0], 1))
            is_two_line_candidate = (aspect <= 2.2) and (cropped.shape[0] < 400)
            if is_two_line_candidate:
                print(f"2-Line Plate Candidate Detected (AR={aspect:.2f})")
                
            def try_join_candidate(texts, bboxes, confs):
                """Try joining a sequence of OCR text boxes into a plate number."""
                raw = " ".join(texts)
                norm = self.normalize_plate(raw)
                corr = self.correct_plate(norm)
                extracted = self.extract_valid_plate(corr)
                final = extracted if extracted else corr
                is_valid = self.validate_plate(final)
                avg_conf = sum(confs) / len(confs)
                return {
                    "raw": raw,
                    "normalized": norm,
                    "corrected": final,
                    "confidence": avg_conf,
                    "status": "success" if is_valid else "validation_failed",
                    "bboxes": bboxes
                }

            def process_ocr_results(ocr_res):
                best_candidate = None

                def update_best(candidate):
                    nonlocal best_candidate
                    if not candidate:
                        return
                    if candidate["status"] == "success":
                        if not best_candidate or best_candidate["status"] != "success" or \
                           candidate["confidence"] > best_candidate["confidence"]:
                            best_candidate = candidate
                    elif not best_candidate:
                        best_candidate = candidate

                if not ocr_res:
                    return None

                # Step 1: check individual boxes first
                for bbox, text, conf in ocr_res:
                    norm = self.normalize_plate(text)
                    corr = self.correct_plate(norm)
                    is_valid = self.validate_plate(corr)
                    if is_valid:
                        update_best({
                            "raw": text, "normalized": norm, "corrected": corr,
                            "confidence": conf, "status": "success", "bboxes": [bbox]
                        })

                if best_candidate and best_candidate["status"] == "success":
                    return best_candidate

                def are_boxes_close(b1, b2):
                    # b1, b2: [[x1,y1], [x2,y1], [x2,y2], [x1,y2]]
                    y1_c = (b1[0][1] + b1[2][1]) / 2.0
                    y2_c = (b2[0][1] + b2[2][1]) / 2.0
                    x1_c = (b1[0][0] + b1[1][0]) / 2.0
                    x2_c = (b2[0][0] + b2[1][0]) / 2.0
                    h1 = b1[2][1] - b1[0][1]
                    h2 = b2[2][1] - b2[0][1]
                    avg_h = (h1 + h2) / 2.0 + 1e-5
                    
                    if abs(y1_c - y2_c) > avg_h * 4.0: return False
                    if abs(x1_c - x2_c) > avg_h * 8.0: return False
                    return True

                # Step 2: try all pairs of boxes (for 2-line plates like AP 40F / D 1307)
                n = len(ocr_res)
                for i in range(n):
                    for j in range(n):
                        if i == j:
                            continue
                        bboxes_i, texts_i, confs_i = ocr_res[i][0], ocr_res[i][1], ocr_res[i][2]
                        bboxes_j, texts_j, confs_j = ocr_res[j][0], ocr_res[j][1], ocr_res[j][2]
                        
                        if not are_boxes_close(bboxes_i, bboxes_j):
                            continue
                            
                        cand = try_join_candidate(
                            [texts_i, texts_j], [bboxes_i, bboxes_j], [confs_i, confs_j]
                        )
                        update_best(cand)
                        if best_candidate and best_candidate["status"] == "success":
                            return best_candidate

                # Step 3: try all triplets
                for i in range(n):
                    for j in range(n):
                        for k in range(n):
                            if i == j or j == k or i == k:
                                continue
                            bboxes_i, texts_i, confs_i = ocr_res[i][0], ocr_res[i][1], ocr_res[i][2]
                            bboxes_j, texts_j, confs_j = ocr_res[j][0], ocr_res[j][1], ocr_res[j][2]
                            bboxes_k, texts_k, confs_k = ocr_res[k][0], ocr_res[k][1], ocr_res[k][2]
                            
                            if not (are_boxes_close(bboxes_i, bboxes_j) and are_boxes_close(bboxes_j, bboxes_k)):
                                continue

                            cand = try_join_candidate(
                                [texts_i, texts_j, texts_k],
                                [bboxes_i, bboxes_j, bboxes_k],
                                [confs_i, confs_j, confs_k]
                            )
                            update_best(cand)
                            if best_candidate and best_candidate["status"] == "success":
                                return best_candidate

                # Step 4: join all as last resort
                joined_text = " ".join([t for _, t, _ in ocr_res])
                avg_conf = sum([c for _, _, c in ocr_res]) / len(ocr_res)
                t_corr_start = time.time()
                cand = try_join_candidate(
                    [t for _, t, _ in ocr_res],
                    [b for b, _, _ in ocr_res],
                    [c for _, _, c in ocr_res]
                )
                t_corr = (time.time() - t_corr_start) * 1000
                print(f"[Timing] Correction & Validation: {t_corr:.2f}ms")
                update_best(cand)

                return best_candidate

            def run_scales(img_enh, min_conf=0.30):
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
                            
                return best_valid if best_valid else best_fallback

            # PASS 0: 2-Line Plate Split (for plates like AP 40F / D 1307)
            # When the detected crop is nearly square, split it into top/bottom and join OCR results
            best_candidate = None
            if is_two_line_candidate:
                print("Attempting 2-line plate split processing...")
                mid = cropped.shape[0] // 2
                # Give slight overlap to avoid clipping characters on the boundary
                overlap = max(5, int(cropped.shape[0] * 0.05))
                top_half    = cropped[0:mid + overlap, :]
                bottom_half = cropped[max(0, mid - overlap):, :]

                def ocr_half(half_img, label_h):
                    enh = self.enhance_plate(half_img, use_threshold=False)
                    results = self.reader.readtext(enh, detail=1)
                    filtered = self.filter_bboxes(results, enh.shape, min_conf=0.25)
                    if not filtered:
                        enh_th = self.enhance_plate(half_img, use_threshold=True)
                        results = self.reader.readtext(enh_th, detail=1)
                        filtered = self.filter_bboxes(results, enh_th.shape, min_conf=0.25)
                    texts = [t for _, t, _ in filtered]
                    confs = [c for _, _, c in filtered]
                    bboxes = [b for b, _, _ in filtered]
                    combined_text = " ".join(texts)
                    print(f"[2-Line {label_h}] OCR: {combined_text!r}")
                    return combined_text, bboxes, confs

                top_text, top_bboxes, top_confs = ocr_half(top_half, "Top")
                bottom_text, bot_bboxes, bot_confs = ocr_half(bottom_half, "Bottom")

                if top_text and bottom_text:
                    joined_bboxes = top_bboxes + bot_bboxes
                    joined_confs  = top_confs  + bot_confs
                    cand = try_join_candidate([top_text, bottom_text], joined_bboxes, joined_confs)
                    if cand and cand["status"] == "success":
                        best_candidate = cand
                        print(f"Enhancement Mode: 2-Line Split")
                elif top_text or bottom_text:
                    part_text = top_text or bottom_text
                    part_boxes = top_bboxes or bot_bboxes
                    part_confs = top_confs or bot_confs
                    cand = try_join_candidate([part_text], part_boxes, part_confs)
                    if cand and cand["status"] == "success":
                        best_candidate = cand

            # PASS 1: Base enhancement
            if not best_candidate or best_candidate["status"] != "success":
                t_enh_start = time.time()
                enhanced = self.enhance_plate(cropped, use_threshold=False)
                t_enh = (time.time() - t_enh_start) * 1000
                print(f"[Timing] Enhancement (Base): {t_enh:.2f}ms")
                print(f"Enhancement Mode: Base (CLAHE)")
                
                best_candidate = run_scales(enhanced)

            
            # PASS 2: Threshold if base pass didn't find a valid plate
            if not best_candidate or best_candidate["status"] != "success":
                print("No valid plate found, attempting Threshold enhancement pass...")
                t_enh_start = time.time()
                enh_thresh = self.enhance_plate(cropped, use_threshold=True)
                t_enh = (time.time() - t_enh_start) * 1000
                print(f"[Timing] Enhancement (Threshold): {t_enh:.2f}ms")
                
                best_candidate_2 = run_scales(enh_thresh)
                
                if best_candidate_2:
                    is_new_valid = best_candidate_2["status"] == "success"
                    is_old_valid = best_candidate and best_candidate["status"] == "success"
                    
                    if (is_new_valid and not is_old_valid) or \
                       (is_new_valid == is_old_valid and (not best_candidate or best_candidate_2["confidence"] > best_candidate["confidence"])):
                        best_candidate = best_candidate_2
                        print(f"Enhancement Mode: Threshold")
                    
            # PASS 3: If detector crop failed to yield a valid plate, try targeted bottom crop
            # (plates on bikes/trucks are typically in lower half of the frame)
            if bbox and (not best_candidate or best_candidate["status"] != "success"):
                print("No valid plate found in crop, attempting OCR on bottom-half crop...")
                h_orig, w_orig = img.shape[:2]

                # Try bottom 55% of the image — typical plate zone for bikes/trucks
                bottom_crop = img[int(h_orig * 0.45):h_orig, int(w_orig * 0.05):int(w_orig * 0.95)]
                bottom_crop = self._resize_max_width(bottom_crop, 1280)

                def _try_passes_on(crop, min_conf=0.20):
                    enh = self.enhance_plate(crop, use_threshold=False)
                    result = run_scales(enh, min_conf=min_conf)
                    if not result or result["status"] != "success":
                        enh_th = self.enhance_plate(crop, use_threshold=True)
                        result_th = run_scales(enh_th, min_conf=min_conf)
                        if result_th:
                            is_new_valid = result_th["status"] == "success"
                            is_old_valid = result and result["status"] == "success"
                            if (is_new_valid and not is_old_valid) or \
                               (is_new_valid == is_old_valid and (not result or result_th["confidence"] > result["confidence"])):
                                result = result_th
                    return result

                def _update_best_candidate(cand3, label):
                    nonlocal best_candidate
                    if not cand3:
                        return
                    is_new_valid = cand3["status"] == "success"
                    is_old_valid = best_candidate and best_candidate["status"] == "success"
                    if (is_new_valid and not is_old_valid) or \
                       (is_new_valid == is_old_valid and (not best_candidate or cand3["confidence"] > best_candidate["confidence"])):
                        best_candidate = cand3
                        print(f"Enhancement Mode: {label}")

                # 3a: bottom-half crop with lower confidence threshold
                bc_bottom = _try_passes_on(bottom_crop, min_conf=0.20)
                _update_best_candidate(bc_bottom, "Full Image Bottom-Half Fallback")

                # 3b: If still not found, try the full image (wide but lower res)
                if not best_candidate or best_candidate["status"] != "success":
                    print("Still no valid plate, attempting OCR on FULL image...")
                    fallback_crop = img[int(h_orig * 0.10):int(h_orig * 0.95), int(w_orig * 0.05):int(w_orig * 0.95)]
                    fallback_crop = self._resize_max_width(fallback_crop, 1280)
                    bc_full = _try_passes_on(fallback_crop, min_conf=0.15)
                    _update_best_candidate(bc_full, "Full Image Fallback")

            if not best_candidate:
                return None
                
            print(f"OCR Scale: {best_candidate.get('scale', 1.0)}x")
            print(f"Raw OCR: {best_candidate['raw']}")
            print(f"Normalized: {best_candidate['normalized']}")
            print(f"Corrected: {best_candidate['corrected']}")
            print(f"Validation: {best_candidate['status']}")
            print(f"Confidence: {best_candidate['confidence']:.2f}")
            
            return best_candidate
            
        except Exception as e:
            import traceback
            print(f"Error processing {label}:\n{traceback.format_exc()}")
            return None

    def merge_front_rear(self, front: dict, rear: dict) -> dict:
        f_valid = front and front.get("status") == "success"
        r_valid = rear and rear.get("status") == "success"
        
        if f_valid and not r_valid: return front
        if r_valid and not f_valid: return rear
        
        if f_valid and r_valid:
            return front if front.get("confidence", 0) >= rear.get("confidence", 0) else rear
            
        # If neither is valid, return higher confidence
        f_conf = front.get("confidence", 0) if front else 0
        r_conf = rear.get("confidence", 0) if rear else 0
        if f_conf >= r_conf and front:
            front["status"] = "validation_failed"
            return front
        if rear:
            rear["status"] = "validation_failed"
            return rear
            
        return None

    def extract_vehicle_data(self, image_data: dict) -> dict:
        start_time = time.time()
        front_res = self._get_candidates(image_data.get("frontPlate"), "Front")
        if isinstance(front_res, tuple):
            front_res = None
        rear_res = self._get_candidates(image_data.get("rearPlate"), "Rear")
        if isinstance(rear_res, tuple):
            rear_res = None
        
        best_res = self.merge_front_rear(front_res, rear_res)
        
        final_plate = best_res["corrected"] if best_res else None
        
        payload = {
            "frontPlateNumber": final_plate,
            "rearPlateNumber": final_plate,
            "normalizedPlateNumber": final_plate,
            "vehicleType": None,
            "vehicleColor": None,
            "confidence": {
                "ocr": round(best_res["confidence"] * 100, 2) if best_res else 0.0
            },
            "validationStatus": best_res["status"] if best_res else "ocr_failed",
            "modelVersions": {
                "ocr": "easyocr_en_v2"
            }
        }
        
        payload["rawFrontOCR"] = front_res["raw"] if front_res else None
        payload["rawRearOCR"] = rear_res["raw"] if rear_res else None
        payload["normalizedFrontOCR"] = front_res["normalized"] if front_res else None
        payload["normalizedRearOCR"] = rear_res["normalized"] if rear_res else None
        payload["correctedFrontOCR"] = front_res["corrected"] if front_res else None
        payload["correctedRearOCR"] = rear_res["corrected"] if rear_res else None
        
        proc_time = int((time.time() - start_time) * 1000)
        payload["processingTimeMs"] = proc_time
        print(f"\nPipeline Total Time: {proc_time}ms\n")
        
        return payload

anpr_service_v2 = ANPRServiceV2()
