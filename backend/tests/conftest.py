import pytest
from fastapi.testclient import TestClient

from app import config


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Fresh database + workspace per test; AI disabled so tests are deterministic."""
    monkeypatch.setattr(config.settings, "data_dir", tmp_path)
    monkeypatch.setattr(config.settings, "openai_api_key", "")
    from app.main import app

    with TestClient(app) as c:
        yield c
