from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from core.security import verify_firebase_token
from services.gemini_service import get_sentiment_explanation, get_tone_rewrites

router = APIRouter()


class ExplainRequest(BaseModel):
    text: str
    sentiment: str
    confidence: float
    language: Optional[str] = "unknown"
    emotions: Optional[Dict[str, Any]] = {}
    entities: Optional[list] = []
    aspects: Optional[Dict[str, Any]] = {}


class RewriteRequest(BaseModel):
    text: str


@router.post("/ai/explain")
def explain_analysis(request: ExplainRequest, user=Depends(verify_firebase_token)):
    """
    Use Gemini to generate a human-readable narrative explanation of a sentiment result.
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    analysis_dict = {
        "text": request.text,
        "sentiment": request.sentiment,
        "confidence": request.confidence,
        "language": request.language,
        "emotions": request.emotions,
        "entities": request.entities,
        "aspects": request.aspects
    }

    explanation = get_sentiment_explanation(analysis_dict)
    return {"explanation": explanation}


@router.post("/ai/rewrite")
def rewrite_text(request: RewriteRequest, user=Depends(verify_firebase_token)):
    """
    Use Gemini to produce three tone-rewritten versions of the input text.
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    rewrites = get_tone_rewrites(request.text)
    return {"rewrites": rewrites}
