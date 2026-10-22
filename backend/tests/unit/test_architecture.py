"""Architecture rules, checked on the AST of `backend/app` (nothing is imported or executed).

The rules are the guarantees of docs/refactoring-contract.md and the server runtime notes:

- only `app/core/db.py` calls `.commit()` (the unit of work owns the transaction);
- SQL goes through the SQLAlchemy query builder: no `sqlalchemy.text` and no SQL strings, except the
  cases listed in `ALLOWED_SQL` with the reason;
- a folder holds at most 8 `.py` files (`__init__.py` not counted), so a subdomain is split before it
  becomes a dump;
- a module imports another only through the package (`app.modules.<name>`), never a file inside it.

No violation is allowed: the rules hold for the whole `app` package.
"""

import ast
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
APP = BACKEND / "app"
MAX_FILES_PER_FOLDER = 8

#: The only file allowed to call `.commit()`.
COMMIT_OWNER = "app/core/db.py"

#: Files that build SQL outside the query builder, each with the reason. Keep it empty if possible.
ALLOWED_SQL: dict[str, str] = {}

#: A SQL statement at the start of a string literal (uppercase keywords, as the code writes them).
_SQL_START = re.compile(
    r"\s*(SELECT\b.*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|WITH\s+\w+\s+AS\b)",
    re.DOTALL,
)


@dataclass(frozen=True)
class Violation:
    rule: str
    path: str  # relative to backend/, or the folder for the folder rule
    detail: str

    def __str__(self) -> str:
        return f"[{self.rule}] {self.path}: {self.detail}"


def _python_files() -> list[Path]:
    return sorted(p for p in APP.rglob("*.py") if "__pycache__" not in p.parts)


def _folders() -> list[Path]:
    return [APP, *sorted(d for d in APP.rglob("*") if d.is_dir() and "__pycache__" not in d.parts)]


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _rel(path: Path) -> str:
    return path.relative_to(BACKEND).as_posix()


def _walk_calls(tree: ast.AST) -> Iterator[ast.Call]:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            yield node


def _commit_violations() -> Iterator[Violation]:
    for path in _python_files():
        if _rel(path) == COMMIT_OWNER:
            continue
        for call in _walk_calls(_tree(path)):
            if isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
                yield Violation("commit", _rel(path), f"line {call.lineno}: .commit() outside core/db.py")


def _is_sqlalchemy_text(call: ast.Call) -> bool:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id == "text"
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "text"
        and isinstance(func.value, ast.Name)
        and (func.value.id in {"sa", "sqlalchemy"})
    )


def _sql_violations() -> Iterator[Violation]:
    for path in _python_files():
        tree = _tree(path)
        for call in _walk_calls(tree):
            if _is_sqlalchemy_text(call):
                yield Violation("sql", _rel(path), f"line {call.lineno}: sqlalchemy.text() call")
        for node in ast.walk(tree):
            literal = _literal_start(node)
            if literal is not None and _SQL_START.match(literal):
                yield Violation("sql", _rel(path), f"line {node.lineno}: SQL in a string literal")


def _literal_start(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr) and node.values and isinstance(node.values[0], ast.Constant):
        value = node.values[0].value
        return value if isinstance(value, str) else None
    return None


def _folder_violations() -> Iterator[Violation]:
    for folder in _folders():
        count = sum(1 for p in folder.glob("*.py") if p.name != "__init__.py")
        if count > MAX_FILES_PER_FOLDER:
            yield Violation("folder", _rel(folder), f"{count} .py files (max {MAX_FILES_PER_FOLDER})")


def _owner_module(path: Path) -> str | None:
    parts = path.relative_to(APP).parts
    if len(parts) > 2 and parts[0] == "modules":
        return parts[1]
    return None


def _import_targets(node: ast.AST) -> Iterator[str]:
    if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
        yield node.module
    elif isinstance(node, ast.Import):
        for alias in node.names:
            yield alias.name


def _import_violations() -> Iterator[Violation]:
    for path in _python_files():
        owner = _owner_module(path)
        for node in ast.walk(_tree(path)):
            for target in _import_targets(node):
                parts = target.split(".")
                if len(parts) <= 3 or parts[:2] != ["app", "modules"] or parts[2] == owner:
                    continue
                yield Violation(
                    "import",
                    _rel(path),
                    f"line {node.lineno}: imports {target}, not the package app.modules.{parts[2]}",
                )


def _report(rule: str, violations: list[Violation]) -> str:
    return "\n".join(str(v) for v in violations) or f"no {rule} violations"


def test_only_the_unit_of_work_commits():
    violations = list(_commit_violations())
    assert not violations, _report("commit", violations)


def test_sql_is_built_with_the_query_builder():
    violations = [v for v in _sql_violations() if v.path not in ALLOWED_SQL]
    assert not violations, _report("sql", violations)


def test_each_folder_holds_at_most_eight_python_files():
    violations = list(_folder_violations())
    assert not violations, _report("folder", violations)


def test_modules_import_each_other_through_their_package():
    violations = list(_import_violations())
    assert not violations, _report("import", violations)
