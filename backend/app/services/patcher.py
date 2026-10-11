"""
Patch proposals for the seeded IDOR finding.

Two sources:
  * "template" -- pre-authored, deterministic demo patch templates (no AI involved).
  * "ai"       -- optional; only when OPENAI_API_KEY and OPENAI_MODEL are set. The model's output
                  is validated and still has to pass the same independent tests.
"""
from __future__ import annotations

import ast
import difflib
import json
from dataclasses import dataclass

import httpx

from ..config import settings
from .scanner import sha256_text

TARGET_FUNCTION = "get_document"

OWNERSHIP_CHECK = '''def get_document(request, user, doc_id):
    doc = DOCUMENTS.get(doc_id)
    # Authorization: only the owner (resolved from the server-side session)
    # may read a document. Missing and not-owned documents get the same 404
    # so that valid IDs cannot be discovered by probing.
    if doc is None or doc["owner_id"] != user["id"]:
        return Response(404, {"error": "Document not found"})
    return Response(200, {"document": doc})
'''

CLIENT_HEADER_CHECK = '''def get_document(request, user, doc_id):
    doc = DOCUMENTS.get(doc_id)
    if doc is None:
        return Response(404, {"error": "Document not found"})
    # Ownership check using the account ID sent by the web client
    if request.headers.get("X-Account-Id") != doc["owner_id"]:
        return Response(403, {"error": "Forbidden"})
    return Response(200, {"document": doc})
'''

TEMPLATES = {
    "ownership-check": {
        "function": OWNERSHIP_CHECK,
        "title": "Enforce server-side ownership check in get_document()",
        "root_cause": "get_document() trusts the document ID from the URL and returns the record without checking "
                      "who owns it. Authentication (who you are) was in place; object-level authorization (what you "
                      "may access) was missing.",
        "explanation": "Compare the document's owner_id with the user resolved from the server-side session before "
                       "returning it. Missing and not-owned documents both return 404, so attackers cannot use the "
                       "response to discover which IDs exist.",
        "minimality": "One function changed; one condition widened. No changes to routing, data model, session "
                      "handling, or the list endpoint, which already filters by owner.",
    },
    "client-header-check": {
        "function": CLIENT_HEADER_CHECK,
        "title": "Ownership check using client-supplied X-Account-Id (deliberately flawed)",
        "root_cause": "Same root cause as the recommended patch.",
        "explanation": "DEMONSTRATION OF A PLAUSIBLE BUT WRONG FIX. It compares owner_id with an identifier the "
                       "client sends in a header. It looks correct in review and blocks a naive ID swap, but an "
                       "attacker controls that header. Use it to show that PatchProof reports Failed when a patch "
                       "does not survive independent testing.",
        "minimality": "Small diff, but it relies on attacker-controlled input for an authorization decision.",
    },
}


class PatchError(Exception):
    pass


@dataclass
class Proposal:
    source: str
    variant: str
    model: str | None
    title: str
    explanation: str
    root_cause: str
    minimality: str
    patched_source: str
    diff: str
    lines_added: int
    lines_removed: int
    original_sha: str
    patched_sha: str


def _function_node(tree: ast.Module, name: str) -> ast.FunctionDef:
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise PatchError(f"Function {name}() not found in target")


def replace_function(source: str, name: str, new_function: str) -> str:
    """Swap one top-level function, then prove nothing else in the module changed."""
    tree = ast.parse(source)
    fn = _function_node(tree, name)
    lines = source.splitlines(keepends=True)
    new_block = new_function.rstrip("\n") + "\n"
    patched = "".join(lines[: fn.lineno - 1]) + new_block + "".join(lines[fn.end_lineno:])

    try:
        new_tree = ast.parse(patched)
    except SyntaxError as exc:
        raise PatchError(f"Patched module does not parse: {exc}") from exc
    _function_node(new_tree, name)
    old_rest = [ast.dump(n) for n in tree.body if not (isinstance(n, ast.FunctionDef) and n.name == name)]
    new_rest = [ast.dump(n) for n in new_tree.body if not (isinstance(n, ast.FunctionDef) and n.name == name)]
    if old_rest != new_rest:
        raise PatchError("Patch modifies code outside the target function; rejected.")
    return patched


def build_proposal(original: str, new_function: str, *, source: str, variant: str, model: str | None,
                   title: str, explanation: str, root_cause: str, minimality: str) -> Proposal:
    patched = replace_function(original, TARGET_FUNCTION, new_function)
    if patched == original:
        raise PatchError("Proposed patch makes no change.")
    diff_lines = list(difflib.unified_diff(original.splitlines(), patched.splitlines(),
                                           "a/document_portal.py", "b/document_portal.py", lineterm="", n=3))
    added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))
    return Proposal(source, variant, model, title, explanation, root_cause, minimality, patched,
                    "\n".join(diff_lines), added, removed, sha256_text(original), sha256_text(patched))


def template_proposal(original: str, variant: str) -> Proposal:
    t = TEMPLATES.get(variant)
    if not t:
        raise PatchError(f"Unknown template variant {variant!r}")
    return build_proposal(original, t["function"], source="template", variant=variant, model=None,
                          title=t["title"], explanation=t["explanation"], root_cause=t["root_cause"],
                          minimality=t["minimality"])


AI_SYSTEM = (
    "You are a secure-code reviewer. You will receive a Python module and a finding. Return ONLY a JSON object "
    "with keys: patched_function (the complete replacement source of the named function, nothing else), "
    "root_cause (<= 60 words), explanation (<= 80 words), minimality (<= 40 words). Make the smallest change "
    "that fixes the issue. Base authorization on the server-side `user` argument, never on request headers."
)


def ai_proposal(original: str, finding: dict) -> Proposal:
    if not settings.ai_enabled:
        raise PatchError("AI provider is not configured (set OPENAI_API_KEY and OPENAI_MODEL on the server).")
    if len(original) > 20_000:
        raise PatchError("Target too large for AI proposal in this prototype.")
    user_msg = (f"Finding: {finding['title']} ({finding['cwe']}). {finding['description']}\n"
                f"Function to patch: {TARGET_FUNCTION}\n\n```python\n{original}\n```")
    try:
        resp = httpx.post(
            f"{settings.openai_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={"model": settings.openai_model, "temperature": 0,
                  "response_format": {"type": "json_object"},
                  "messages": [{"role": "system", "content": AI_SYSTEM}, {"role": "user", "content": user_msg}]},
            timeout=settings.ai_timeout_s,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
    except httpx.HTTPStatusError as exc:
        raise PatchError(f"AI provider returned HTTP {exc.response.status_code}.") from exc
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise PatchError(f"AI provider request failed: {type(exc).__name__}.") from exc

    fn = data.get("patched_function")
    if not isinstance(fn, str) or not fn.strip() or len(fn) > 4000:
        raise PatchError("AI response did not contain a usable patched_function.")
    fn = fn.strip().removeprefix("```python").removeprefix("```").removesuffix("```").strip()
    if not fn.startswith(f"def {TARGET_FUNCTION}("):
        raise PatchError(f"AI response is not a definition of {TARGET_FUNCTION}().")

    def text(key, limit):
        v = data.get(key)
        return v.strip()[:limit] if isinstance(v, str) and v.strip() else "(not provided by model)"

    return build_proposal(original, fn, source="ai", variant="ai", model=settings.openai_model,
                          title="AI-proposed authorization fix for get_document()",
                          explanation=text("explanation", 800), root_cause=text("root_cause", 600),
                          minimality=text("minimality", 400))
