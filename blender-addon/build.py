"""Build an installable Blender add-on ZIP from this checkout."""
import ast
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
source = ROOT / 'render_to_websocket'
module = ast.parse((source / '__init__.py').read_text(encoding='utf-8'))
info = next(ast.literal_eval(node.value) for node in module.body
            if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'bl_info' for target in node.targets))
version = '.'.join(map(str, info['version']))
output = ROOT / f'render_to_websocket-{version}.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts and file.suffix not in {'.pyc', '.pyd'}:
            archive.write(file, file.relative_to(ROOT).as_posix())
print(output)
