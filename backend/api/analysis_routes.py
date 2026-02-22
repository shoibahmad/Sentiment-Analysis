from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import io
import pandas as pd
from core.security import verify_firebase_token
from core.config import db, firestore
from services.nlp_service import perform_advanced_analysis

router = APIRouter()

class AnalyzeRequest(BaseModel):
    text: str

@router.post("/analyze")
def analyze_text(request: AnalyzeRequest, user=Depends(verify_firebase_token)):
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    uid = user.get("uid") if user else "anonymous"
    analysis = perform_advanced_analysis(request.text)
    
    doc_data = {
        "text": analysis["text"],
        "sentiment": analysis["sentiment"],
        "confidence": analysis["confidence"],
        "language": analysis["language"],
        "emotions": json.dumps(analysis["emotions"]),
        "entities": json.dumps(analysis["entities"]),
        "aspects": json.dumps(analysis["aspects"]),
        "uid": uid,
        "timestamp": firestore.SERVER_TIMESTAMP if db else datetime.utcnow()
    }
    
    if db:
        _, doc_ref = db.collection("queries").add(doc_data)
        analysis["id"] = doc_ref.id
    else:
        analysis["id"] = "local-" + str(int(datetime.utcnow().timestamp()))
        
    return analysis

@router.post("/analyze/bulk")
async def analyze_bulk(file: UploadFile = File(...), user=Depends(verify_firebase_token)):
    if not file.filename.endswith(('.csv', '.txt')):
        raise HTTPException(status_code=400, detail="Only .csv or .txt files supported.")
    
    contents = await file.read()
    texts = []
    
    if file.filename.endswith('.txt'):
        texts = contents.decode('utf-8').splitlines()
    elif file.filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(contents))
        if 'text' in df.columns:
            texts = df['text'].dropna().astype(str).tolist()
        else:
            texts = df.iloc[:, 0].dropna().astype(str).tolist()
            
    texts = [t.strip() for t in texts if t.strip()][:50]
    if not texts:
         raise HTTPException(status_code=400, detail="No readable text found in file.")
         
    results = []
    batch = db.batch() if db else None
    
    uid = user.get("uid") if user else "anonymous"

    for text in texts:
        analysis = perform_advanced_analysis(text)
        doc_data = {
            "text": analysis["text"],
            "sentiment": analysis["sentiment"],
            "confidence": analysis["confidence"],
            "language": analysis["language"],
            "emotions": json.dumps(analysis["emotions"]),
            "entities": json.dumps(analysis["entities"]),
            "aspects": json.dumps(analysis["aspects"]),
            "uid": uid,
            "timestamp": firestore.SERVER_TIMESTAMP if db else datetime.utcnow()
        }
        
        if db:
            doc_ref = db.collection("queries").document()
            batch.set(doc_ref, doc_data)
            
        results.append(analysis)
        
    if batch:
        batch.commit()
        
    return {
        "processed_count": len(results),
        "results": results,
        "summary": {
            "Positive": sum(1 for r in results if r["sentiment"] == "Positive"),
            "Negative": sum(1 for r in results if r["sentiment"] == "Negative"),
            "Neutral": sum(1 for r in results if r["sentiment"] == "Neutral")
        }
    }
