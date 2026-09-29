# ai-service/app/services/competency_classifier.py
# Optional LLM-backed classification of quiz questions into the EXISTING
# competency framework. The backend sends the active competencies (code, name,
# description, category); the model may only answer with one of those codes or
# null. Any code that is not in the supplied list is discarded, so the LLM can
# never invent a competency. Returns None when no LLM is configured or the call
# fails - the backend then falls back to its deterministic keyword matcher.

import json
import os
import re
from typing import Dict, List, Optional

import httpx


def llm_configured() -> bool:
    return bool(os.getenv("LLM_API_KEY", "").strip() and os.getenv("LLM_API_URL", "").strip())


async def classify_questions(
    questions: List[Dict], competencies: List[Dict], topic: str = ""
) -> Optional[List[Dict]]:
    if not llm_configured() or not questions or not competencies:
        return None

    api_key = os.getenv("LLM_API_KEY", "").strip()
    api_url = os.getenv("LLM_API_URL", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()

    allowed = {c["code"] for c in competencies}
    framework = "\n".join(
        f"- {c['code']}: {c['name']} - {c.get('description') or ''} (category: {c.get('category') or 'General'})"
        for c in competencies
    )
    numbered = "\n".join(
        f"{i}. {q.get('question', '')} | options: {' / '.join(q.get('options', []))}"
        for i, q in enumerate(questions)
    )

    prompt = f"""You classify quiz questions into a fixed competency framework for a government
official-statistics training platform.

Competency framework (you may ONLY use these codes):
{framework}

Document topic: {topic or 'unknown'}

Questions:
{numbered}

For EACH question decide which single competency it primarily assesses. If none of the
competencies clearly applies, answer null - do NOT force a match.

Return ONLY valid JSON, nothing else:
{{"classifications": [{{"index": 0, "competencyCode": "CODE or null", "confidence": 0.0, "reason": "one short sentence"}}]}}
confidence is a number between 0 and 1. Provide exactly {len(questions)} entries, one per question index."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                api_url,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": model or "claude-sonnet-4-6",
                    "max_tokens": 1200,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()

        raw_text = "".join(
            b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
        ).strip()
        raw_text = re.sub(r"^```json\s*|\s*```$", "", raw_text)
        parsed = json.loads(raw_text)
        items = parsed.get("classifications")
        if not isinstance(items, list):
            return None

        by_index: Dict[int, Dict] = {}
        for it in items:
            if not isinstance(it, dict) or not isinstance(it.get("index"), int):
                continue
            idx = it["index"]
            if not 0 <= idx < len(questions):
                continue
            code = it.get("competencyCode")
            conf = it.get("confidence")
            if code is not None and code not in allowed:
                code = None  # never accept a code outside the framework
            if isinstance(conf, bool) or not isinstance(conf, (int, float)):
                conf = 0.0
            conf = max(0.0, min(1.0, float(conf)))
            reason = it.get("reason") if isinstance(it.get("reason"), str) else ""
            by_index[idx] = {
                "index": idx,
                "competencyCode": code,
                "confidence": round(conf, 2),
                "reason": reason.strip()[:300],
            }

        return [
            by_index.get(i, {"index": i, "competencyCode": None, "confidence": 0.0, "reason": ""})
            for i in range(len(questions))
        ]
    except Exception:  # noqa: BLE001 - any failure means "LLM classification unavailable"
        return None
