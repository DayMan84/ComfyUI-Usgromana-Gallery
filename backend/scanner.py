# ComfyUI-Usgromana-Gallery/backend/scanner.py
# Background file scanner for non-blocking startup

import os
import threading
import time
from typing import List, Callable, Optional
from .files import list_output_images, MEDIA_EXTENSIONS


class BackgroundScanner:
    """Scans files in a background thread to avoid blocking startup."""
    
    def __init__(self, callback: Callable[[List], None], extensions: Optional[set[str]] = None):
        self.callback = callback
        self.extensions = extensions or MEDIA_EXTENSIONS
        self.scanning = False
        self.thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
    
    def start_scan(self):
        """Start scanning in background thread."""
        if self.scanning:
            return
        
        self.scanning = True
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._scan_worker, daemon=True)
        self.thread.start()
        print("[Usgromana-Gallery] Background scan started")
    
    def _scan_worker(self):
        """Worker thread that performs the scan."""
        try:
            # Small delay to let ComfyUI finish initializing
            time.sleep(0.5)
            
            if self._stop_event.is_set():
                return
            
            images = list_output_images(extensions=self.extensions)
            
            if not self._stop_event.is_set():
                self.callback(images)
                print(f"[Usgromana-Gallery] Background scan completed: {len(images)} images")
        except Exception as e:
            print(f"[Usgromana-Gallery] Background scan error: {e}")
        finally:
            self.scanning = False
    
    def stop(self):
        """Stop the scanner."""
        self._stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.scanning = False

