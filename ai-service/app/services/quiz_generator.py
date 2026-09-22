# ai-service/app/services/quiz_generator.py
# Generates a personalized 5-question MCQ quiz from extracted document text
# and the user's profile. Uses a real LLM if LLM_API_KEY is configured in
# .env, otherwise falls back to a deterministic mock generator so the whole
# application still works with zero external API keys.

import json
import os
import random
import re
from collections import Counter
from typing import Dict, List, Optional

import httpx

STOPWORDS = set(
    """a an the and or but if then else for of to in on at by with from as is are was were be been
    being this that these those it its it's into over under again further than too very can will
    just should now not no nor so such only own same about above below up down out off there here
    when where why how all any both each few more most other some such not only but also because
    while during before after between through during without within along following across behind
    beyond plus except including per via""".split()
)

MIN_KEYWORD_LEN = 4


def _split_sentences(text: str) -> List[str]:
    # Simple sentence splitter; good enough for extracted document text.
    text = re.sub(r"\s+", " ", text).strip()
    raw = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in raw if len(s.strip()) > 25]
    return sentences


def _extract_keywords(text: str, top_n: int = 12) -> List[str]:
    words = re.findall(r"[A-Za-z][A-Za-z\-]{2,}", text)
    freq = Counter()
    for w in words:
        lw = w.lower()
        if lw in STOPWORDS or len(lw) < MIN_KEYWORD_LEN:
            continue
        freq[w] += 1
    # Prefer capitalized/technical-looking terms first, then frequency
    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], -len(kv[0])))
    keywords = []
    seen_lower = set()
    for word, _ in ranked:
        lw = word.lower()
        if lw in seen_lower:
            continue
        seen_lower.add(lw)
        keywords.append(word)
        if len(keywords) >= top_n:
            break
    return keywords


def detect_topic(text: str) -> str:
    """Best-effort topic detection: use the most frequent meaningful phrase,
    falling back to the first non-trivial line of the document."""
    keywords = _extract_keywords(text, top_n=3)
    if keywords:
        return " ".join(keywords[:2]).title()

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines:
        return lines[0][:60]
    return "General Topic"


def _truncate(s: str, max_len: int = 160) -> str:
    s = s.strip()
    return s if len(s) <= max_len else s[: max_len - 3].rstrip() + "..."


def _mock_generate_questions(text: str, profile: Dict[str, str]) -> List[Dict]:
    """Deterministic, dependency-free quiz generator built directly from the
    document content, so questions always relate to what was uploaded."""
    sentences = _split_sentences(text)
    keywords = _extract_keywords(text, top_n=16)

    if not sentences:
        sentences = [text[:200]] if text else ["No content was available in this document."]

    # Prefer sentences that contain a keyword (more likely to be informative)
    scored = []
    for s in sentences:
        score = sum(1 for kw in keywords if kw.lower() in s.lower())
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    ranked_sentences = [s for _, s in scored] or sentences

    skill_level = (profile.get("skill_level") or "Beginner").strip()
    interests = (profile.get("interests") or "").strip()

    questions = []
    used_sentences = set()
    used_keywords = set()

    # Build up to 5 questions, one per top informative sentence
    pool = [s for s in ranked_sentences if s not in used_sentences]
    for i in range(5):
        if i < len(pool):
            correct_sentence = pool[i]
        else:
            # Not enough distinct sentences — reuse with slight variation
            correct_sentence = ranked_sentences[i % len(ranked_sentences)]
        used_sentences.add(correct_sentence)

        # Pick a keyword this sentence is "about" for the question stem,
        # preferring one we haven't used yet so questions stay varied.
        subject_kw = None
        sentence_keywords = [kw for kw in keywords if kw.lower() in correct_sentence.lower()]
        for kw in sentence_keywords:
            if kw.lower() not in used_keywords:
                subject_kw = kw
                break
        if not subject_kw and sentence_keywords:
            subject_kw = sentence_keywords[0]
        if not subject_kw:
            for kw in keywords:
                if kw.lower() not in used_keywords:
                    subject_kw = kw
                    break
        if not subject_kw:
            subject_kw = keywords[i % len(keywords)] if keywords else "this topic"
        used_keywords.add(subject_kw.lower())

        correct_answer_text = _truncate(correct_sentence, 140)

        # Distractors: other sentences from the document, reworded minimally
        distractor_pool = [s for s in sentences if s != correct_sentence]
        random.shuffle(distractor_pool)
        distractors = [_truncate(s, 140) for s in distractor_pool[:3]]

        # If the document is short and we don't have 3 distinct distractors,
        # generate generic-but-plausible-sounding wrong options.
        generic_fillers = [
            f"It is unrelated to {subject_kw} and not discussed in the document.",
            f"It contradicts the explanation of {subject_kw} given in the document.",
            "This is not supported by the uploaded document.",
        ]
        while len(distractors) < 3:
            distractors.append(generic_fillers[len(distractors) % len(generic_fillers)])

        options = [correct_answer_text] + distractors[:3]
        random.shuffle(options)
        correct_index = options.index(correct_answer_text)

        question_text = f"Based on the document, which statement best describes '{subject_kw}'?"

        explanation = (
            f"The document states: \"{_truncate(correct_sentence, 180)}\" "
            f"This directly relates to '{subject_kw}'."
        )
        if skill_level.lower() == "advanced":
            explanation += " Consider how this connects to related concepts in the document for deeper understanding."
        elif interests:
            explanation += f" This is particularly relevant given your interest in {interests}."

        questions.append(
            {
                "question": question_text,
                "options": options,
                "correctAnswer": correct_index,
                "explanation": explanation,
            }
        )

    return questions


async def _llm_generate_questions(text: str, profile: Dict[str, str]) -> Optional[List[Dict]]:
    """Attempts to generate questions using a configured LLM API.
    Returns None if not configured or if the call/parsing fails, so the
    caller can fall back to the mock generator."""
    api_key = os.getenv("LLM_API_KEY", "").strip()
    api_url = os.getenv("LLM_API_URL", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()

    if not api_key or not api_url:
        return None

    prompt = f"""You are an expert instructional designer. Using ONLY the document content below,
write exactly 5 multiple-choice questions personalized for this learner.

Learner profile:
- Designation: {profile.get('designation', 'N/A')}
- Department: {profile.get('department', 'N/A')}
- Qualification: {profile.get('qualification', 'N/A')}
- Experience: {profile.get('experience', 'N/A')}
- Areas of interest: {profile.get('interests', 'N/A')}
- Skill level: {profile.get('skill_level', 'Beginner')}

Document content:
\"\"\"{text[:6000]}\"\"\"

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
- Exactly 5 questions.
- Exactly 4 options per question.
- correctAnswer is the 0-based index of the correct option.
- Questions must be answerable strictly from the document content.
- Match difficulty to the learner's skill level.
"""

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                api_url,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": model or "claude-sonnet-4-6",
                    "max_tokens": 2000,
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
        questions = parsed.get("questions", [])

        if len(questions) != 5:
            return None
        for q in questions:
            if len(q.get("options", [])) != 4:
                return None
            if not isinstance(q.get("correctAnswer"), int) or not (0 <= q["correctAnswer"] <= 3):
                return None

        return questions
    except Exception:  # noqa: BLE001 — any failure falls back to mock generator
        return None


async def generate_personalized_quiz(text: str, profile: Dict[str, str]) -> List[Dict]:
    """Main entry point: tries the LLM (if configured), falls back to the
    mock generator so the app always returns a usable quiz."""
    questions = await _llm_generate_questions(text, profile)
    if questions:
        return questions
    return _mock_generate_questions(text, profile)
