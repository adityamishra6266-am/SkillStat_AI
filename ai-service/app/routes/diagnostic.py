# ai-service/app/routes/diagnostic.py
# supplemental AI-assisted diagnostic question generation.
# See app/services/diagnostic_generator.py for why this is
# gap-filling only, never the primary source of diagnostic questions.

import os
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.diagnostic_generator import generate_diagnostic_questions

router = APIRouter()


class CompetencyGapRequest(BaseModel):
    competencyCode: str
    competencyName: str
    description: Optional[str] = ""
    difficulty: str = "Medium"
    count: int = 1


class DiagnosticGenerationRequest(BaseModel):
    gaps: List[CompetencyGapRequest]
    skillLevel: Optional[str] = "Beginner"


@router.post("/generate-diagnostic-questions")
async def generate_diagnostic_questions_route(payload: DiagnosticGenerationRequest):
    llm_configured = bool(os.getenv("LLM_API_KEY", "").strip() and os.getenv("LLM_API_URL", "").strip())

    results = []
    for gap in payload.gaps:
        questions = None
        if llm_configured:
            questions = await generate_diagnostic_questions(
                competency_name=gap.competencyName,
                competency_description=gap.description or "",
                difficulty=gap.difficulty,
                count=gap.count,
                skill_level=payload.skillLevel or "Beginner",
            )
        results.append(
            {
                "competencyCode": gap.competencyCode,
                "questions": questions or [],
            }
        )

    return {"llmConfigured": llm_configured, "results": results}
