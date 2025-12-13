# ComfyUI-Usgromana-Gallery/backend/metadata_writer.py
"""
Metadata writing to ComfyUI images.
Writes metadata back to PNG text chunks and EXIF data.
"""

import os
import json
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional
from PIL import Image
from PIL.PngImagePlugin import PngImageFile
from PIL.JpegImagePlugin import JpegImageFile


def create_xmp_metadata(rating: Optional[int] = None, title: Optional[str] = None, 
                        tags: Optional[list] = None) -> str:
    """
    Create XMP metadata XML for Windows Properties compatibility.
    Windows reads Rating, Title, and Tags from XMP metadata.
    Returns XMP packet as string.
    """
    # XMP namespace URIs
    NS_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    NS_XMP = 'http://ns.adobe.com/xap/1.0/'
    NS_DC = 'http://purl.org/dc/elements/1.1/'
    
    # Create root element
    xmpmeta = ET.Element('x:xmpmeta')
    xmpmeta.set('xmlns:x', 'adobe:ns:meta/')
    xmpmeta.set('x:xmptk', 'Adobe XMP Core')
    
    rdf_rdf = ET.SubElement(xmpmeta, 'rdf:RDF')
    rdf_rdf.set('xmlns:rdf', NS_RDF)
    rdf_rdf.set('xmlns:xmp', NS_XMP)
    rdf_rdf.set('xmlns:dc', NS_DC)
    
    rdf_desc = ET.SubElement(rdf_rdf, 'rdf:Description')
    rdf_desc.set('rdf:about', '')
    
    # Add Rating (xmp:Rating)
    if rating is not None:
        rdf_desc.set('xmp:Rating', str(rating))
    else:
        rdf_desc.set('xmp:Rating', '0')
    
    # Add Title (dc:title)
    if title:
        dc_title = ET.SubElement(rdf_desc, 'dc:title')
        rdf_alt = ET.SubElement(dc_title, 'rdf:Alt')
        rdf_li = ET.SubElement(rdf_alt, 'rdf:li')
        rdf_li.set('xml:lang', 'x-default')
        rdf_li.text = title
    
    # Add Tags (dc:subject)
    if tags and len(tags) > 0:
        dc_subject = ET.SubElement(rdf_desc, 'dc:subject')
        rdf_bag = ET.SubElement(dc_subject, 'rdf:Bag')
        for tag in tags:
            if tag:
                rdf_li = ET.SubElement(rdf_bag, 'rdf:li')
                rdf_li.text = str(tag)
    
    # Convert to string
    xml_str = ET.tostring(xmpmeta, encoding='unicode', method='xml')
    # Add XMP packet wrapper (required for XMP format)
    xmp_packet = f'<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n{xml_str}\n<?xpacket end="w"?>'
    return xmp_packet


