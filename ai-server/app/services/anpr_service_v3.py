"""
ANPR Service V3 — Intelligent Registration Region Detection + Fast OCR

Architecture:
  Image → Mode Detection (crop vs full) → Region Detection → Crop → OCR → Spatial Grouping → Normalized Result

Supports:
  - Dedicated plate crops (fast path, 1 OCR call)
  - Full vehicle photos with split registrations (e.g. "AP39 EW" + "2930" on separate panels)
  - Background text rejection via spatial/format filtering
"""

import re
import time
import cv2
import numpy as np

# Lazy-loaded EasyOCR reader
_ocr_reader = None

OCR_ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

# Indian plates: state(2) + district(1-2) + series(1-3) + number(1-4) = 8-11 chars
INDIAN_PLATE_PATTERN = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$')
# Partial prefix: state + district + optional series (no trailing number yet)
INDIAN_PLATE_PARTIAL = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}$')
# Numeric tail or series+number (e.g. "6246" or "UE6246")
NUMERIC_TAIL = re.compile(r'^[0-9]{1,4}$')
SERIES_AND_NUMBER = re.compile(r'^[A-Z]{1,3}[0-9]{1,4}$')


def _get_reader():
    """Lazy-load EasyOCR reader once. Detect GPU availability safely."""
    global _ocr_reader
    if _ocr_reader is not None:
        return _ocr_reader

    import easyocr
    gpu = False
    try:
        import torch
        gpu = torch.cuda.is_available()
    except ImportError:
        pass

    print(f"[ANPR-V3] Initializing EasyOCR (gpu={gpu})")
    _ocr_reader = easyocr.Reader(['en'], gpu=gpu)
    print("[ANPR-V3] EasyOCR ready")
    return _ocr_reader


def _normalize_text(text: str) -> str:
    """Strip to uppercase alphanumeric only."""
    if not text:
        return ""
    return re.sub(r'[^A-Z0-9]', '', text.upper())


def _is_valid_plate(text: str) -> bool:
    """A valid Indian plate must be 8+ chars: XX00X0000 pattern."""
    return len(text) >= 8 and bool(INDIAN_PLATE_PATTERN.match(text))


def _is_partial_plate_prefix(text: str) -> bool:
    """e.g. AP39EW — valid prefix missing trailing digits."""
    return bool(INDIAN_PLATE_PARTIAL.match(text))


def _is_numeric_tail(text: str) -> bool:
    """e.g. 2930 or UE6246 — trailing part of a split/2-line plate."""
    return bool(NUMERIC_TAIL.match(text)) or bool(SERIES_AND_NUMBER.match(text))


def _bbox_to_xyxy(bbox):
    """Convert EasyOCR polygon [[x1,y1],[x2,y1],[x2,y2],[x1,y2]] to (x1,y1,x2,y2) as native ints."""
    xs = [int(p[0]) for p in bbox]
    ys = [int(p[1]) for p in bbox]
    return (min(xs), min(ys), max(xs), max(ys))


def _bbox_center(xyxy):
    return ((xyxy[0] + xyxy[2]) / 2, (xyxy[1] + xyxy[3]) / 2)


def _bbox_height(xyxy):
    return xyxy[3] - xyxy[1]


def _bbox_width(xyxy):
    return xyxy[2] - xyxy[0]


# ─────────────────────────────────────────────
# Mode Detection: Is this a plate crop or full vehicle?
# ─────────────────────────────────────────────

def _detect_mode(img: np.ndarray) -> str:
    """
    Heuristic to determine if the image is:
      'crop' — a close-up of registration text (small image, high text density)
      'full' — a full vehicle photo where registration must be located
    """
    h, w = img.shape[:2]
    area = h * w

    # Small images (< 500x500) are almost certainly crops
    if max(h, w) < 600:
        return 'crop'

    # Very wide/short images are likely plate crops
    aspect = w / max(h, 1)
    if aspect > 3.0 and h < 300:
        return 'crop'

    # Large images are full vehicle
    if area > 800 * 600:
        return 'full'

    return 'crop'


# ─────────────────────────────────────────────
# Region Detection for full vehicle images
# ─────────────────────────────────────────────

