# ComfyUI-Usgromana-Gallery/backend/metadata_extractor.py
"""
Metadata extraction from ComfyUI images.
Extracts workflow, prompts, generation parameters, and other metadata from PNG text chunks and EXIF.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS, IFD
from PIL.PngImagePlugin import PngImageFile
from PIL.JpegImagePlugin import JpegImageFile


def get_size(file_path: str) -> str:
    """Format file size in human-readable format."""
    file_size_bytes = os.path.getsize(file_path)
    if file_size_bytes < 1024:
        return f"{file_size_bytes} bytes"
    elif file_size_bytes < 1024 * 1024:
        return f"{file_size_bytes / 1024:.2f} KB"
    else:
        return f"{file_size_bytes / (1024 * 1024):.2f} MB"


def extract_structured_prompts(prompt_data: Dict[str, Any], workflow_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract structured prompt information from ComfyUI data.
    Returns positive prompt, negative prompt, and generation parameters.
    """
    structured_prompts = {
        "positive": None,
        "negative": None,
        "parameters": {},
        "extraction_method": "unknown"
    }
    
    # Try to extract from workflow first (more reliable)
    if workflow_data:
        extracted = _extract_prompts_from_workflow(workflow_data)
        if extracted["positive"]:
            structured_prompts["positive"] = extracted["positive"]
        if extracted["negative"]:
            structured_prompts["negative"] = extracted["negative"]
        if extracted["positive"] or extracted["negative"]:
            structured_prompts["extraction_method"] = "workflow"
    
    # Fallback to prompt data for missing prompts
    if prompt_data:
        extracted = _extract_prompts_from_workflow(prompt_data)
        
        # Fill in missing positive prompt
        if not structured_prompts["positive"] and extracted["positive"]:
            structured_prompts["positive"] = extracted["positive"]
            structured_prompts["extraction_method"] = "prompt" if structured_prompts["extraction_method"] == "unknown" else "mixed"
        
        # Fill in missing negative prompt  
        if not structured_prompts["negative"] and extracted["negative"]:
            structured_prompts["negative"] = extracted["negative"]
            structured_prompts["extraction_method"] = "prompt" if structured_prompts["extraction_method"] == "unknown" else "mixed"
    
    # Extract other parameters
    if prompt_data:
        structured_prompts["parameters"] = extract_generation_parameters(prompt_data)
    
    return structured_prompts


