from fastapi import APIRouter, Depends
from core.security import verify_firebase_token
from core.config import db
from services.nlp_service import get_emoji
import json

router = APIRouter()

@router.get("/recent")
def recent_analyses(user=Depends(verify_firebase_token)):
    if not db:
        return []
        
    uid = user.get("uid") if user else "anonymous"
    queries = list(db.collection("queries").where("uid", "==", uid).stream())
    
    def get_ts(q):
        data = q.to_dict()
        ts = data.get("timestamp")
        return ts.timestamp() if hasattr(ts, 'timestamp') else 0
        
    queries.sort(key=get_ts, reverse=True)
    queries = queries[:15]
    
    results = []
    for q in queries:
        doc = q.to_dict()
        ts = doc.get("timestamp")
        
        if hasattr(ts, 'isoformat'):
            timestamp_str = ts.isoformat()
        else:
            timestamp_str = str(ts)
            
        results.append({
            "id": q.id,
            "text": doc.get("text", ""),
            "sentiment": doc.get("sentiment", "Neutral"),
            "confidence": doc.get("confidence", 0.0),
            "timestamp": timestamp_str,
            "emoji": get_emoji(doc.get("sentiment", "Neutral")),
            "language": doc.get("language", "unknown"),
            "emotions": json.loads(doc.get("emotions", "{}")),
            "entities": json.loads(doc.get("entities", "[]")),
            "aspects": json.loads(doc.get("aspects", "{}"))
        })
    return results

@router.get("/user/stats")
def user_stats(user=Depends(verify_firebase_token)):
    if not db or not user:
        return {"summary": {"total_queries": 0, "total_positive": 0, "total_negative": 0, "total_neutral": 0}, "trend": []}

    uid = user.get("uid")
    user_queries = list(db.collection("queries").where("uid", "==", uid).stream())
    
    def get_ts(q):
        data = q.to_dict()
        ts = data.get("timestamp")
        return ts.timestamp() if hasattr(ts, 'timestamp') else 0
        
    user_queries.sort(key=get_ts)
    
    total = len(user_queries)
    positive = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Positive")
    negative = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Negative")
    neutral  = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Neutral")
    
    trend = []
    for q in user_queries:
        data = q.to_dict()
        conf = data.get("confidence", 0)
        sent = data.get("sentiment", "Neutral")
        score = conf if sent == "Positive" else (-conf if sent == "Negative" else 0)
        
        ts = data.get("timestamp")
        if hasattr(ts, 'isoformat'):
            dstr = ts.isoformat()
        else:
            dstr = str(ts)
            
        trend.append({
            "timestamp": dstr,
            "score": score
        })

    return {
        "summary": {
            "total_queries": total,
            "total_positive": positive,
            "total_negative": negative,
            "total_neutral": neutral
        },
        "trend": trend[-50:]
    }

@router.get("/user/analytics")
def user_analytics(user=Depends(verify_firebase_token)):
    if not db or not user:
        return {
            "summary": {
                "total_queries": 0,
                "total_positive": 0,
                "total_negative": 0,
                "total_neutral": 0
            }, 
            "history": [], 
            "word_frequencies": {}
        }

    uid = user.get("uid")
    user_queries = list(db.collection("queries").where("uid", "==", uid).stream())
    
    def get_ts(q):
        data = q.to_dict()
        ts = data.get("timestamp")
        return ts.timestamp() if hasattr(ts, 'timestamp') else 0
        
    user_queries.sort(key=get_ts)
    
    total = len(user_queries)
    positive = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Positive")
    negative = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Negative")
    neutral  = sum(1 for q in user_queries if q.to_dict().get("sentiment") == "Neutral")
    
    history = []
    word_freq = {}
    
    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "is", "was", "are", "were", "it", "this", "that", "of", "i", "you", "we", "they", "he", "she"}
    
    for q in user_queries:
        data = q.to_dict()
        conf = data.get("confidence", 0)
        sent = data.get("sentiment", "Neutral")
        score = conf if sent == "Positive" else (-conf if sent == "Negative" else 0)
        
        ts = data.get("timestamp")
        history.append({
            "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
            "score": score
        })
        
        text = str(data.get("text", "")).lower()
        import re
        words = re.findall(r'\b[a-z]{3,}\b', text)
        for w in words:
            if w not in stop_words:
                word_freq[w] = word_freq.get(w, 0) + 1

    return {
        "summary": {
            "total_queries": total,
            "total_positive": positive,
            "total_negative": negative,
            "total_neutral": neutral
        },
        "history": history[-100:],
        "word_frequencies": word_freq
    }
