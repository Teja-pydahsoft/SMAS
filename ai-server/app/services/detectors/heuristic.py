import os
import cv2
import numpy as np
from typing import List, Tuple, Dict
from .base import PlateDetector

class HeuristicOpenCVDetector(PlateDetector):
    def __init__(self, debug=None):
        if debug is None:
            self.debug = os.environ.get("DEBUG_PLATE", "false").lower() == "true"
        else:
            self.debug = debug
        self.debug_dir = os.path.join(os.getcwd(), "debug")
        if self.debug and not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir, exist_ok=True)

    def _resize_max_width(self, img: np.ndarray, max_width=1280) -> np.ndarray:
        h, w = img.shape[:2]
        if w > max_width:
            scale = max_width / float(w)
            return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        return img

    def _save_debug(self, filename: str, img: np.ndarray):
        if self.debug:
            cv2.imwrite(os.path.join(self.debug_dir, filename), img)

    def _score_candidate(self, contour, gray_img, img_area) -> Dict:
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = float(w) / max(h, 1)
        area = cv2.contourArea(contour)
        rect_area = w * h
        rectangularity = area / max(rect_area, 1)

        # Convex Hull and Solidity
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area / max(hull_area, 1)

        # Min Area Rect (for rotation)
        rect = cv2.minAreaRect(contour)
        angle = rect[2]
        if angle < -45:
            angle = 90 + angle
        angle_penalty = abs(angle) / 45.0  # 0 to 1

        # Region Prior (lower-middle)
        img_h, img_w = gray_img.shape[:2]
        center_x, center_y = x + w / 2, y + h / 2
        
        rx = center_x / img_w
        ry = center_y / img_h
        
        # Best position: x in [0.1, 0.9], y in [0.4, 0.9]
        region_score = 1.0
        if rx < 0.1 or rx > 0.9:
            region_score -= 0.5
        if ry < 0.35:
            region_score -= 0.8
        elif 0.5 <= ry <= 0.95:
            region_score += 0.2
            
        region_score = max(0.0, min(1.0, region_score))

        # Basic filtering to reject impossible candidates early
        if ry < 0.25:
            return {"score": 0, "reason": "Too high in image", "bbox": (x,y,w,h)}
        if not (0.7 <= aspect_ratio <= 6.0):
            return {"score": 0, "reason": "Aspect ratio out of bounds", "bbox": (x,y,w,h)}
        if not (0.0002 * img_area <= area <= 0.15 * img_area):
            return {"score": 0, "reason": "Area out of bounds", "bbox": (x,y,w,h)}
        if rectangularity < 0.4:
            return {"score": 0, "reason": "Low rectangularity", "bbox": (x,y,w,h)}
        if solidity < 0.5:
            return {"score": 0, "reason": "Low solidity", "bbox": (x,y,w,h)}
        if angle_penalty > 0.5: # More than 22.5 degrees tilt
            return {"score": 0, "reason": "Too rotated", "bbox": (x,y,w,h)}

        # Aspect ratio score (peak around 3.5 for 1-line, 1.5 for 2-line)
        if aspect_ratio <= 2.2:
            ar_score = 1.0 - abs(aspect_ratio - 1.5) / 1.5
        else:
            ar_score = 1.0 - abs(aspect_ratio - 3.5) / 3.5
        ar_score = max(0, ar_score)
        
        # Edge density (a plate usually has text, so high edge density in the center)
        roi = gray_img[y:y+h, x:x+w]
        edges = cv2.Canny(roi, 50, 150)
        edge_density = np.sum(edges > 0) / max(rect_area, 1)
        edge_score = min(edge_density / 0.15, 1.0) # Assume 15% edge density is a great plate

        # Final score
        score = (ar_score * 0.25) + (rectangularity * 0.25) + (solidity * 0.15) + (edge_score * 0.15) + (region_score * 0.20)
        
        return {
            "score": score,
            "reason": "Accepted",
            "bbox": (x, y, w, h),
            "area": area,
            "ar": aspect_ratio,
            "rect": rectangularity,
            "solid": solidity,
            "edges": edge_density
        }

    def _extract_contours_pass1(self, gray: np.ndarray):
        bfilter = cv2.bilateralFilter(gray, 11, 17, 17)
        edged = cv2.Canny(bfilter, 30, 200)
        contours, _ = cv2.findContours(edged, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        return contours

    def _extract_contours_pass2(self, gray: np.ndarray):
        bfilter = cv2.bilateralFilter(gray, 11, 17, 17)
        thresh = cv2.adaptiveThreshold(bfilter, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 19, 9)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        return contours

    def _extract_contours_pass3(self, gray: np.ndarray):
        mser = cv2.MSER_create(min_area=500, max_area=30000)
        regions, _ = mser.detectRegions(gray)
        hulls = [cv2.convexHull(p.reshape(-1, 1, 2)) for p in regions]
        return hulls

    def _extract_contours_pass4(self, gray: np.ndarray):
        rectKernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
        blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rectKernel)
        gradX = cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
        gradX = np.absolute(gradX)
        (minVal, maxVal) = (np.min(gradX), np.max(gradX))
        gradX = 255 * ((gradX - minVal) / (maxVal - minVal))
        gradX = gradX.astype("uint8")
        gradX = cv2.GaussianBlur(gradX, (5, 5), 0)
        gradX = cv2.morphologyEx(gradX, cv2.MORPH_CLOSE, rectKernel)
        thresh = cv2.threshold(gradX, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        sqKernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, sqKernel)
        thresh = cv2.erode(thresh, None, iterations=2)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        return contours

    def detect(self, img: np.ndarray) -> tuple:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        img_area = gray.shape[0] * gray.shape[1]
        
        self._save_debug("1_original.jpg", img)

        passes = [
            ("Pass 1 (Canny)", self._extract_contours_pass1),
            ("Pass 2 (Adaptive Thresh)", self._extract_contours_pass2),
            ("Pass 3 (MSER)", self._extract_contours_pass3),
            ("Pass 4 (Blackhat Sobel)", self._extract_contours_pass4)
        ]

        best_candidate = None
        all_evaluated_bboxes = []

        print("--- Starting Candidate Debugging ---")
        
        for pass_idx, (pass_name, extract_fn) in enumerate(passes):
            print(f"Executing {pass_name}...")
            try:
                contours = extract_fn(gray)
            except Exception as e:
                print(f"Error in {pass_name}: {e}")
                continue
                
            # Filter and sort to avoid processing thousands of tiny contours
            contours = sorted(contours, key=cv2.contourArea, reverse=True)[:50]

            for idx, contour in enumerate(contours):
                # Ensure the contour has enough points for approxPolyDP / bounding box
                if len(contour) < 3:
                    continue
                    
                eval_res = self._score_candidate(contour, gray, img_area)
                x, y, w, h = eval_res["bbox"]
                all_evaluated_bboxes.append(eval_res["bbox"])
                
                if eval_res["score"] == 0:
                    print(f"Contour {idx} | Area: {cv2.contourArea(contour):.1f} | Rejected: {eval_res['reason']}")
                    continue
                    
                print(f"Contour {idx} | Area: {eval_res['area']:.1f} | Aspect: {eval_res['ar']:.2f} | Rect: {eval_res['rect']:.2f} | Solid: {eval_res['solid']:.2f} | Edges: {eval_res['edges']:.2f} | Score: {eval_res['score']:.2f} | Accepted")
                
                if not best_candidate or eval_res["score"] > best_candidate["score"]:
                    best_candidate = eval_res

            # Conditional Early Exit
            if best_candidate and best_candidate["score"] > 0.88:
                print(f"Early exit triggered in {pass_name} with score {best_candidate['score']:.2f}")
                break

        print("--- End Candidate Debugging ---")

        if self.debug:
            dbg_img = img.copy()
            for (bx, by, bw, bh) in all_evaluated_bboxes:
                cv2.rectangle(dbg_img, (bx, by), (bx+bw, by+bh), (0, 0, 255), 1)
            self._save_debug("2_candidates.jpg", dbg_img)

        if best_candidate:
            x, y, w, h = best_candidate["bbox"]
            
            if self.debug:
                dbg_selected = img.copy()
                cv2.rectangle(dbg_selected, (x, y), (x+w, y+h), (0, 255, 0), 3)
                self._save_debug("3_selected.jpg", dbg_selected)

            # Padding (15 pixels)
            pad = 15
            topx = max(0, y - pad)
            topy = max(0, x - pad)
            bottomx = min(gray.shape[0], y + h + pad)
            bottomy = min(gray.shape[1], x + w + pad)
            
            best_crop = img[topx:bottomx, topy:bottomy]
            self._save_debug("4_cropped_plate.jpg", best_crop)
            
            return best_crop, best_candidate["score"], (x, y, w, h)

        # Fallback
        h, w = img.shape[:2]
        crop_y1 = int(h * 0.15)
        crop_y2 = int(h * 0.95)
        crop_x1 = int(w * 0.15)
        crop_x2 = int(w * 0.85)
        fallback_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
        safe_img = self._resize_max_width(fallback_crop, max_width=1200)
        
        self._save_debug("4_cropped_plate_fallback.jpg", safe_img)
        return safe_img, 0.0, None
