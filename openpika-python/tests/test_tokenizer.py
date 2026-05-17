"""Unit tests for the Python entrypoint helpers."""

from openpika.entrypoint import _build_history, _extract_text


def test_extract_text_string():
    assert _extract_text("hello") == "hello"


def test_extract_text_blocks():
    blocks = [{"type": "text", "text": "foo"}, {"type": "text", "text": "bar"}]
    assert _extract_text(blocks) == "foo\nbar"


def test_build_history_roles():
    messages = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    history = _build_history(messages)
    assert len(history) == 2
