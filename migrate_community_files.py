import json
import base64
import os
import re

network_dir = r"\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links\knome\uploads"
local_dir = r"D:\Knome_Complete_Project\Knome main\Backend\Knome.API\wwwroot\uploads"

json_path = os.path.join(network_dir, "community_files", "community_208_files.json")
if not os.path.exists(json_path):
    print("File not found on network share!")
    exit(1)

with open(json_path, "r", encoding="utf-8") as f:
    items = json.load(f)

print(f"Loaded {len(items)} items from {json_path}")

for item in items:
    url = item.get("Url") or item.get("url") or ""
    name = item.get("Name") or item.get("name") or "file"
    ext = (item.get("Extension") or item.get("extension") or "").lower()
    
    # Fix category for audio
    if ext in ["mp3", "wav", "aac", "ogg", "flac", "m4a"] or "audio" in (item.get("Category") or "").lower():
        item["Category"] = "Audio"
        item["category"] = "Audio"
        if "Extension" in item: item["Extension"] = ext or "mp3"
        if "extension" in item: item["extension"] = ext or "mp3"
    
    # Check if url is large base64
    if url.startswith("data:") and ";base64," in url:
        print(f"Extracting base64 for {name} ({len(url)} bytes)...")
        header, b64_data = url.split(";base64,", 1)
        safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)
        if not safe_name.endswith(f".{ext}") and ext:
            safe_name += f".{ext}"
        
        file_bytes = base64.b64decode(b64_data)
        
        # Save to network media folder
        net_media_dir = os.path.join(network_dir, "media")
        os.makedirs(net_media_dir, exist_ok=True)
        net_file_path = os.path.join(net_media_dir, safe_name)
        with open(net_file_path, "wb") as mf:
            mf.write(file_bytes)
        print(f"  Saved to network: {net_file_path}")
        
        # Save to local media folder
        loc_media_dir = os.path.join(local_dir, "media")
        os.makedirs(loc_media_dir, exist_ok=True)
        loc_file_path = os.path.join(loc_media_dir, safe_name)
        with open(loc_file_path, "wb") as mf:
            mf.write(file_bytes)
        print(f"  Saved to local: {loc_file_path}")
        
        rel_url = f"/uploads/media/{safe_name}"
        if "Url" in item: item["Url"] = rel_url
        if "url" in item: item["url"] = rel_url

# Standardize all items
cleaned = []
for item in items:
    file_id = str(item.get("Id") or item.get("id"))
    name = item.get("Name") or item.get("name")
    cat = item.get("Category") or item.get("category")
    ext = (item.get("Extension") or item.get("extension") or "").lower()
    if ext in ["mp3", "wav", "aac", "ogg", "flac", "m4a"]:
        cat = "Audio"
    sz = item.get("Size") or item.get("size")
    up_by = item.get("UploadedBy") or item.get("uploadedBy")
    up_uid = item.get("UploadedByUserId") or item.get("uploadedByUserId")
    up_at = item.get("UploadedAt") or item.get("uploadedAt")
    url = item.get("Url") or item.get("url")
    
    cleaned.append({
        "Id": file_id,
        "Name": name,
        "Category": cat,
        "Extension": ext,
        "Size": sz,
        "UploadedBy": up_by,
        "UploadedByUserId": up_uid,
        "UploadedAt": up_at,
        "Url": url,
        "DownloadCount": 0
    })

# Backup old json
backup_path = json_path + ".bak"
if not os.path.exists(backup_path):
    import shutil
    shutil.copyfile(json_path, backup_path)
    print(f"Created backup at {backup_path}")

# Write cleaned json
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(cleaned, f, indent=2)

print(f"Cleaned JSON written! New size: {os.path.getsize(json_path)} bytes")

# Also copy to local wwwroot community_files
local_comm_files_dir = os.path.join(local_dir, "community_files")
os.makedirs(local_comm_files_dir, exist_ok=True)
loc_json_path = os.path.join(local_comm_files_dir, "community_208_files.json")
with open(loc_json_path, "w", encoding="utf-8") as f:
    json.dump(cleaned, f, indent=2)
print(f"Local copy written to {loc_json_path}")
