import json

path = r'\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links\knome\uploads\community_files\community_208_files.json'
with open(path, 'r', encoding='utf-8') as f:
    items = json.load(f)

print(f"Total items: {len(items)}")
for it in items:
    print("Keys:", list(it.keys())[:8])
    file_id = it.get('Id') or it.get('id')
    name = it.get('Name') or it.get('name')
    cat = it.get('Category') or it.get('category')
    size = it.get('Size') or it.get('size')
    url = it.get('Url') or it.get('url') or ''
    print(f"Id={file_id}, Name={name}, Category={cat}, Size={size}, url_len={len(url)}, url_prefix={url[:50]}")