def _extract_prompts_from_workflow(workflow_data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract positive and negative prompts from workflow data."""
    result = {"positive": None, "negative": None}
    
    if not workflow_data:
        return result
        
    # Strategy 1: Try node-based extraction for workflow with nodes array
    if "nodes" in workflow_data and isinstance(workflow_data["nodes"], list):
        result.update(_extract_from_nodes_array(workflow_data["nodes"]))
    
    # Strategy 2: Try basic workflow structure (key-value pairs)
    elif isinstance(workflow_data, dict):
        result.update(_extract_from_basic_workflow(workflow_data))
        
    return result


def _extract_from_nodes_array(nodes: List[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    """Extract prompts from nodes array (advanced workflows)."""
    result = {"positive": None, "negative": None}
    
    for node in nodes:
        if not isinstance(node, dict):
            continue
            
        node_type = node.get("type", "")
        title = node.get("title", "").lower()
        widgets_values = node.get("widgets_values", [])
        
        # Check by title first (most reliable)
        if "positive" in title and "prompt" in title:
            if widgets_values and result["positive"] is None:
                result["positive"] = str(widgets_values[0]) if widgets_values[0] else None
                
        elif "negative" in title and "prompt" in title:
            if widgets_values and result["negative"] is None:
                result["negative"] = str(widgets_values[0]) if widgets_values[0] else None
        
        # Check by node type
        prompt_node_types = ["CLIPTextEncode", "CR Prompt Text", "ImpactWildcardProcessor", 
                            "Textbox", "easy showAnything", "StringFunction", "Text Multiline"]
        if node_type in prompt_node_types:
            if widgets_values:
                text_content = str(widgets_values[0]) if widgets_values[0] else ""
                
                # Try to detect positive prompt
                if result["positive"] is None and _is_positive_prompt(text_content):
                    result["positive"] = text_content
                
                # Try to detect negative prompt  
                elif result["negative"] is None and _is_negative_prompt(text_content):
                    result["negative"] = text_content
    
    return result


def _extract_from_basic_workflow(workflow: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract prompts from basic workflow structure."""
    result = {"positive": None, "negative": None}
    
    # Common workflow node IDs for prompts
    positive_ids = ['2', '6', '7']
    negative_ids = ['3', '7', '8']
    
    for node_id, node_data in workflow.items():
        if not isinstance(node_data, dict):
            continue
            
        inputs = node_data.get("inputs", {})
        
        # Check for common positive prompt locations
        if node_id in positive_ids:
            if "text" in inputs and result["positive"] is None:
                result["positive"] = str(inputs["text"])
            elif "prompt" in inputs and result["positive"] is None:
                result["positive"] = str(inputs["prompt"])
                
        # Check for common negative prompt locations
        elif node_id in negative_ids:
            if "text" in inputs and result["negative"] is None:
                result["negative"] = str(inputs["text"])
            elif "prompt" in inputs and result["negative"] is None:
                result["negative"] = str(inputs["prompt"])
    
    return result


def _is_positive_prompt(text: str) -> bool:
    """Heuristic to determine if text is likely a positive prompt."""
    if not text:
        return False
        
    text_lower = text.lower()
    
    # Strong negative indicators that definitely make it NOT positive
    strong_negative_indicators = [
        "worst quality", "low quality", "bad", "ugly", "blurry", 
        "distorted", "deformed", "amateur", "poor quality"
    ]
    if any(phrase in text_lower for phrase in strong_negative_indicators):
        return False
        
    # Strong positive indicators
    strong_positive_indicators = [
        "masterpiece", "best quality", "high quality", "detailed", 
        "professional", "photorealistic", "stunning", "beautiful"
    ]
    if any(phrase in text_lower for phrase in strong_positive_indicators):
        return True
    
    # Positive prompts are usually longer and more descriptive
    return len(text) > 50


def _is_negative_prompt(text: str) -> bool:
    """Heuristic to determine if text is likely a negative prompt."""
    if not text:
        return False
        
    text_lower = text.lower()
    
    # Strong negative indicators
    strong_negative_indicators = [
        "worst quality", "low quality", "bad", "ugly", "blurry", 
        "distorted", "deformed", "amateur", "poor quality"
    ]
    if any(phrase in text_lower for phrase in strong_negative_indicators):
        return True
        
    # If text is short and contains negative words, likely negative
    if len(text) < 100 and any(word in text_lower for word in ["bad", "worst", "low", "poor"]):
        return True
        
    return False


def extract_generation_parameters(prompt_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract generation parameters from prompt data."""
    parameters = {}
    
    if not isinstance(prompt_data, dict):
        return parameters
    
    # Common parameter locations in ComfyUI workflows
    for node_id, node_data in prompt_data.items():
        if not isinstance(node_data, dict):
            continue
            
        inputs = node_data.get("inputs", {})
        class_type = node_data.get("class_type", "")
        
        # Extract common parameters
        if class_type == "KSampler":
            parameters.update({
                "steps": inputs.get("steps"),
                "cfg_scale": inputs.get("cfg"),
                "sampler": inputs.get("sampler_name"),
                "scheduler": inputs.get("scheduler"),
                "seed": inputs.get("seed")
            })
        elif class_type == "CheckpointLoaderSimple":
            parameters["model"] = inputs.get("ckpt_name")
        elif class_type == "LoraLoader":
            if "loras" not in parameters:
                parameters["loras"] = []
            parameters["loras"].append({
                "name": inputs.get("lora_name"),
                "model_strength": inputs.get("strength_model"),
                "clip_strength": inputs.get("strength_clip")
            })
    
    # Clean up None values
    return {k: v for k, v in parameters.items() if v is not None}


def extract_image_metadata(image_path: str) -> Dict[str, Any]:
    """
    Extract all metadata from an image file.
    Returns a dictionary with fileinfo, workflow, prompt, structured_prompts, and EXIF data.
    """
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"File not found: {image_path}")

    img = Image.open(image_path)
    metadata = {}
    prompt = {}
    workflow = {}

    # File info - extract basic image metadata
    # Based on: https://thepythoncode.com/article/extracting-image-metadata-in-python
    image_format = img.format or "Unknown"
    mime_type = f"image/{image_format.lower()}" if image_format != "Unknown" else "image/png"
    
    metadata["fileinfo"] = {
        "filename": os.path.basename(image_path),
        "filepath": image_path,
        "width": img.width,
        "height": img.height,
        "format": image_format,
        "mimetype": mime_type,
        "image_size": img.size,
        "image_height": img.height,
        "image_width": img.width,
        "image_format": image_format,
        "image_mode": img.mode,
        "image_is_animated": getattr(img, "is_animated", False),
        "frames_in_image": getattr(img, "n_frames", 1),
        "resolution": f"{img.width}x{img.height}",
        "date": str(datetime.fromtimestamp(os.path.getmtime(image_path))),
        "size": get_size(image_path),
    }

    # PNG metadata
    if isinstance(img, PngImageFile):
        metadata_from_img = img.info if hasattr(img, 'info') else {}

        for k, v in metadata_from_img.items():
            # ComfyUI workflow
            if k == "workflow":
                if isinstance(v, str):
                    try:
                        workflow = json.loads(v)
                        metadata["workflow"] = workflow
                    except json.JSONDecodeError:
                        metadata["workflow"] = v
                else:
                    workflow = v
                    metadata["workflow"] = v

            # ComfyUI prompt
            elif k == "prompt":
                if isinstance(v, str):
                    try:
                        prompt = json.loads(v)
                        metadata["prompt"] = prompt
                    except json.JSONDecodeError:
                        metadata["prompt"] = v
                else:
                    prompt = v
                    metadata["prompt"] = v

            # Usgromana NSFW metadata (from PNG text chunks)
            elif k == "UsgromanaNSFW":
                # Convert string "true"/"false" to boolean
                if isinstance(v, str):
                    metadata["usgromana_nsfw"] = v.lower() in ('true', '1', 'yes')
                else:
                    metadata["usgromana_nsfw"] = bool(v)
            elif k == "UsgromanaNSFWLabel":
                metadata["usgromana_nsfw_label"] = str(v) if v is not None else None
            elif k == "UsgromanaNSFWScore":
                try:
                    metadata["usgromana_nsfw_score"] = float(v) if v is not None else None
                except (ValueError, TypeError):
                    metadata["usgromana_nsfw_score"] = None

            # Rating and Tags (standard metadata)
            elif k == "Rating":
                try:
                    metadata["rating"] = int(v) if v else 0
                except (ValueError, TypeError):
                    metadata["rating"] = 0
            elif k == "Tags":
                # Tags can be comma-separated string or JSON array
                if isinstance(v, str):
                    try:
                        # Try to parse as JSON array first
                        parsed = json.loads(v)
                        if isinstance(parsed, list):
                            metadata["tags"] = parsed
                        else:
                            # Fallback to comma-separated string
                            metadata["tags"] = [t.strip() for t in v.split(",") if t.strip()]
                    except (json.JSONDecodeError, TypeError):
                        # Comma-separated string
                        metadata["tags"] = [t.strip() for t in v.split(",") if t.strip()]
                elif isinstance(v, list):
                    metadata["tags"] = v
                else:
                    metadata["tags"] = []
            
            # Other PNG text chunks
            else:
                if isinstance(v, str):
                    try:
                        metadata[str(k)] = json.loads(v)
                    except (json.JSONDecodeError, TypeError):
                        metadata[str(k)] = v
                else:
                    metadata[str(k)] = v

    # Enhanced prompt processing
    if prompt or workflow:
        try:
            structured_prompts = extract_structured_prompts(prompt, workflow)
            metadata["structured_prompts"] = structured_prompts
        except Exception as e:
            print(f"[Usgromana-Gallery] Error extracting structured prompts: {e}")
            metadata["structured_prompts"] = {"positive": None, "negative": None, "parameters": {}}

    # JPEG EXIF data
    # Based on: https://thepythoncode.com/article/extracting-image-metadata-in-python
    if isinstance(img, JpegImageFile):
        try:
            exif = img.getexif()
            exif_data = {}

            # Iterate over all EXIF data fields
            for tag_id in exif:
                # Get the tag name, instead of human unreadable tag id
                tag = TAGS.get(tag_id, tag_id)
                data = exif.get(tag_id)
                
                # Decode bytes if necessary
                if isinstance(data, bytes):
                    try:
                        data = data.decode()
                    except (UnicodeDecodeError, AttributeError):
                        # If decoding fails, keep as string representation
                        data = str(data)
                
                if data is not None:
                    exif_data[str(tag)] = data

            # GPS and other IFD data
            for ifd_id in IFD:
                try:
                    if ifd_id == IFD.GPSInfo:
                        resolve = GPSTAGS
                    else:
                        resolve = TAGS

                    ifd = exif.get_ifd(ifd_id)
                    ifd_name = str(ifd_id.name)
                    exif_data[ifd_name] = {}

                    for k, v in ifd.items():
                        tag = resolve.get(k, k)
                        # Decode bytes if necessary
                        if isinstance(v, bytes):
                            try:
                                v = v.decode()
                            except (UnicodeDecodeError, AttributeError):
                                v = str(v)
                        try:
                            exif_data[ifd_name][str(tag)] = v
                        except Exception:
                            exif_data[ifd_name][str(tag)] = "Error decoding value"
                except KeyError:
                    pass

            if exif_data:
                metadata["exif"] = exif_data
        except Exception as e:
            print(f"[Usgromana-Gallery] Error extracting EXIF data: {e}")

    img.close()
    return metadata

