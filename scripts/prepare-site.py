"""Extract the verified static build for local preview and Pages publication."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json

base = Path(__file__).resolve().parents[1]
root = base / '_site'
root.mkdir(exist_ok=True)
manifest = json.loads((base / 'build-manifest.json').read_text())
for item in manifest['archives']:
    archive = base / item['file']
    if hashlib.sha256(archive.read_bytes()).hexdigest() != item['sha256']:
        raise ValueError('Archive checksum mismatch: ' + item['file'])
    with ZipFile(archive) as z:
        for name in z.namelist():
            if not (root / name).resolve().is_relative_to(root.resolve()):
                raise ValueError('Invalid archive path')
        z.extractall(root)
print('Prepared', root)
