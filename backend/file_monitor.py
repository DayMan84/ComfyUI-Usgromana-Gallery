# ComfyUI-Usgromana-Gallery/backend/file_monitor.py
# Real-time file monitoring using Watchdog

import os
import threading
from typing import Callable, Optional, TYPE_CHECKING
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileSystemEvent
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False
    Observer = None
    # Create a dummy base class when watchdog is not available
    class FileSystemEventHandler:
        """Dummy base class when watchdog is not available."""
        pass
    # Define FileSystemEvent as None for type hints when watchdog is not available
    FileSystemEvent = None

# For type checking, ensure FileSystemEvent is available
if TYPE_CHECKING:
    from watchdog.events import FileSystemEvent


class GalleryFileHandler(FileSystemEventHandler):
    """Handle file system events for the gallery."""
    
    def __init__(self, callback: Callable[[str, str], None], extensions: set[str]):
        super().__init__()
        self.callback = callback
        self.extensions = {ext.lower() for ext in extensions}
    
    def _is_relevant_file(self, path: str) -> bool:
        """Check if file has a relevant extension."""
        if not path:
            return False
        ext = os.path.splitext(path)[1].lower()
        return ext in self.extensions
    
    def on_created(self, event: "FileSystemEvent"):
        if not event.is_directory and self._is_relevant_file(event.src_path):
            self.callback("created", event.src_path)
    
    def on_deleted(self, event: "FileSystemEvent"):
        if not event.is_directory and self._is_relevant_file(event.src_path):
            self.callback("deleted", event.src_path)
    
    def on_modified(self, event: "FileSystemEvent"):
        if not event.is_directory and self._is_relevant_file(event.src_path):
            self.callback("modified", event.src_path)
    
    def on_moved(self, event: "FileSystemEvent"):
        if not event.is_directory:
            if self._is_relevant_file(event.src_path):
                self.callback("deleted", event.src_path)
            if self._is_relevant_file(event.dest_path):
                self.callback("created", event.dest_path)


class FileMonitor:
    """Manages file system monitoring for the gallery."""
    
    def __init__(self, watch_path: str, callback: Callable[[str, str], None], extensions: set[str]):
        self.watch_path = watch_path
        self.callback = callback
        self.extensions = extensions
        self.observer: Optional[Observer] = None
        self.handler: Optional[GalleryFileHandler] = None
        self.running = False
        self.use_polling = False  # Can be toggled via settings
    
    def start(self, use_polling: bool = False):
        """Start monitoring the directory."""
        if not WATCHDOG_AVAILABLE:
            print("[Usgromana-Gallery] Watchdog not available. Install with: pip install watchdog")
            return False
        
        if self.running:
            return True
        
        try:
            self.use_polling = use_polling
            self.handler = GalleryFileHandler(self.callback, self.extensions)
            self.observer = Observer()
            
            # Use polling observer if requested (better compatibility)
            if use_polling:
                from watchdog.observers.polling import PollingObserver
                self.observer = PollingObserver(timeout=1.0)
            
            self.observer.schedule(self.handler, self.watch_path, recursive=True)
            self.observer.start()
            self.running = True
            print(f"[Usgromana-Gallery] File monitoring started (polling={use_polling})")
            return True
        except Exception as e:
            print(f"[Usgromana-Gallery] Failed to start file monitor: {e}")
            return False
    
    def stop(self):
        """Stop monitoring."""
        if self.observer and self.running:
            try:
                self.observer.stop()
                self.observer.join(timeout=2.0)
                self.running = False
                print("[Usgromana-Gallery] File monitoring stopped")
            except Exception as e:
                print(f"[Usgromana-Gallery] Error stopping file monitor: {e}")
    
    def update_extensions(self, extensions: set[str]):
        """Update the file extensions to monitor."""
        self.extensions = extensions
        if self.handler:
            self.handler.extensions = {ext.lower() for ext in extensions}
    
    def update_polling(self, use_polling: bool):
        """Update polling mode (requires restart)."""
        if self.use_polling != use_polling:
            was_running = self.running
            if was_running:
                self.stop()
            self.use_polling = use_polling
            if was_running:
                self.start(use_polling)

