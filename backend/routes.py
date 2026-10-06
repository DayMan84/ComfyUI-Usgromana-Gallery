# ComfyUI-Usgromana-Gallery/backend/routes.py

import os
import sys
import json
import urllib.parse
from typing import Set, Callable, Optional

from PIL import Image
from aiohttp import web
from server import PromptServer

from .files import get_output_dir, get_gallery_root_dir, list_output_images, IMAGE_EXTENSIONS
from folder_paths import get_output_directory
from .file_monitor import FileMonitor
from .scanner import BackgroundScanner
from .. import ASSETS_DIR  # from root __init__.py
