from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse
from core.security import verify_firebase_token
from core.config import db
from collections import defaultdict
from datetime import datetime
import json
import io
import csv

router = APIRouter()

@router.get("/stats")
def admin_stats(skip: int = 0, limit: int = 50, sentiment: str = None, user=Depends(verify_firebase_token)):
    if not db:
        return {"summary": {"total_queries": 0, "total_positive": 0, "total_negative": 0, "total_neutral": 0}, "filtered_total": 0, "all_queries": []}
        
    query_ref = db.collection("queries")
    
    all_docs = list(query_ref.stream())
    total = len(all_docs)
    positive = sum(1 for d in all_docs if d.to_dict().get("sentiment") == "Positive")
    negative = sum(1 for d in all_docs if d.to_dict().get("sentiment") == "Negative")
    neutral = sum(1 for d in all_docs if d.to_dict().get("sentiment") == "Neutral")
    
    base_query = db.collection("queries")
    if sentiment and sentiment != "All":
        base_query = base_query.where("sentiment", "==", sentiment)
        
    filtered_docs = list(base_query.stream())
    filtered_total = len(filtered_docs)
    
    def get_ts(d):
        ts = d.to_dict().get("timestamp")
        return ts.timestamp() if hasattr(ts, 'timestamp') else 0
        
    filtered_docs.sort(key=get_ts, reverse=True)
    
    paginated = filtered_docs[skip : skip + limit]
    
    results = []
    for q in paginated:
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
            "language": doc.get("language", "unknown"),
             "uid": doc.get("uid", "anonymous")
        })

    return {
        "summary": {
            "total_queries": total,
            "total_positive": positive,
            "total_negative": negative,
            "total_neutral": neutral
        },
        "filtered_total": filtered_total,
        "all_queries": results
    }

@router.get("/trends")
def get_admin_trends(user=Depends(verify_firebase_token)):
    if not db:
        return {}
    
    docs = list(db.collection("queries").stream())
    trend_data = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
    
    for d in docs:
        data = d.to_dict()
        ts = data.get("timestamp")
        sentiment = data.get("sentiment")
        if not ts or not sentiment:
            continue
            
        if hasattr(ts, 'date'):
            date_str = ts.date().isoformat()
        else:
            try:
                date_str = str(ts)[:10]
            except:
                continue
                
        trend_data[date_str][sentiment] += 1
        
    return dict(trend_data)

@router.get("/word-frequencies")
def get_admin_word_frequencies(user=Depends(verify_firebase_token)):
    if not db:
        return []
        
    docs = list(db.collection("queries").stream())
    word_stats = {}
    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "is", "was", "are", "were", "it", "this", "that", "of", "i", "you", "we", "they", "he", "she", "not", "have", "has", "had", "do", "does", "did"}
    
    for d in docs:
        doc_data = d.to_dict()
        text = doc_data.get("text", "")
        sentiment = doc_data.get("sentiment", "Neutral")
        
        if not text:
            continue
            
        words = ''.join(c.lower() if c.isalnum() or c.isspace() else ' ' for c in text).split()
        for w in words:
            if w not in stop_words and len(w) > 2:
                if w not in word_stats:
                    word_stats[w] = {"weight": 0, "sentiment_scores": {"Positive": 0, "Negative": 0, "Neutral": 0}}
                word_stats[w]["weight"] += 1
                word_stats[w]["sentiment_scores"][sentiment] += 1
                
    result = []
    for w, stats in word_stats.items():
        # Find dominant sentiment for the word
        dom_sentiment = max(stats["sentiment_scores"], key=stats["sentiment_scores"].get)
        result.append({
            "text": w,
            "weight": stats["weight"],
            "sentiment": dom_sentiment
        })
        
    result.sort(key=lambda x: x["weight"], reverse=True)
    return result[:50]

@router.delete("/queries/{query_id}")
def delete_query(query_id: str, user=Depends(verify_firebase_token)):
    if not db:
        return {"success": False, "message": "Database not initialized"}
    
    try:
        db.collection("queries").document(query_id).delete()
        return {"success": True, "message": f"Query {query_id} deleted"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/users")
def get_admin_users(user=Depends(verify_firebase_token)):
    from firebase_admin import auth as fb_auth
    try:
        # Count per-user queries if DB available
        query_counts = {}
        if db:
            for doc in db.collection("queries").stream():
                uid = doc.to_dict().get("uid", "anonymous")
                query_counts[uid] = query_counts.get(uid, 0) + 1

        page = fb_auth.list_users()
        users_list = []

        def process_user(r):
            ct = r.user_metadata.creation_timestamp
            created_at = datetime.utcfromtimestamp(ct / 1000).isoformat() if ct else None
            return {
                "uid": r.uid,
                "email": r.email or "",
                "name": r.display_name or r.email or "Unknown User",
                "created_at": created_at,
                "query_count": query_counts.get(r.uid, 0)
            }

        for r in page.users:
            users_list.append(process_user(r))

        while page.has_next_page:
            page = page.get_next_page()
            for r in page.users:
                users_list.append(process_user(r))

        users_list.sort(key=lambda u: u.get("query_count", 0), reverse=True)
        return users_list
    except Exception as e:
        print(f"Error fetching users: {e}")
        return []

@router.delete("/users/{uid}")
def delete_admin_user(uid: str, user=Depends(verify_firebase_token)):
    from firebase_admin import auth
    try:
        try:
            auth.delete_user(uid)
        except auth.UserNotFoundError:
            pass

        if db:
            queries = db.collection("queries").where("uid", "==", uid).stream()
            batch = db.batch()
            count = 0
            for q in queries:
                batch.delete(q.reference)
                count += 1
                if count >= 500:
                    batch.commit()
                    batch = db.batch()
                    count = 0
            if count > 0:
                batch.commit()
                
        return {"success": True, "message": f"User {uid} and auth record completely deleted"}
    except Exception as e:
        print(f"Error deleting user {uid}: {e}")
        return {"success": False, "message": str(e)}


@router.get("/export")
def export_queries_csv(user=Depends(verify_firebase_token)):
    """Export all queries to a downloadable CSV file."""
    if not db:
        return Response(content="No database connected", media_type="text/plain")

    docs = list(db.collection("queries").stream())

    def get_ts(d):
        ts = d.to_dict().get("timestamp")
        return ts.timestamp() if hasattr(ts, 'timestamp') else 0

    docs.sort(key=get_ts, reverse=True)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["#", "Text", "Sentiment", "Confidence", "Language", "Timestamp", "UID"])

    for idx, doc in enumerate(docs, 1):
        d = doc.to_dict()
        ts = d.get("timestamp")
        ts_str = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
        writer.writerow([
            idx,
            d.get("text", ""),
            d.get("sentiment", "Neutral"),
            f"{round(d.get('confidence', 0) * 100)}%",
            d.get("language", "unknown"),
            ts_str,
            d.get("uid", "anonymous")
        ])

    csv_bytes = output.getvalue().encode('utf-8')
    filename = f"aura_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
