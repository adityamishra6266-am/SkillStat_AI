# ai-service/app/main.py
# SkillStat AI - Python FastAPI microservice for document extraction
# and personalized MCQ quiz generation.

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.quiz import router as quiz_router
from app.routes.diagnostic import router as diagnostic_router

load_dotenv()

app = FastAPI(
    title="SkillStat AI - Document & Quiz Service",
    description="Extracts text from uploaded documents and generates personalized MCQ quizzes.",
    version="1.0.0",
)

allowed_origin = os.getenv("ALLOWED_ORIGIN", "http://localhost:5000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quiz_router)
app.include_router(diagnostic_router)


@app.get("/")
def root():
    return {"service": "SkillStat AI - AI Service", "status": "running"}


@app.get("/health")
def health():
    # Both the key and the URL are required by every LLM call in this service,
    # so both must be set for the service to honestly report "LLM configured".
    llm_configured = bool(os.getenv("LLM_API_KEY", "").strip() and os.getenv("LLM_API_URL", "").strip())
    return {
        "status": "ok",
        "llm_configured": llm_configured,
        "mode": "LLM-assisted" if llm_configured else "Fallback (extractive quiz generator + curated question bank)",
    }
