import re
import cv2
import numpy as np
import easyocr
import time

class ANPRService:
    def __init__(self):
        print("Initializing EasyOCR Models...")
        self.reader = easyocr.Reader(['en'], gpu=True)
        print("EasyOCR Models Initialized")

    def detect_plate(self, img: np.ndarray) -> tuple:
        """
        OpenCV contour-based localization.
        Searches for rectangular regions with an appropriate aspect ratio.
        Returns (cropped_img, is_cropped).
        Falls back to original image if not found confidently.
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        bfilter = cv2.bilateralFilter(gray, 11, 17, 17)
        edged = cv2.Canny(bfilter, 30, 200)
        
        contours, _ = cv2.findContours(edged, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
        
        location = None
        img_area = img.shape[0] * img.shape[1]
        
        for contour in contours:
            approx = cv2.approxPolyDP(contour, 10, True)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                aspect_ratio = float(w) / h
                area = cv2.contourArea(contour)
                # Plate is usually 0.5% to 15% of the image, aspect ratio 1.5 to 6
                if 1.5 < aspect_ratio < 6 and 0.005 * img_area < area < 0.15 * img_area:
                    location = approx
                    break
                    
        if location is not None:
            mask = np.zeros(gray.shape, np.uint8)
            cv2.drawContours(mask, [location], 0, 255, -1)
            
            (x, y) = np.where(mask == 255)
            if len(x) > 0 and len(y) > 0:
                (topx, topy) = (np.min(x), np.min(y))
                (bottomx, bottomy) = (np.max(x), np.max(y))
                
                pad = 5
                topx = max(0, topx - pad)
                topy = max(0, topy - pad)
                bottomx = min(img.shape[0], bottomx + pad)
                bottomy = min(img.shape[1], bottomy + pad)
                
                cropped = img[topx:bottomx+1, topy:bottomy+1]
                return cropped, True
            
        return img, False

    def enhance_plate(self, img: np.ndarray, is_cropped: bool) -> np.ndarray:
        """
        Enhances the plate image for OCR.
        Resize (max dim 1024), grayscale, CLAHE.
        If it's a tight crop, apply bilateral filter and adaptive threshold.
        If it's a full car image, adaptive threshold destroys natural features, so we skip it.
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        
        h, w = gray.shape[:2]
        max_dim = 1024
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
        else:
            scale = 2.0 if is_cropped else 1.0
            
        resized = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        clahe_img = clahe.apply(resized)
        
        if is_cropped:
            bfilter = cv2.bilateralFilter(clahe_img, 11, 17, 17)
            thresh = cv2.adaptiveThreshold(bfilter, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
            return thresh
            
        return clahe_img

    def run_easyocr(self, img: np.ndarray) -> list:
        """
        Returns raw OCR results from EasyOCR: [(bbox, text, conf), ...]
        No normalization or validation here.
        """
        results = self.reader.readtext(img, detail=1)
        return results

    def normalize_plate(self, text: str) -> str:
        """
        Uppercase, remove spaces, punctuation, keep A-Z, 0-9.
        """
        if not text:
            return ""
        return re.sub(r'[^A-Z0-9]', '', text.upper())

    def correct_plate(self, text: str) -> str:
        """
        Position-aware corrections for Indian plates.
        State (0,1) -> letters
        District (2,3) -> numbers
        Series (4...end-4) -> letters
        Number (last 1-4) -> numbers
        """
        if not text or len(text) < 4:
            return text
            
        chars = list(text)
        
        # State: 0-1
        for i in range(min(2, len(chars))):
            if chars[i] == '0': chars[i] = 'O'
            
        # Number: last digits
        num_count = 0
        for i in range(len(chars) - 1, -1, -1):
            if chars[i] in '0123456789OQIB':
                if chars[i] in 'OQ': chars[i] = '0'
                elif chars[i] == 'I': chars[i] = '1'
                elif chars[i] == 'B': chars[i] = '8'
                num_count += 1
                if num_count == 4:
                    break
            else:
                break
                
        # District: 2-3
        if len(chars) > 2:
            if chars[2] in 'OQ': chars[2] = '0'
        if len(chars) > 3:
            if chars[3] in 'OQ': chars[3] = '0'
            
        # Series: middle
        start_series = 4
        end_series = len(chars) - num_count
        for i in range(start_series, end_series):
            if chars[i] == '0': chars[i] = 'O'
            
        return "".join(chars)

    def validate_plate(self, text: str) -> bool:
        """
        Strict regex match. No partial matching.
        """
        if not text:
            return False
        pattern = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$')
        return bool(pattern.match(text))

    def _process_image(self, image_bytes: bytes, label: str) -> dict:
        """
        Orchestrates pipeline for a single image.
        Evaluates individual text boxes first, then combinations if needed.
        """
        print(f"\n{label} Plate\n-----------")
        if not image_bytes:
            print("No image provided.")
            return None
            
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                print("Failed to decode image.")
                return None
                
            cropped, is_cropped = self.detect_plate(img)
            enhanced = self.enhance_plate(cropped, is_cropped)
            
            ocr_results = self.run_easyocr(enhanced)
            if not ocr_results:
                return None
                
            best_candidate = None
            
            # 1. Try each bounding box individually
            for bbox, text, conf in ocr_results:
                norm = self.normalize_plate(text)
                corr = self.correct_plate(norm)
                is_valid = self.validate_plate(corr)
                
                if is_valid:
                    if not best_candidate or conf > best_candidate["confidence"]:
                        best_candidate = {
                            "raw": text,
                            "normalized": norm,
                            "corrected": corr,
                            "confidence": conf,
                            "status": "success",
                            "bboxes": [bbox]
                        }
                        
            # 2. If no individual box matches, try joining them all (in case it's a tight crop)
            if not best_candidate:
                joined_text = "".join([text for (bbox, text, conf) in ocr_results])
                avg_conf = sum([conf for (bbox, text, conf) in ocr_results]) / len(ocr_results)
                
                norm = self.normalize_plate(joined_text)
                corr = self.correct_plate(norm)
                is_valid = self.validate_plate(corr)
                
                best_candidate = {
                    "raw": joined_text,
                    "normalized": norm,
                    "corrected": corr,
                    "confidence": avg_conf,
                    "status": "success" if is_valid else "validation_failed",
                    "bboxes": [bbox for (bbox, text, conf) in ocr_results]
                }
                
            print(f"Raw OCR: {best_candidate['raw']}")
            print(f"Normalized: {best_candidate['normalized']}")
            print(f"Corrected: {best_candidate['corrected']}")
            print(f"Validated: {best_candidate['status'] == 'success'}")
            print(f"Confidence: {best_candidate['confidence']:.2f}")
            
            return best_candidate
            
        except Exception as e:
            print(f"Error processing {label}: {e}")
            return None

    def merge_front_rear(self, front: dict, rear: dict) -> dict:
        """
        Compares results. Prioritizes valid plates and higher confidence.
        """
        f_valid = front and front.get("status") == "success"
        r_valid = rear and rear.get("status") == "success"
        
        if f_valid and not r_valid:
            return front
        if r_valid and not f_valid:
            return rear
            
        if f_valid and r_valid:
            return front if front.get("confidence", 0) >= rear.get("confidence", 0) else rear
            
        f_conf = front.get("confidence", 0) if front else 0
        r_conf = rear.get("confidence", 0) if rear else 0
        if f_conf >= r_conf and front:
            return front
        if rear:
            return rear
            
        return None

    def extract_vehicle_data(self, image_data: dict) -> dict:
        start_time = time.time()
        
        front_res = self._process_image(image_data.get("frontPlate"), "Front")
        rear_res = self._process_image(image_data.get("rearPlate"), "Rear")
        
        best_res = self.merge_front_rear(front_res, rear_res)
        
        final_plate = best_res["corrected"] if best_res and best_res["status"] == "success" else None
        if not final_plate and best_res:
             # if validation failed, fallback to returning null for the backend but keep the raw data in payload
             pass
        
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
                "ocr": "easyocr_en_v1"
            }
        }
        
        payload["rawFrontOCR"] = front_res["raw"] if front_res else None
        payload["rawRearOCR"] = rear_res["raw"] if rear_res else None
        payload["normalizedFrontOCR"] = front_res["normalized"] if front_res else None
        payload["normalizedRearOCR"] = rear_res["normalized"] if rear_res else None
        payload["correctedFrontOCR"] = front_res["corrected"] if front_res else None
        payload["correctedRearOCR"] = rear_res["corrected"] if rear_res else None
        
        payload["processingTimeMs"] = int((time.time() - start_time) * 1000)
        
        return payload

anpr_service = ANPRService()
