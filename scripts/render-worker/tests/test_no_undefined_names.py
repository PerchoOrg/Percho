"""No function in the worker may read a name that does not exist.

On 2026-08-21 `process_plan_job` used `drop_reasons` while the line that
defines it never landed — a string-replace anchor that did not match, and an
assertion loose enough to pass anyway. Python binds names at RUN time, so the
file imported fine, `ast.parse` was happy, and the break only surfaced when a
real listing hit that branch: 15 tours failed with `NameError` before anyone
knew.

Nothing else guards this. `pnpm typecheck` does not cover `scripts/`, and the
Python here has no type checker in CI. This is the cheapest check that would
have caught it, and it needs no dependency.

It is deliberately narrow — a name Loaded inside a function that is neither
local, nor module-level, nor a builtin. That is the NameError case and nothing
else; scope subtleties (comprehensions, walrus, globals declared elsewhere) are
handled by collecting generously rather than by modelling Python's scoping.
"""

import ast
import builtins
from pathlib import Path

import pytest

WORKER_DIR = Path(__file__).resolve().parents[1]
MODULES = sorted(p for p in WORKER_DIR.glob("*.py") if p.name != "__init__.py")


def module_level_names(tree: ast.Module) -> set[str]:
    """Everything reachable from inside a function without being local."""
    names = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                names.add((a.asname or a.name).split(".")[0])
        elif isinstance(node, ast.Global):
            names.update(node.names)
    return names


def collect_args(args: ast.arguments, into: set[str]) -> None:
    for a in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
        into.add(a.arg)
    if args.vararg:
        into.add(args.vararg.arg)
    if args.kwarg:
        into.add(args.kwarg.arg)


def bound_in(fn: ast.AST) -> set[str]:
    """Names a function binds: params, assignments, imports, handlers,
    comprehensions, `with ... as`, and nested lambda parameters.

    The last two were missing on the first pass and produced four false
    positives — a checker that cries wolf gets switched off, so the bar for
    this one is zero noise on a clean tree.
    """
    bound: set[str] = set()
    args = getattr(fn, "args", None)
    if args is not None:
        collect_args(args, bound)
    for node in ast.walk(fn):
        if isinstance(node, ast.Lambda):
            collect_args(node.args, bound)
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            for sub in ast.walk(node.optional_vars):
                if isinstance(sub, ast.Name):
                    bound.add(sub.id)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            bound.add(node.name)
            # A nested def's PARAMETERS are visible to `ast.walk` from out here
            # but bound only inside it. Collecting them generously is right:
            # this checker is looking for names that exist NOWHERE, and being
            # imprecise about which scope binds a name cannot create one.
            collect_args(node.args, bound)
        elif isinstance(node, ast.ClassDef):
            bound.add(node.name)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bound.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                bound.add((a.asname or a.name).split(".")[0])
    return bound


@pytest.mark.parametrize("path", MODULES, ids=lambda p: p.name)
def test_no_function_reads_an_undefined_name(path: Path):
    tree = ast.parse(path.read_text())
    top = module_level_names(tree)
    problems: list[str] = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        local = bound_in(fn)
        for node in ast.walk(fn):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                if node.id not in local and node.id not in top:
                    problems.append(f"{path.name}:{node.lineno} {fn.name}() reads '{node.id}'")
    assert not problems, "undefined name(s):\n  " + "\n  ".join(sorted(set(problems)))
