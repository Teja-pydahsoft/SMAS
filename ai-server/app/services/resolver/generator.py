import re
import itertools
from typing import List

CONFUSION_MAP = {
    '1': ['7', 'I'],
    '7': ['1'],
    'I': ['1'],
    '2': ['Z'],
    'Z': ['2'],
    '5': ['S'],
    'S': ['5'],
    '6': ['G'],
    'G': ['6'],
    '8': ['B'],
    'B': ['8'],
    '0': ['O', 'Q', 'D'],
    'O': ['0', 'Q'],
    'Q': ['0', 'O'],
    'D': ['0']
}

PLATE_REGEX = re.compile(r'^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$')

def is_valid_plate(plate: str) -> bool:
    return bool(PLATE_REGEX.match(plate))

def generate_variants(base_plate: str, max_subs: int = 2, max_variants: int = 20) -> List[str]:
    """
    Generates intelligent alternatives using character confusion rules.
    Limits to max_subs character substitutions per generated variant.
    Limits total variants to max_variants to prevent combinatorial explosion.
    Only returns variants that match the Indian vehicle registration format.
    """
    if not base_plate:
        return []
        
    base_plate = base_plate.upper().replace(" ", "")
    
    # Pre-calculate possible substitutions for each position
    options = []
    for char in base_plate:
        pos_options = [char]
        if char in CONFUSION_MAP:
            pos_options.extend(CONFUSION_MAP[char])
        options.append(pos_options)
        
    variants = []
    
    # Generate combinations and filter
    # To limit substitutions, we can check how many characters differ from the base_plate
    for combo in itertools.product(*options):
        variant = "".join(combo)
        
        # Count substitutions
        subs_count = sum(1 for a, b in zip(base_plate, variant) if a != b)
        
        if 0 < subs_count <= max_subs:
            if is_valid_plate(variant):
                variants.append(variant)
                if len(variants) >= max_variants:
                    break
                    
    return variants