def _detect_registration_regions(img: np.ndarray) -> list:
    """
    Detect candidate registration-number regions in a full vehicle image.
    Returns list of (x, y, w, h) bounding boxes sorted left-to-right.

    Strategy: find rectangular, high-contrast, plate-colored regions.
    Plates are typically white/yellow rectangles with dark text.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    img_h, img_w = gray.shape[:2]
    img_area = img_h * img_w

    candidates = []

    # Pass 1: Look for bright rectangular regions (white/yellow plates)
    # Threshold to find bright regions
    _, bright_mask = cv2.threshold(gray, 170, 255, cv2.THRESH_BINARY)
    # Close small gaps within plate text (but not too much — keep separate panels separate)
    k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 5))
    bright_closed = cv2.morphologyEx(bright_mask, cv2.MORPH_CLOSE, k_close)
    # Open to remove small noise
    k_open = cv2.getStructuringElement(cv2.MORPH_RECT, (8, 8))
    bright_opened = cv2.morphologyEx(bright_closed, cv2.MORPH_OPEN, k_open)

    contours1, _ = cv2.findContours(bright_opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours1:
        x, y, w, h = cv2.boundingRect(cnt)
        ar = w / max(h, 1)
        area = w * h
        area_ratio = area / img_area

        if ar < 1.0 or ar > 8.0:
            continue
        if area_ratio < 0.002 or area_ratio > 0.15:
            continue
        if h < 20:
            continue
        # Plates are usually in lower 75% of image
        if (y + h / 2) < img_h * 0.25:
            continue

        # Score: prefer regions in center-bottom, with good AR
        cy = (y + h / 2) / img_h
        cx = (x + w / 2) / img_w
        pos_score = 1.0
        if cy > 0.4:
            pos_score += 0.3
        if 0.15 < cx < 0.85:
            pos_score += 0.2

        candidates.append((x, y, w, h, area * pos_score))

    # Pass 1b: Yellow region detection (hand-painted yellow plates on dark surfaces)
    if len(img.shape) == 3:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        lower_yellow = np.array([15, 80, 80])
        upper_yellow = np.array([45, 255, 255])
        yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)
        k_close_y = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 10))
        yellow_closed = cv2.morphologyEx(yellow_mask, cv2.MORPH_CLOSE, k_close_y)
        k_open_y = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        yellow_opened = cv2.morphologyEx(yellow_closed, cv2.MORPH_OPEN, k_open_y)

        contours_y, _ = cv2.findContours(yellow_opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours_y:
            x, y, w, h = cv2.boundingRect(cnt)
            ar = w / max(h, 1)
            area = w * h
            area_ratio = area / img_area

            if ar < 0.8 or ar > 8.0:
                continue
            if area_ratio < 0.001 or area_ratio > 0.15:
                continue
            if h < 15:
                continue
            if (y + h / 2) < img_h * 0.20:
                continue

            cy_norm = (y + h / 2) / img_h
            cx_norm = (x + w / 2) / img_w
            pos_score = 1.2  # Slight boost for yellow regions (likely plates)
            if cy_norm > 0.5:
                pos_score += 0.3
            if 0.05 < cx_norm < 0.5:
                pos_score += 0.2  # Indian plates often on left side

            candidates.append((x, y, w, h, area * pos_score))

    # Pass 2: Edge-based detection (for plates without bright background)
    bfilter = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(bfilter, 30, 200)
    k_close2 = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 6))
    edged_closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, k_close2)

    contours2, _ = cv2.findContours(edged_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours2:
        x, y, w, h = cv2.boundingRect(cnt)
        ar = w / max(h, 1)
        area = w * h
        area_ratio = area / img_area

        if ar < 1.5 or ar > 7.0:
            continue
        if area_ratio < 0.003 or area_ratio > 0.12:
            continue
        if h < 25:
            continue
        if (y + h / 2) < img_h * 0.25:
            continue

        # Check edge density inside ROI
        roi_edges = edged[y:y+h, x:x+w]
        edge_density = np.sum(roi_edges > 0) / max(area, 1)
        if edge_density < 0.05:
            continue

        cy = (y + h / 2) / img_h
        pos_score = 1.0 + (0.3 if cy > 0.4 else 0)
        candidates.append((x, y, w, h, area * pos_score * edge_density * 10))

    if not candidates:
        return []

    # De-duplicate overlapping candidates
    candidates.sort(key=lambda c: c[4], reverse=True)
    kept = []
    for c in candidates:
        cx, cy_c, cw, ch = c[0], c[1], c[2], c[3]
        overlap = False
        for k in kept:
            kx, ky, kw, kh = k[0], k[1], k[2], k[3]
            # Check IoU-like overlap
            ix1 = max(cx, kx)
            iy1 = max(cy_c, ky)
            ix2 = min(cx + cw, kx + kw)
            iy2 = min(cy_c + ch, ky + kh)
            if ix2 > ix1 and iy2 > iy1:
                inter = (ix2 - ix1) * (iy2 - iy1)
                smaller_area = min(cw * ch, kw * kh)
                if inter / max(smaller_area, 1) > 0.4:
                    overlap = True
                    break
        if not overlap:
            kept.append(c)
        if len(kept) >= 8:
            break

    # Sort left-to-right
    kept.sort(key=lambda c: c[0])
    return [(x, y, w, h) for x, y, w, h, _ in kept]


# ─────────────────────────────────────────────
# Spatial Grouping: combine split registrations
# ─────────────────────────────────────────────

def _group_ocr_results(ocr_results: list, img_shape: tuple) -> dict:
    """
    Given a list of OCR results [{'raw', 'normalized', 'confidence', 'bbox_xyxy'}],
    determine which belong to the primary vehicle registration and combine them.

    Strategy:
    1. If any single result is a complete valid plate → use it.
    2. If a prefix + numeric tail are spatially adjacent → combine.
    3. Otherwise pick the best-scoring candidate.
    """
    if not ocr_results:
        return None

    img_h, img_w = img_shape[:2]

    # Step 1: check for complete plates
    complete = [r for r in ocr_results if _is_valid_plate(r['normalized'])]
    if complete:
        best = max(complete, key=lambda r: r['confidence'])
        return {
            'plates': [best],
            'combinedPlate': best['normalized'],
            'confidence': best['confidence'],
            'status': 'success'
        }

    # Step 2: look for prefix + tail combinations
    # A prefix can also be a partial like "AP05DQ" (valid prefix) or text containing mixed chars
    prefixes = [r for r in ocr_results if _is_partial_plate_prefix(r['normalized'])]
    tails = [r for r in ocr_results if _is_numeric_tail(r['normalized'])]

    # Also consider results that look like they could be a prefix after light correction
    # (e.g. APOSDQ could be AP05DQ after O→0, S→5)
    for r in ocr_results:
        if r in prefixes or r in tails:
            continue
        n = r['normalized']
        if len(n) >= 4 and n[:2].isalpha() and not _is_valid_plate(n):
            # Might be a prefix with digit confusion
            prefixes.append(r)

    best_combo = None
    best_combo_conf = 0

    for prefix in prefixes:
        for tail in tails:
            combined = prefix['normalized'] + tail['normalized']

            # Check spatial: tail should be to the right of or below prefix
            p_center = _bbox_center(prefix['bbox_xyxy'])
            t_center = _bbox_center(tail['bbox_xyxy'])

            p_h = _bbox_height(prefix['bbox_xyxy'])
            t_h = _bbox_height(tail['bbox_xyxy'])
            avg_h = (p_h + t_h) / 2

            vertical_dist = abs(p_center[1] - t_center[1])
            if vertical_dist > avg_h * 4:
                continue

            # Accept if valid format, OR if it looks plate-like (letters+digits, 8-12 chars)
            is_valid = _is_valid_plate(combined)
            looks_platelike = (8 <= len(combined) <= 12 and
                              any(c.isalpha() for c in combined) and
                              any(c.isdigit() for c in combined))

            if not is_valid and not looks_platelike:
                continue

            avg_conf = (prefix['confidence'] + tail['confidence']) / 2
            # Prefer valid over plate-like
            score = avg_conf + (50 if is_valid else 0)
            if score > best_combo_conf:
                best_combo_conf = score
                best_combo = {
                    'plates': [prefix, tail],
                    'combinedPlate': combined,
                    'confidence': avg_conf,
                    'status': 'success' if is_valid else 'validation_failed'
                }

    if best_combo:
        return best_combo

    # Step 3: try joining spatially-close results left-to-right
    sorted_results = sorted(ocr_results, key=lambda r: r['bbox_xyxy'][0])
    joined = ''.join(r['normalized'] for r in sorted_results)
    if _is_valid_plate(joined):
        avg_conf = sum(r['confidence'] for r in sorted_results) / len(sorted_results)
        return {
            'plates': sorted_results,
            'combinedPlate': joined,
            'confidence': avg_conf,
            'status': 'success'
        }

    # Step 3b: try subsets of results (2 or 3 consecutive items) that form a valid plate
    for length in range(min(4, len(sorted_results)), 1, -1):
        for start in range(len(sorted_results) - length + 1):
            subset = sorted_results[start:start + length]
            combined = ''.join(r['normalized'] for r in subset)
            if _is_valid_plate(combined):
                avg_conf = sum(r['confidence'] for r in subset) / len(subset)
                return {
                    'plates': subset,
                    'combinedPlate': combined,
                    'confidence': avg_conf,
                    'status': 'success'
                }

    # Step 4: fallback — return longest normalized text with best confidence
    if ocr_results:
        best = max(ocr_results, key=lambda r: (len(r['normalized']), r['confidence']))
        return {
            'plates': [best],
            'combinedPlate': best['normalized'],
            'confidence': best['confidence'],
            'status': 'validation_failed'
        }

    return None


# ─────────────────────────────────────────────
# OCR a single crop
# ─────────────────────────────────────────────

def _ocr_crop(img: np.ndarray, enhance: bool = True) -> list:
    """
    Run EasyOCR on a single crop. Returns list of
    {'raw', 'normalized', 'confidence', 'bbox_xyxy'}.

    Uses allowlist to avoid picking up irrelevant symbols.
    Tries multiple preprocessing strategies and picks the best result.
    """
    reader = _get_reader()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    h, w = gray.shape[:2]

    # Scale up small crops
    scale = 1.0
    if w < 400:
        scale = max(2.0, 600.0 / w)
    elif w < 200:
        scale = 3.0
    if scale > 1.0:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # Strategy 1: CLAHE enhancement (good for standard plates)
    strategies = []
    if enhance:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        strategies.append(clahe.apply(gray))

        # Strategy 2: Inverted Otsu threshold (good for dark text on white/painted plates)
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = cv2.bitwise_not(otsu)
        strategies.append(inverted)

        # Strategy 3: Yellow channel isolation (for yellow/orange painted text on dark bg)
        if len(img.shape) == 3:
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            # Yellow range in HSV
            lower_yellow = np.array([15, 80, 80])
            upper_yellow = np.array([45, 255, 255])
            mask = cv2.inRange(hsv, lower_yellow, upper_yellow)
            # Dilate slightly to connect broken strokes
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            mask = cv2.dilate(mask, kernel, iterations=1)
            # Scale mask if needed
            if scale > 1.0:
                mask = cv2.resize(mask, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            strategies.append(mask)
    else:
        strategies.append(gray if len(img.shape) == 2 else img)

    best_results = []
    best_total_conf = 0

    for processed in strategies:
        results = reader.readtext(processed, detail=1, allowlist=OCR_ALLOWLIST)
        total_conf = sum(c for _, _, c in results if c > 0.15)
        if total_conf > best_total_conf:
            best_total_conf = total_conf
            best_results = results

    ocr_out = []
    for bbox, text, conf in best_results:
        if conf < 0.15:
            continue
        norm = _normalize_text(text)
        if not norm:
            continue
        xyxy = _bbox_to_xyxy(bbox)
        ocr_out.append({
            'raw': text,
            'normalized': norm,
            'confidence': round(conf * 100, 1),
            'bbox_xyxy': xyxy
        })

    return ocr_out


# ─────────────────────────────────────────────
# Main Pipeline
# ─────────────────────────────────────────────

def _process_crop_mode(img: np.ndarray) -> dict:
    """Fast path: image is already a plate crop. 1 OCR call."""
    ocr_results = _ocr_crop(img, enhance=True)
    grouped = _group_ocr_results(ocr_results, img.shape)

    if grouped and grouped['status'] == 'success':
        return grouped

    # Fallback: try with threshold enhancement (1 extra OCR call)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    h, w = gray.shape[:2]
    if w < 300:
        gray = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    bfilter = cv2.bilateralFilter(gray, 11, 17, 17)
    thresh = cv2.adaptiveThreshold(bfilter, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)

    ocr_results_2 = _ocr_crop(thresh, enhance=False)
    grouped_2 = _group_ocr_results(ocr_results_2, img.shape)

    if grouped_2 and grouped_2['status'] == 'success':
        return grouped_2

    # Return best of two attempts
    if grouped_2 and (not grouped or grouped_2['confidence'] > grouped.get('confidence', 0)):
        return grouped_2
    return grouped



def _process_full_mode(img: np.ndarray) -> dict:
    """
    Full vehicle image. Strategy:
    1. Detect plate-like regions and OCR those (targeted, fast)
    2. If that fails, OCR the full image once and filter results
    """
    h, w = img.shape[:2]
    scale = 1.0
    if max(h, w) > 1600:
        scale = 1600 / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    # Step 1: Detect plate-like regions
    regions = _detect_registration_regions(img)

    # Sort regions by score: prefer those in center-lower area with plate-like AR
    def region_score(r):
        rx, ry, rw, rh = r
        cy = (ry + rh / 2) / h
        cx = (rx + rw / 2) / w
        ar = rw / max(rh, 1)
        score = rw * rh  # area
        if 0.3 < cy < 0.8:
            score *= 2
        if 0.15 < cx < 0.85:
            score *= 1.5
        if 1.5 < ar < 6:
            score *= 1.5
        return score

    regions.sort(key=region_score, reverse=True)

    # OCR top regions (max 3 to keep fast)
    all_ocr = []
    for (rx, ry, rw, rh) in regions[:3]:
        if rw * rh < 800:
            continue
        pad = 10
        x1 = max(0, rx - pad)
        y1 = max(0, ry - pad)
        x2 = min(w, rx + rw + pad)
        y2 = min(h, ry + rh + pad)
        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            continue

        ocr_results = _ocr_crop(crop, enhance=True)
        for r in ocr_results:
            bx1, by1, bx2, by2 = r['bbox_xyxy']
            r['bbox_xyxy'] = (bx1 + x1, by1 + y1, bx2 + x1, by2 + y1)
        all_ocr.extend(ocr_results)

    # Filter background text
    filtered = _filter_background_text(all_ocr, w, h)
    grouped = _group_ocr_results(filtered, img.shape) if filtered else None

    if grouped and grouped['status'] == 'success':
        return grouped

    # Step 2: Fallback — single full-image OCR call
    reader = _get_reader()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Inverted Otsu (works well for painted plates)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    inv = cv2.bitwise_not(otsu)

    full_results = reader.readtext(img, detail=1, allowlist=OCR_ALLOWLIST)
    inv_results = reader.readtext(inv, detail=1, allowlist=OCR_ALLOWLIST)

    # Merge both, de-duplicate
    combined_raw = []
    seen = set()
    for results_list in [full_results, inv_results]:
        for bbox, text, conf in results_list:
            if conf < 0.15:
                continue
            norm = _normalize_text(text)
            if not norm or len(norm) < 2:
                continue
            key = norm
            if key in seen:
                continue
            seen.add(key)
            xyxy = _bbox_to_xyxy(bbox)
            combined_raw.append({
                'raw': text,
                'normalized': norm,
                'confidence': round(conf * 100, 1),
                'bbox_xyxy': xyxy
            })

    filtered2 = _filter_background_text(combined_raw, w, h)
    # Combine with earlier region results
    all_results = filtered + filtered2 if filtered else filtered2

    # De-duplicate by normalized text
    deduped = []
    seen_norms = set()
    for r in all_results:
        if r['normalized'] not in seen_norms:
            seen_norms.add(r['normalized'])
            deduped.append(r)

    grouped2 = _group_ocr_results(deduped, img.shape)

    if grouped2:
        return grouped2
    if grouped:
        return grouped

    return None


def _filter_background_text(ocr_results: list, img_w: int, img_h: int) -> list:
    """Filter out likely background text."""
    filtered = []
    for r in ocr_results:
        cy = (r['bbox_xyxy'][1] + r['bbox_xyxy'][3]) / 2
        cx = (r['bbox_xyxy'][0] + r['bbox_xyxy'][2]) / 2
        text_w = r['bbox_xyxy'][2] - r['bbox_xyxy'][0]

        if cy < img_h * 0.15:
            continue
        if len(r['normalized']) < 2:
            continue
        if cx < img_w * 0.03 or cx > img_w * 0.97:
            continue
        if text_w > img_w * 0.6:
            continue
        if r['normalized'] in ('PLEASE', 'STOP', 'TATA', 'MAHINDRA', 'IND', 'INDIA',
                               'EICHER', 'ASHOK', 'LEYLAND', 'VOLVO', 'HYUNDAI',
                               'BULL', 'BULL0', 'KOMATSU', 'JCB', 'CATERPILLAR',
                               'CAT', 'HITACHI', 'SANY', 'ACE', 'ACTION',
                               'ESCORT', 'ESCORTS', 'SONALIKA', 'SWARAJ',
                               'JOHN', 'DEERE', 'JOHNDEERE', 'KUBOTA',
                               'CASE', 'NEW', 'HOLLAND', 'NEWHOLLAND',
                               'TEREX', 'LIUGONG', 'XCMG', 'SHANTUI',
                               'SCHWING', 'STETTER', 'PUTZMEISTER',
                               'PRASAD', 'SRINIVAS', 'ALLINDIAPERMI', 'ALLINDIAPERMITVA',
                               'PERMIT', 'ALLSTATES', 'PERMITTED'):
            continue
        # Reject pure-letter text that doesn't look like a plate prefix
        if r['normalized'].isalpha() and len(r['normalized']) <= 6 and not _is_partial_plate_prefix(r['normalized']):
            continue
        filtered.append(r)

    return filtered if filtered else ocr_results


class ANPRServiceV3:
    """
    Stateless ANPR service. EasyOCR is lazily initialized on first call.
    """

    def extract_vehicle_data(self, image_data: dict) -> dict:
        """
        Main entry point. Accepts dict with optional keys: 'frontPlate', 'rearPlate', 'front'.
        Returns the API response payload.
        """
        start_time = time.time()
        timings = {}

        # Determine which images to process (prefer frontPlate, fall back to front)
        images_to_try = []
        seen_hashes = set()
        for key in ['frontPlate', 'rearPlate', 'front']:
            if key in image_data and image_data[key]:
                img_hash = hash(image_data[key][:1024])  # Quick hash on first 1KB
                if img_hash in seen_hashes:
                    continue  # Skip duplicate image
                seen_hashes.add(img_hash)
                images_to_try.append((key, image_data[key]))

        best_result = None

        for label, img_bytes in images_to_try:
            t0 = time.time()

            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                continue

            mode = _detect_mode(img)
            timings[f'{label}_mode'] = mode

            t_detect = time.time()
            if mode == 'crop':
                result = _process_crop_mode(img)
            else:
                result = _process_full_mode(img)

            timings[f'{label}_ms'] = int((time.time() - t0) * 1000)

            if result:
                if not best_result or (
                    result.get('status') == 'success' and
                    (best_result.get('status') != 'success' or result['confidence'] > best_result['confidence'])
                ):
                    best_result = result

            # Early exit if we have a valid plate
            if best_result and best_result.get('status') == 'success':
                break

        processing_time = int((time.time() - start_time) * 1000)

        # Build response (backward-compatible with existing consumers)
        if best_result:
            combined = best_result.get('combinedPlate', '')
            plates_detail = []
            for p in best_result.get('plates', []):
                plates_detail.append({
                    'raw': str(p.get('raw', '')),
                    'normalized': str(p.get('normalized', '')),
                    'confidence': float(p.get('confidence', 0)),
                    'bbox': [int(v) for v in p.get('bbox_xyxy', (0, 0, 0, 0))]
                })

            # Always return the combined plate (even if validation_failed)
            # Backend CandidateResolver will handle character corrections
            ocr_conf = float(best_result.get('confidence', 0))
            payload = {
                'success': best_result['status'] == 'success',
                'frontPlateNumber': combined or None,
                'rearPlateNumber': None,
                'normalizedPlateNumber': combined or None,
                'plates': plates_detail,
                'combinedPlate': combined,
                'vehicleType': None,
                'vehicleColor': None,
                'confidence': {
                    'ocr': round(ocr_conf, 1),
                    'overall': round(ocr_conf, 1)
                },
                'validationStatus': best_result.get('status', 'ocr_failed'),
                'modelVersions': {'ocr': 'easyocr_v3_fast'},
                'processingTimeMs': int(processing_time),
                'timings': timings
            }
        else:
            payload = {
                'success': False,
                'frontPlateNumber': None,
                'rearPlateNumber': None,
                'normalizedPlateNumber': None,
                'plates': [],
                'combinedPlate': None,
                'vehicleType': None,
                'vehicleColor': None,
                'confidence': {'ocr': 0, 'overall': 0},
                'validationStatus': 'ocr_failed',
                'modelVersions': {'ocr': 'easyocr_v3_fast'},
                'processingTimeMs': processing_time,
                'timings': timings
            }

        print(f"[ANPR-V3] Result: {payload['normalizedPlateNumber']} "
              f"({payload['validationStatus']}) in {processing_time}ms")

        return payload


anpr_service_v3 = ANPRServiceV3()
