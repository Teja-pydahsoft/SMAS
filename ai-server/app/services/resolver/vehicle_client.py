import time
import requests
import os
from typing import List, Dict, Any

class TTLCache:
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self.cache: Dict[str, Any] = {}
        self.expiry: Dict[str, float] = {}

    def get(self, key: str) -> Any:
        if key in self.cache:
            if time.time() < self.expiry[key]:
                return self.cache[key]
            else:
                del self.cache[key]
                del self.expiry[key]
        return None

    def set(self, key: str, value: Any):
        self.cache[key] = value
        self.expiry[key] = time.time() + self.ttl

class VehicleMasterClient:
    def __init__(self):
        # Default TTL 5 minutes
        self.cache = TTLCache(ttl_seconds=300)
        # Assuming the Node backend runs on localhost:3001
        self.base_url = os.getenv("BACKEND_URL", "http://localhost:3001/api")

    def lookup_batch(self, plates: List[str]) -> Dict[str, bool]:
        """
        Returns a dictionary mapping normalized plate string to boolean (True if exists).
        """
        if not plates:
            return {}

        results = {}
        uncached_plates = []

        # 1. Check cache
        for p in plates:
            cached_val = self.cache.get(p)
            if cached_val is not None:
                results[p] = cached_val
            else:
                uncached_plates.append(p)

        # 2. Fetch uncached from backend
        if uncached_plates:
            try:
                # Deduplicate
                unique_uncached = list(set(uncached_plates))
                url = f"{self.base_url}/vehicles/check-batch"
                response = requests.post(url, json={"plates": unique_uncached}, timeout=2.0)
                
                if response.status_code == 200:
                    data = response.json()
                    # data is expected to be a map of { plate: vehicle_object }
                    for p in unique_uncached:
                        exists = p in data
                        results[p] = exists
                        self.cache.set(p, exists)
                else:
                    print(f"[VehicleMaster] Error HTTP {response.status_code}: {response.text}")
                    # On failure, assume False and don't cache
                    for p in unique_uncached:
                        results[p] = False
            except Exception as e:
                print(f"[VehicleMaster] Lookup failed: {e}")
                for p in unique_uncached:
                    results[p] = False

        return results
