"""Prepare verified static packages for local preview and read-only publication."""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import hashlib
import json

base = Path(__file__).resolve().parents[1]
root = base / '_site'
root.mkdir(exist_ok=True)
manifest = json.loads((base / 'build-manifest.json').read_text())
def verified(item):
    data = (base / item['file']).read_bytes()
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError('Package checksum mismatch: ' + item['file'])
    return data
for item in manifest['archives']:
    data = b''.join(verified(part) for part in item['parts']) if 'parts' in item else verified(item)
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError('Archive checksum mismatch: ' + item['file'])
    with ZipFile(BytesIO(data)) as z:
        for name in z.namelist():
            if not (root / name).resolve().is_relative_to(root.resolve()):
                raise ValueError('Invalid archive path')
        z.extractall(root)
print('Prepared', root)
