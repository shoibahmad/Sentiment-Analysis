from textblob import TextBlob
from nrclex import NRCLex

# Initialize SpaCy gracefully to avoid DLL load errors on Windows
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    print(f"Warning: SpaCy initialization failed. NER will be disabled. Error: {e}")
    nlp = None

def get_emoji(sentiment: str) -> str:
    if sentiment == "Positive": return "😄"
    elif sentiment == "Negative": return "😢"
    return "😐"

def perform_advanced_analysis(text: str):
    result = {
        "text": text,
        "sentiment": "Neutral",
        "confidence": 0.0,
        "emoji": "😐",
        "language": "unknown",
        "emotions": {},
        "entities": [],
        "aspects": {}
    }

    if not text.strip():
        return result

    try:
        from langdetect import detect
        result["language"] = detect(text)
    except Exception:
        pass

    blob = TextBlob(text)
    polarity = blob.sentiment.polarity
    
    if polarity > 0.1:
        result["sentiment"] = "Positive"
        result["confidence"] = min(abs(polarity) * 1.5, 1.0)
    elif polarity < -0.1:
        result["sentiment"] = "Negative"
        result["confidence"] = min(abs(polarity) * 1.5, 1.0)
    else:
        result["sentiment"] = "Neutral"
        result["confidence"] = 1.0 - abs(polarity)
        
    result["emoji"] = get_emoji(result["sentiment"])

    nrc = NRCLex(text)
    emotions = {k: v for k, v in nrc.raw_emotion_scores.items() if k not in ['positive', 'negative']}
    top_emotions = dict(sorted(emotions.items(), key=lambda item: item[1], reverse=True)[:3])
    result["emotions"] = top_emotions

    if nlp and result["language"] == "en":
        doc = nlp(text)
        
        # Original Entity Extraction
        entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]
        unique_entities = []
        seen = set()
        for e in entities:
            if e["text"].lower() not in seen:
                seen.add(e["text"].lower())
                unique_entities.append(e)
        result["entities"] = unique_entities[:5]

        # Aspect-Based Sentiment Analysis (ABSA)
        aspects = {}
        for chunk in doc.noun_chunks:
            aspect_term = chunk.root.text.lower()
            start = max(0, chunk.start - 3)
            end = min(len(doc), chunk.end + 3)
            context = doc[start:end].text
            aspect_polarity = TextBlob(context).sentiment.polarity
            
            if aspect_polarity > 0.1:
                aspects[aspect_term] = "Positive"
            elif aspect_polarity < -0.1:
                aspects[aspect_term] = "Negative"
            else:
                aspects[aspect_term] = "Neutral"
        
        filtered_aspects = {k: v for k, v in aspects.items() if v != "Neutral"}
        result["aspects"] = dict(list(filtered_aspects.items())[:5])

    return result
