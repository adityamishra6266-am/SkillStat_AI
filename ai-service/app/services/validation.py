# ai-service/app/services/validation.py
# Every LLM-produced question set is validated here BEFORE it is returned to
# the backend. Anything malformed is rejected as a whole so callers can fall
# back safely (extractive generator / curated bank) instead of storing a
# broken quiz.

from typing import Any, Dict, List, Optional


def _clean(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def validate_questions(raw: Any, expected_count: Optional[int] = None) -> Optional[List[Dict]]:
    """Returns a cleaned list of {question, options, correctAnswer, explanation}
    or None if ANY question is invalid.

    Checks: list shape, expected count, non-empty question text, exactly four
    non-empty distinct string options, integer correctAnswer in 0..3 and a
    non-empty explanation."""
    if not isinstance(raw, list) or not raw:
        return None
    if expected_count is not None and len(raw) != expected_count:
        return None

    cleaned: List[Dict] = []
    for item in raw:
        if not isinstance(item, dict):
            return None
        question = _clean(item.get("question"))
        explanation = _clean(item.get("explanation"))
        options = item.get("options")
        correct = item.get("correctAnswer")

        if not question or not explanation:
            return None
        if not isinstance(options, list) or len(options) != 4:
            return None
        options = [_clean(o) for o in options]
        if any(not o for o in options):
            return None
        if len({o.lower() for o in options}) != 4:
            return None
        # bool is a subclass of int in Python — reject it explicitly
        if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct <= 3:
            return None

        cleaned.append(
            {
                "question": question[:1000],
                "options": [o[:500] for o in options],
                "correctAnswer": correct,
                "explanation": explanation[:2000],
            }
        )
    return cleaned
