"""Prepare verified static packages for local preview and read-only publication."""
from pathlib import Path
from shutil import copytree
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

def archive_destination(item):
    if 'base_directory' not in item:
        return root
    directory = item['base_directory']
    source = (root / directory['source']).resolve()
    destination = (root / directory['destination']).resolve()
    if source.parent != root or destination.parent != root or source == destination:
        raise ValueError('Invalid base directory')
    copytree(source, destination, dirs_exist_ok=True)
    return destination

for item in manifest['archives']:
    data = b''.join(verified(part) for part in item['parts']) if 'parts' in item else verified(item)
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError('Archive checksum mismatch: ' + item['file'])
    destination = archive_destination(item)
    with ZipFile(BytesIO(data)) as z:
        for name in z.namelist():
            if not (destination / name).resolve().is_relative_to(destination.resolve()):
                raise ValueError('Invalid archive path')
        z.extractall(destination)
print('Prepared', root)
