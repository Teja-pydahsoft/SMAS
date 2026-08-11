def edit_distance(s1: str, s2: str) -> int:
    if len(s1) > len(s2):
        s1, s2 = s2, s1

    distances = range(len(s1) + 1)
    for index2, char2 in enumerate(s2):
        new_distances = [index2 + 1]
        for index1, char1 in enumerate(s1):
            if char1 == char2:
                new_distances.append(distances[index1])
            else:
                new_distances.append(1 + min((distances[index1], distances[index1 + 1], new_distances[-1])))
        distances = new_distances

    return distances[-1]

def find_best_near_match(plate: str, vehicle_master_keys: list, max_distance: int = 1) -> str:
    """
    Finds the closest plate in the vehicle master database within max_distance.
    Returns the matched plate string, or None if no acceptable match is found.
    """
    best_match = None
    min_dist = max_distance + 1
    
    for v_plate in vehicle_master_keys:
        # Optimization: length diff must be <= max_distance
        if abs(len(plate) - len(v_plate)) > max_distance:
            continue
            
        dist = edit_distance(plate, v_plate)
        if dist < min_dist:
            min_dist = dist
            best_match = v_plate
            
    return best_match
