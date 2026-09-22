import pytest


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point every test at its own fresh SQLite file."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
