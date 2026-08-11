import time
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from app.services.anpr_service_v1 import anpr_service as anpr_service_v1
from app.services.anpr_service_v2 import anpr_service_v2
import os

router = APIRouter(prefix="/vehicle", tags=["vehicle"])

@router.post("/analyze")
async def analyze_vehicle(
    front: UploadFile = File(None),
    rear: UploadFile = File(None),
    left: UploadFile = File(None),
    right: UploadFile = File(None),
    frontPlate: UploadFile = File(None),
    rearPlate: UploadFile = File(None)
):
    start_time = time.time()
    
    files = {
        "front": front,
        "rear": rear,
        "left": left,
        "right": right,
        "frontPlate": frontPlate,
        "rearPlate": rearPlate
    }
    
    image_data = {}
    for key, f in files.items():
        if f is None:
            continue
        content_type = (f.content_type or "").lower()
        if content_type and not content_type.startswith("image/") and content_type != "application/octet-stream":
            raise HTTPException(status_code=400, detail=f"File {key} must be an image")
        
        bytes_data = await f.read()
        if len(bytes_data) == 0:
            raise HTTPException(status_code=400, detail=f"Empty file {key}")
            
        image_data[key] = bytes_data

    try:
        use_v2 = os.getenv("USE_ANPR_V2", "true").lower() == "true"
        service = anpr_service_v2 if use_v2 else anpr_service_v1
        
        # Offload synchronous OCR to FastAPI threadpool to avoid blocking event loop
        result = await run_in_threadpool(service.extract_vehicle_data, image_data)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        result["processingTimeMs"] = processing_time_ms
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
