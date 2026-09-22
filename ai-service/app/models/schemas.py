# ai-service/app/models/schemas.py
# Pydantic response models for the AI service.

from typing import List, Optional
from pydantic import BaseModel


class QuizQuestion(BaseModel):
    question: str
    options: List[str]  # exactly 4 options
    correctAnswer: int  # 0-3 index into options
    explanation: str


class QuizResponse(BaseModel):
    extractedText: str
    topic: Optional[str] = None
    questions: List[QuizQuestion]
