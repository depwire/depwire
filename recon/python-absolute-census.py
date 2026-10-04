"""Independent, source-AST census of first-party absolute Python imports.

Usage: python3 recon/python-absolute-census.py <repo-root>
Output: one JSON record per candidate module relationship. No Depwire parser calls.
"""
import ast
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
tracked = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '*.py']).decode().split('\0')
tracked = sorted(p for p in tracked if p and (root / p).is_file())
existing = set(tracked)
roots = [Path('.'), Path('src')]


def resolve_module(name):
    sub = Path(*name.split('.'))
    for prefix in roots:
        for path in (prefix / (str(sub) + '.py'), prefix / sub / '__init__.py'):
            if path.as_posix() in existing:
                return path.as_posix()
    return None


def first_party(name):
    top = name.split('.')[0]
    return resolve_module(top) is not None


def guarded(node, type_names, typing_names):
    parent = getattr(node, '_parent', None)
    while parent is not None:
        if isinstance(parent, ast.If):
            test = parent.test
            if isinstance(test, ast.Name) and test.id in type_names:
                return True
            if isinstance(test, ast.Attribute) and test.attr == 'TYPE_CHECKING' and isinstance(test.value, ast.Name) and test.value.id in typing_names:
                return True
        parent = getattr(parent, '_parent', None)
    return False


for source_path in tracked:
    text = (root / source_path).read_text('utf-8', errors='replace')
    try:
        tree = ast.parse(text, filename=source_path)
    except (SyntaxError, ValueError):
        continue
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            child._parent = parent
    typing_names = {'typing'}
    type_names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in ('typing', 'typing_extensions'):
                    typing_names.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module in ('typing', 'typing_extensions'):
            for alias in node.names:
                if alias.name == 'TYPE_CHECKING':
                    type_names.add(alias.asname or alias.name)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                if not first_party(name):
                    continue
                target = resolve_module(name)
                print(json.dumps({'source': source_path, 'line': node.lineno, 'form': 'import', 'specifier': name,
                                  'target': target, 'typeOnly': guarded(node, type_names, typing_names)}))
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            module = node.module
            if not first_party(module):
                continue
            parent_target = resolve_module(module)
            for alias in node.names:
                child_name = module + '.' + alias.name if alias.name != '*' else None
                child_target = resolve_module(child_name) if child_name else None
                target = child_target or parent_target
                print(json.dumps({'source': source_path, 'line': node.lineno,
                                  'form': 'from-module' if child_target else 'from-name',
                                  'specifier': module + ':' + alias.name, 'target': target,
                                  'parentTarget': parent_target, 'typeOnly': guarded(node, type_names, typing_names)}))
