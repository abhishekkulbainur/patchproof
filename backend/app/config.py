"""Runtime configuration. Secrets are read from the environment (or backend/.env) only."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEMO_TARGET_DIR = BACKEND_DIR / "demo_target"


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines). Existing env vars win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BACKEND_DIR / ".env")


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("PATCHPROOF_DATA_DIR", BACKEND_DIR / "var")))
    openai_api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", "").strip())
    openai_model: str = field(default_factory=lambda: os.environ.get("OPENAI_MODEL", "").strip())
    openai_base_url: str = field(default_factory=lambda: os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"))
    runner_timeout_s: float = 15.0
    ai_timeout_s: float = 30.0

    @property
    def db_path(self) -> Path:
        return self.data_dir / "patchproof.db"

    @property
    def workspace_dir(self) -> Path:
        return self.data_dir / "workspace"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.openai_api_key and self.openai_model)


settings = Settings()

ORIGINAL_TARGET = DEMO_TARGET_DIR / "original" / "document_portal.py"
HARNESS = DEMO_TARGET_DIR / "harness.py"
DEMO_PROJECT_ID = "prj-docportal"
TARGET_RELPATH = "document_portal.py"
