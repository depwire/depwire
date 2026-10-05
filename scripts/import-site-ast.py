"""Independent Python AST census for the import-site CI gate."""

import ast
import json
import sys
from pathlib import Path


def sites(path: str) -> list[dict[str, object]]:
    source = Path(path).read_text(encoding="utf-8")
    result = []
    for node in ast.walk(ast.parse(source, filename=path)):
        if isinstance(node, ast.Import):
            result.append({"line": node.lineno, "kind": "import",
                           "specifier": ",".join(alias.name for alias in node.names)})
        elif isinstance(node, ast.ImportFrom):
            result.append({"line": node.lineno, "kind": "from-import",
                           "specifier": "." * node.level + (node.module or "")})
    return sorted(result, key=lambda site: (site["line"], site["kind"]))


if __name__ == "__main__":
    paths = json.load(sys.stdin)
    json.dump({path: sites(path) for path in paths}, sys.stdout)
