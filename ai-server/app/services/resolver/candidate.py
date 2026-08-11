from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class PlateCandidate:
    raw: str
    corrected: str
    base_confidence: float
    pipeline: str
    is_valid_format: bool
    
    # Generated variants (strings)
    variants: List[str] = field(default_factory=list)
    
    # Final resolution attributes
    final_score: float = 0.0
    confidence_level: str = "LOW"
    is_master_match: bool = False
    
    # Which string was the actual match (could be base or a variant)
    matched_string: Optional[str] = None
    
    # Used for debug logging
    debug_log: List[str] = field(default_factory=list)

    def log(self, msg: str):
        self.debug_log.append(msg)