def update_workflow_in_prompt(prompt_data: Dict[str, Any], workflow_data: Dict[str, Any], 
                              field_updates: Dict[str, Any]) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Update workflow or prompt data with new field values.
    Returns updated (prompt_data, workflow_data).
    """
    updated_prompt = prompt_data.copy() if prompt_data else {}
    updated_workflow = workflow_data.copy() if workflow_data else {}
    
    # Map our metadata fields to workflow/prompt locations
    # This is a simplified approach - in practice, you'd need to know the node structure
    # For now, we'll update common locations
    
    # Update KSampler parameters
    if any(k in field_updates for k in ['steps', 'cfg_scale', 'seed', 'sampler', 'scheduler']):
        for node_id, node_data in updated_prompt.items():
            if isinstance(node_data, dict) and node_data.get("class_type") == "KSampler":
                inputs = node_data.get("inputs", {})
                if "steps" in field_updates:
                    inputs["steps"] = field_updates["steps"]
                if "cfg_scale" in field_updates:
                    inputs["cfg"] = field_updates["cfg_scale"]
                if "seed" in field_updates:
                    inputs["seed"] = field_updates["seed"]
                if "sampler" in field_updates:
                    inputs["sampler_name"] = field_updates["sampler"]
                if "scheduler" in field_updates:
                    inputs["scheduler"] = field_updates["scheduler"]
                node_data["inputs"] = inputs
    
    # Update CheckpointLoaderSimple (model)
    if "model" in field_updates:
        for node_id, node_data in updated_prompt.items():
            if isinstance(node_data, dict) and node_data.get("class_type") == "CheckpointLoaderSimple":
                inputs = node_data.get("inputs", {})
                inputs["ckpt_name"] = field_updates["model"]
                node_data["inputs"] = inputs
    
    return updated_prompt, updated_workflow


def write_metadata_to_image(image_path: str, metadata_updates: Dict[str, Any], 
                           preserve_existing: bool = True) -> bool:
    """
    Write metadata to an image file.
    
    Args:
        image_path: Path to the image file
        metadata_updates: Dictionary of metadata fields to update
        preserve_existing: If True, preserve existing metadata and only update specified fields
    
    Returns:
        True if successful, False otherwise
    """
    if not os.path.isfile(image_path):
        return False
    
    try:
        img = Image.open(image_path)
        original_info = img.info.copy() if hasattr(img, 'info') and img.info else {}
        
        # Prepare new metadata
        new_info = original_info.copy() if preserve_existing else {}
        
        # Always preserve rating and tags from original if not being updated
        if preserve_existing:
            if "rating" not in metadata_updates and "Rating" in original_info:
                # Keep existing rating
                pass  # Already copied in new_info
            if "tags" not in metadata_updates and "Tags" in original_info:
                # Keep existing tags
                pass  # Already copied in new_info
        
        # Handle PNG files
        if isinstance(img, PngImageFile):
            # For PNG, we can write text chunks directly
            # Update workflow if we have workflow-related changes
            if "workflow_data" in metadata_updates:
                workflow_data = metadata_updates["workflow_data"]
                if isinstance(workflow_data, dict):
                    new_info["workflow"] = json.dumps(workflow_data, ensure_ascii=False)
                else:
                    new_info["workflow"] = workflow_data
            
            # Update prompt if we have prompt-related changes
            if "prompt_data" in metadata_updates:
                prompt_data = metadata_updates["prompt_data"]
                if isinstance(prompt_data, dict):
                    new_info["prompt"] = json.dumps(prompt_data, ensure_ascii=False)
                else:
                    new_info["prompt"] = prompt_data
            
            # For structured fields, we need to update the workflow/prompt JSON
            # This is complex, so for now we'll store them as separate text chunks
            # and update the main workflow/prompt if possible
            structured_fields = ['steps', 'cfg_scale', 'seed', 'sampler', 'scheduler', 'model', 
                               'positive_prompt', 'negative_prompt']
            
            if any(k in metadata_updates for k in structured_fields):
                # Try to update existing workflow/prompt
                existing_workflow = None
                existing_prompt = None
                
                if "workflow" in original_info:
                    try:
                        if isinstance(original_info["workflow"], str):
                            existing_workflow = json.loads(original_info["workflow"])
                        else:
                            existing_workflow = original_info["workflow"]
                    except (json.JSONDecodeError, TypeError):
                        pass
                
                if "prompt" in original_info:
                    try:
                        if isinstance(original_info["prompt"], str):
                            existing_prompt = json.loads(original_info["prompt"])
                        else:
                            existing_prompt = original_info["prompt"]
                    except (json.JSONDecodeError, TypeError):
                        pass
                
                # Update workflow/prompt with new values
                updated_prompt, updated_workflow = update_workflow_in_prompt(
                    existing_prompt or {}, 
                    existing_workflow or {},
                    metadata_updates
                )
                
                if updated_workflow:
                    new_info["workflow"] = json.dumps(updated_workflow, ensure_ascii=False)
                if updated_prompt:
                    new_info["prompt"] = json.dumps(updated_prompt, ensure_ascii=False)
            
            # Store rating, title (display_name), and tags for Windows Properties compatibility
            # We'll write both as simple text chunks AND as XMP metadata
            rating_value = None
            title_value = None
            tags_value = None
            
            # Get values from updates or preserve existing
            if "rating" in metadata_updates:
                rating_value = metadata_updates["rating"]
            elif "Rating" in original_info:
                try:
                    rating_value = int(original_info["Rating"])
                except (ValueError, TypeError):
                    rating_value = None
            
            if "display_name" in metadata_updates:
                title_value = metadata_updates["display_name"]
            elif "Title" in original_info:
                title_value = original_info["Title"]
            
            if "tags" in metadata_updates:
                tags_value = metadata_updates["tags"]
                if not isinstance(tags_value, list):
                    if isinstance(tags_value, str):
                        tags_value = [t.strip() for t in tags_value.split(",") if t.strip()]
                    else:
                        tags_value = []
            elif "Tags" in original_info:
                tags_str = original_info["Tags"]
                if isinstance(tags_str, str):
                    tags_value = [t.strip() for t in tags_str.split(",") if t.strip()]
                else:
                    tags_value = []
            
            # Write as simple text chunks (for our own use)
            if rating_value is not None:
                new_info["Rating"] = str(rating_value)
            if title_value:
                new_info["Title"] = str(title_value)
            if tags_value:
                new_info["Tags"] = ", ".join(str(t) for t in tags_value if t)
            
            # Write XMP metadata for Windows Properties compatibility
            # Windows reads XMP from PNG iTXt chunk with keyword "XML:com.adobe.xmp"
            # Also write standard text chunks that Windows may recognize
            try:
                xmp_data = create_xmp_metadata(
                    rating=rating_value,
                    title=title_value,
                    tags=tags_value if tags_value else None
                )
                # XMP is stored in PNG as iTXt chunk with keyword "XML:com.adobe.xmp"
                # Note: PIL's save() may not properly handle iTXt chunks, but we'll try
                # Windows also reads from standard tEXt chunks
                new_info["XML:com.adobe.xmp"] = xmp_data
                
                # Also write standard text chunks that Windows Properties may read
                # Windows sometimes reads "Keywords" for tags
                if tags_value:
                    new_info["Keywords"] = ", ".join(str(t) for t in tags_value if t)
            except Exception as e:
                print(f"[Usgromana-Gallery] Error creating XMP metadata: {e}")
                import traceback
                traceback.print_exc()
            
            # Store other metadata as text chunks
            for key, value in metadata_updates.items():
                if key not in ['workflow_data', 'prompt_data', 'rating', 'tags'] and key not in structured_fields:
                    if isinstance(value, (dict, list)):
                        new_info[key] = json.dumps(value, ensure_ascii=False)
                    else:
                        new_info[key] = str(value)
            
            # Save the image with new metadata
            # For PNG, PIL's save() method accepts text chunks as keyword arguments
            # We need to ensure we preserve the image data
            # The safest way is to copy the image and save with new metadata
            
            # Get image mode and convert if necessary (to ensure compatibility)
            if img.mode not in ('RGB', 'RGBA', 'L', 'LA', 'P'):
                # Convert to RGBA for maximum compatibility
                if img.mode == 'P' and 'transparency' in img.info:
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGB')
            
            # Save with new metadata using PngImagePlugin.PngInfo for proper chunk handling
            from PIL.PngImagePlugin import PngInfo
            
            pnginfo = PngInfo()
            
            # Add all text chunks
            for key, value in new_info.items():
                # Only include string values for text chunks
                if isinstance(value, str):
                    # For XMP, we need to write as iTXt chunk for Windows compatibility
                    # PIL's PngInfo.add_text() writes tEXt chunks, but we'll try it
                    # Windows Properties may read XMP from tEXt chunks in some cases
                    if key == "XML:com.adobe.xmp":
                        # Try to write XMP - Windows might read it from tEXt chunk
                        pnginfo.add_text(key, value)
                        print(f"[Usgromana-Gallery] Writing XMP metadata to '{os.path.basename(image_path)}'")
                    else:
                        pnginfo.add_text(key, value)
                elif isinstance(value, (dict, list)):
                    # Convert complex types to JSON strings
                    pnginfo.add_text(key, json.dumps(value, ensure_ascii=False))
                else:
                    # Convert other types to strings
                    pnginfo.add_text(key, str(value))
            
            # Log what we're writing
            if rating_value is not None or title_value or tags_value:
                print(f"[Usgromana-Gallery] Writing metadata to image: rating={rating_value}, title={title_value}, tags={tags_value}")
            
            # Save the image with updated metadata
            img.save(image_path, format="PNG", pnginfo=pnginfo)
            img.close()
            return True
        
        # Handle JPEG files (EXIF)
        elif isinstance(img, JpegImageFile):
            # For JPEG, we can use PIL's save with exif parameter
            # However, PIL has limited EXIF writing support
            # We'll use a workaround: save rating and tags in UserComment or as custom tags
            
            # Get existing EXIF or create new
            try:
                exif_dict = img.getexif()
            except:
                exif_dict = {}
            
            # Store rating and tags in EXIF UserComment (tag 37510)
            # Format: JSON string with rating and tags
            user_data = {}
            if "rating" in metadata_updates:
                user_data["rating"] = metadata_updates["rating"]
            if "tags" in metadata_updates:
                tags_value = metadata_updates["tags"]
                if isinstance(tags_value, list):
                    user_data["tags"] = tags_value
                else:
                    user_data["tags"] = str(tags_value).split(", ") if tags_value else []
            
            if user_data:
                try:
                    # Try to use UserComment (tag 37510) - this is a standard EXIF tag
                    from PIL.ExifTags import TAGS
                    # UserComment is tag 37510
                    user_comment = json.dumps(user_data, ensure_ascii=False)
                    # Note: PIL's EXIF writing is limited, so we'll save as PNG text chunks
                    # For JPEG, we'll add a note that EXIF writing requires piexif library
                    # For now, we'll save the image and add metadata as a comment in the file
                    # This is a limitation - full EXIF writing requires piexif
                    print(f"[Usgromana-Gallery] Note: JPEG EXIF writing for rating/tags requires piexif library. Saving to PNG text chunks instead.")
                except Exception as e:
                    print(f"[Usgromana-Gallery] Error preparing EXIF data: {e}")
            
            img.close()
            # For now, return False for JPEG - full EXIF writing requires piexif library
            # The metadata is still saved to JSON file
            return False
        
        else:
            img.close()
            return False
            
    except Exception as e:
        print(f"[Usgromana-Gallery] Error writing metadata to image '{image_path}': {e}")
        import traceback
        traceback.print_exc()
        return False


def write_metadata_field_to_image(image_path: str, field_name: str, field_value: Any) -> bool:
    """
    Write a single metadata field to an image file.
    Convenience wrapper around write_metadata_to_image.
    """
    return write_metadata_to_image(image_path, {field_name: field_value})

