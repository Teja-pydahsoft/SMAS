from abc import ABC, abstractmethod
import numpy as np

class PlateDetector(ABC):
    """
    Abstract base class for all License Plate Detectors.
    This interface ensures compatibility with future DL-based detectors (YOLO, ONNX, etc.)
    """

    @abstractmethod
    def detect(self, img: np.ndarray) -> tuple:
        """
        Detects a license plate in the given image.

        Args:
            img (np.ndarray): The input BGR image.

        Returns:
            tuple: (best_crop: np.ndarray, best_score: float, best_bbox: tuple)
                   If no plate is found, should return fallback_image, 0.0, None.
        """
        pass
