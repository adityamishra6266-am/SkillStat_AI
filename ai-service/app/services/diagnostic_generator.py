# ai-service/app/services/diagnostic_generator.py
# AI-assisted diagnostic question generation.
#
# This is a SUPPLEMENTAL generator only: the Node backend's diagnostic
# question BANK (database/seeds/diagnostic_questions_seed.sql) is the
# primary, reliable source of diagnostic questions for a live demo.
# This endpoint exists for the case where a role's applicable
# competency has too few (or zero) bank questions to reach a full
# assessment — the Node backend calls this to try to fill that gap
# with an LLM, and simply falls back to fewer questions if this
# returns nothing.
#
# Deliberately reuses the SAME LLM-call shape as
# quiz_generator._llm_generate_questions (same env vars, same
# Anthropic Messages API request, same "ask for exactly this JSON
# shape" contract) rather than inventing a second integration pattern.
# If LLM_API_KEY / LLM_API_URL are not configured — the default for
# this project — this returns None immediately. There is deliberately
# NO mock/deterministic question generator here: fabricating "AI
# generated" MCQs with unverified correct answers for a COMPETENCY
# ASSESSMENT (as opposed to a document-grounded quiz, where the mock
# generator can lean on the source text for the correct answer) would
# be misleading. The honest fallback is the hand-authored bank.

import json
import os
import re
from typing import Dict, List, Optional

import httpx

from app.services.validation import validate_questions


async def generate_diagnostic_questions(
    competency_name: str,
    competency_description: str,
    difficulty: str,
    count: int,
    skill_level: str = "Beginner",
) -> Optional[List[Dict]]:
    """Attempts to generate `count` diagnostic MCQs for one competency using
    a configured LLM. Returns None if not configured or if the call/parsing
    fails, so the caller (Node backend) can fall back to the question bank."""
    api_key = os.getenv("LLM_API_KEY", "").strip()
    api_url = os.getenv("LLM_API_URL", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()

    if not api_key or not api_url or count <= 0:
        return None

    prompt = f"""You are an expert assessment designer for a government official statistics
training platform. Write exactly {count} multiple-choice diagnostic questions
that test a learner's CURRENT knowledge of the competency below — this is a
diagnostic assessment (to measure existing skill), not a teaching quiz about
a specific document.

Competency: {competency_name}
Competency description: {competency_description}
Target difficulty: {difficulty}
Learner's self-reported skill level: {skill_level}

Return ONLY valid JSON in this exact shape, nothing else:
{{
  "questions": [
    {{
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": 0,
      "explanation": "string"
    }}
  ]
}}
Rules:
- Exactly {count} question(s).
- Exactly 4 options per question.
- correctAnswer is the 0-based index of the single correct option.
- Questions must have one unambiguously correct answer — do not write
  opinion-based or ambiguous questions.
- Match the requested difficulty level.
"""

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
            block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
        )
        raw_text = raw_text.strip()
        raw_text = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip())

        parsed = json.loads(raw_text)
        return validate_questions(parsed.get("questions"), expected_count=count)
    except Exception:  # noqa: BLE001 — any failure means "not available", never a crash
        return None
