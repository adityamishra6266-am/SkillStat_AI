# ai-service/app/routes/quiz.py

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.extractor import ExtractionError, extract_text
from app.services.quiz_generator import detect_topic, generate_personalized_quiz

router = APIRouter()


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
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        extracted_text = extract_text(file_bytes, file_type)
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not extracted_text or len(extracted_text.strip()) < 20:
        raise HTTPException(
            status_code=422,
            detail="Not enough readable text could be extracted from this document.",
        )

    profile = {
        "designation": designation,
        "department": department,
        "qualification": qualification,
        "experience": experience,
        "interests": interests,
        "skill_level": skill_level,
    }

    topic = detect_topic(extracted_text)

    try:
        questions = await generate_personalized_quiz(extracted_text, profile)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {exc}") from exc

    if not questions or len(questions) != 5:
        raise HTTPException(status_code=500, detail="Failed to generate exactly 5 questions.")

    return {
        "extractedText": extracted_text,
        "topic": topic,
        "questions": questions,
    }
