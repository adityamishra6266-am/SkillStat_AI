# ai-service/app/routes/quiz.py
# Document processing endpoints. The Node backend uses them as separate steps
# so the UI can show REAL stages (upload -> extract -> generate -> prepare):
#   POST /extract-text          file            -> extractedText, topic
#   POST /generate-quiz         text + profile  -> validated questions + generationMode
#   POST /classify-questions    questions + framework -> competency suggestions (LLM only)
# /extract-and-generate-quiz is kept as a convenience wrapper over the first two.

from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.competency_classifier import classify_questions, llm_configured
from app.services.extractor import ExtractionError, extract_text
from app.services.quiz_generator import detect_topic, generate_personalized_quiz

router = APIRouter()

MIN_TEXT_CHARS = 20


async def _extract(file: UploadFile, file_type: str):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        text = extract_text(file_bytes, file_type)
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not text or len(text.strip()) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=422,
            detail="Not enough readable text could be extracted from this document.",
        )
    return text, detect_topic(text)


async def _generate(text: str, profile: Dict[str, str]):
    try:
        questions, mode = await generate_personalized_quiz(text, profile)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {exc}") from exc
    if not questions or len(questions) != 5:
        raise HTTPException(status_code=500, detail="Failed to generate exactly 5 questions.")
    return questions, mode


@router.post("/extract-text")
async def extract_text_route(file: UploadFile = File(...), file_type: str = Form(...)):
    text, topic = await _extract(file, file_type)
    return {"extractedText": text, "topic": topic}


class Profile(BaseModel):
    designation: Optional[str] = ""
    department: Optional[str] = ""
    qualification: Optional[str] = ""
    experience: Optional[str] = ""
    interests: Optional[str] = ""
    skill_level: Optional[str] = "Beginner"


class GenerateQuizRequest(BaseModel):
    text: str
    profile: Profile = Profile()


@router.post("/generate-quiz")
async def generate_quiz_route(payload: GenerateQuizRequest):
    if len(payload.text.strip()) < MIN_TEXT_CHARS:
        raise HTTPException(status_code=422, detail="Not enough text to generate a quiz.")
    profile = {k: (v or "") for k, v in payload.profile.model_dump().items()}
    questions, mode = await _generate(payload.text, profile)
    return {"topic": detect_topic(payload.text), "questions": questions, "generationMode": mode}


class CompetencyInfo(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "General"


class ClassifyQuestion(BaseModel):
    question: str
    options: List[str]


class ClassifyRequest(BaseModel):
    questions: List[ClassifyQuestion]
    competencies: List[CompetencyInfo]
    topic: Optional[str] = ""


@router.post("/classify-questions")
async def classify_questions_route(payload: ClassifyRequest):
    """LLM-assisted competency classification. Returns llmConfigured=false /
    results=null when no LLM is available - the backend then uses its
    deterministic keyword matcher instead."""
    if not llm_configured():
        return {"llmConfigured": False, "results": None}
    results = await classify_questions(
        [q.model_dump() for q in payload.questions],
        [c.model_dump() for c in payload.competencies],
        payload.topic or "",
    )
    return {"llmConfigured": True, "results": results}


@router.post("/extract-and-generate-quiz")
async def extract_and_generate_quiz(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    designation: str = Form(""),
    department: str = Form(""),
    qualification: str = Form(""),
    experience: str = Form(""),
    interests: str = Form(""),
    skill_level: str = Form("Beginner"),
):
    text, topic = await _extract(file, file_type)
    profile = {
        "designation": designation,
        "department": department,
        "qualification": qualification,
        "experience": experience,
        "interests": interests,
        "skill_level": skill_level,
    }
    questions, mode = await _generate(text, profile)
    return {"extractedText": text, "topic": topic, "questions": questions, "generationMode": mode}
