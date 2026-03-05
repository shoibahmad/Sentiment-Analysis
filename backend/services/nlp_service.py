import os
import nltk

# Ensure NLTK can find its data on Render (downloaded to backend/nltk_data during build)
base_dir = os.path.dirname(os.path.abspath(__file__)) # This is backend/services
nltk_data_dir = os.path.join(os.path.dirname(base_dir), 'nltk_data')
if os.path.isdir(nltk_data_dir) and nltk_data_dir not in nltk.data.path:
    nltk.data.path.insert(0, nltk_data_dir)

from textblob import TextBlob
from nrclex import NRCLex
import pydantic
import textstat
import re

# Initialize SpaCy gracefully to avoid DLL load errors on Windows
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    print(f"Warning: SpaCy initialization failed. NER will be disabled. Error: {e}")
    nlp = None

# ── Stop words (used for keyword map)
STOP_WORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","with","is","was",
    "are","were","it","this","that","of","i","you","we","they","he","she","not",
    "have","has","had","do","does","did","will","would","could","should","been",
    "be","by","from","so","if","as","up","out","about","into","than","then",
    "some","just","there","their","what","which","who","when","all","more",
    "my","your","our","its","very","just","can","also","no","too","get","got"
}

# ── Toxicity word lists (tiered)
TOXIC_WORDS = {
    "kill","murder","rape","bomb","terrorist","genocide","slaughter","Execute",
    "hang","shoot","stab"
}
OFFENSIVE_WORDS = {
    "idiot","stupid","dumb","moron","loser","trash","garbage","hate","ugly",
    "pathetic","worthless","disgusting","awful","terrible","horrible","jerk",
    "fool","scum","pig","junk","sucks","suck","crap","crap","freak"
}

# ── Sarcasm indicator phrases
SARCASM_PHRASES = [
    "oh great","yeah right","sure thing","thanks a lot","wow really","oh wow",
    "of course","so helpful","totally fine","just perfect","oh sure","right sure",
    "how wonderful","what a surprise","clearly","obviously","definitely not",
    "oh absolutely","yeah totally","shocking","love that for me","can't wait",
]


def get_emoji(sentiment: str) -> str:
    if sentiment == "Positive": return "😄"
    elif sentiment == "Negative": return "😢"
    return "😐"


# ── Feature 1: Sarcasm Detection
def detect_sarcasm(text: str, polarity: float, emotions: dict) -> dict:
    """
    Heuristic sarcasm scorer. Returns score 0-1, label, and clues list.
    """
    clues = []
    score = 0.0
    lower = text.lower()

    # Sarcasm phrases
    matched_phrases = [p for p in SARCASM_PHRASES if p in lower]
    if matched_phrases:
        score += 0.25 * min(len(matched_phrases), 2)
        quoted = ', '.join('"' + p + '"' for p in matched_phrases[:2])
        clues.append(f"Sarcasm phrases detected: {quoted}")

    # High positive polarity but negative emotions
    neg_emotions = emotions.get("anger", 0) + emotions.get("disgust", 0) + emotions.get("fear", 0)
    if polarity > 0.25 and neg_emotions > 2:
        score += 0.30
        clues.append("Positive wording paired with negative emotional undertones")

    # Excessive punctuation
    excl = text.count("!")
    quest = text.count("?")
    if excl >= 3:
        score += 0.15
        clues.append(f"Excessive exclamation marks ({excl})")
    if quest >= 2:
        score += 0.10
        clues.append(f"Multiple question marks ({quest})")

    # ALL CAPS words
    caps_words = [w for w in text.split() if w.isupper() and len(w) > 2]
    if len(caps_words) >= 2:
        score += 0.15
        clues.append(f"CAPS words: {', '.join(caps_words[:3])}")

    # Emoji contradiction: positive text with 😒😑🙄
    if any(e in text for e in ["😒", "😑", "🙄", "😐", "🤨"]):
        score += 0.15
        clues.append("Contradictory tone emoji detected")

    score = min(score, 1.0)
    label = "Likely Sarcastic" if score >= 0.45 else ("Possibly Sarcastic" if score >= 0.25 else "Sincere")
    return {"score": round(score, 2), "label": label, "clues": clues}


# ── Feature 2: Toxicity / Hate Speech Filter
def detect_toxicity(text: str) -> dict:
    """
    Classifies text as Safe / Offensive / Toxic.
    Returns label + match_count + matched_words.
    """
    words_lower = set(re.findall(r'\b\w+\b', text.lower()))

    toxic_matches    = list(words_lower & TOXIC_WORDS)
    offensive_matches = list(words_lower & OFFENSIVE_WORDS)

    if toxic_matches:
        label = "Toxic"
        score = min(0.6 + 0.1 * len(toxic_matches), 1.0)
        matched = toxic_matches
    elif offensive_matches:
        label = "Offensive"
        score = min(0.3 + 0.08 * len(offensive_matches), 0.8)
        matched = offensive_matches
    else:
        label = "Safe"
        score = 0.0
        matched = []

    return {
        "label": label,
        "score": round(score, 2),
        "matched_words": matched[:5]
    }


# ── Feature 3: Sentence-Level Sentiment Breakdown
def sentence_breakdown(text: str) -> list:
    """
    Returns list of {text, sentiment, score} for each sentence.
    """
    blob = TextBlob(text)
    results = []
    for sent in blob.sentences:
        s = str(sent).strip()
        if not s:
            continue
        pol = sent.sentiment.polarity
        if pol > 0.05:
            sent_label = "Positive"
        elif pol < -0.05:
            sent_label = "Negative"
        else:
            sent_label = "Neutral"
        results.append({
            "text": s,
            "sentiment": sent_label,
            "score": round(pol, 3)
        })
    return results


# ── Feature 4: Keyword Sentiment Map (enhanced — NRCLex + TextBlob combined)
def keyword_sentiment_map(text: str, nrc_emotions: dict = None) -> list:
    """
    Returns top words with their polarity and color.
    Strategy:
      1. Score all non-stopwords via TextBlob word polarity
      2. Augment with NRCLex emotion tags (positive/negative emotion words)
      3. Return top 15 by absolute polarity, falling back to NRCLex if TextBlob finds nothing
    """
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    word_scores = {}

    # Step 1 — TextBlob per-word polarity (even very small values)
    for word in words:
        if word in STOP_WORDS:
            continue
        pol = TextBlob(word).sentiment.polarity
        if pol != 0.0:
            word_scores[word] = pol

    # Step 2 — NRCLex augmentation: tag emotion words not caught by TextBlob
    try:
        nrc = NRCLex(text)
        for word, emotions in nrc.affect_dict.items():
            w = word.lower()
            if w in STOP_WORDS or len(w) < 3:
                continue
            if 'positive' in emotions and w not in word_scores:
                word_scores[w] = 0.3
            elif 'negative' in emotions and w not in word_scores:
                word_scores[w] = -0.3
    except Exception:
        pass

    # Step 3 — If still empty, give noun chunks a neutral-positive boost so map isn't blank
    if not word_scores:
        for word in words:
            if word not in STOP_WORDS and len(word) > 3:
                word_scores[word] = 0.0

    # Sort by absolute polarity, take top 15
    sorted_words = sorted(word_scores.items(), key=lambda x: abs(x[1]), reverse=True)[:15]

    result = []
    for word, pol in sorted_words:
        if pol > 0:
            color = "positive"
        elif pol < 0:
            color = "negative"
        else:
            color = "neutral"
        result.append({
            "word": word,
            "score": round(pol, 3),
            "color": color
        })
    return result


# ── Feature 5: Readability & Cognitive Load
def calculate_readability(text: str) -> dict:
    """
    Returns grade level and an estimated reading time/complexity.
    """
    try:
        grade = textstat.text_standard(text)
        ease = textstat.flesch_reading_ease(text)
        
        if ease >= 80:
            complexity = "Very Easy (Conversational)"
        elif ease >= 60:
            complexity = "Standard (Easily Digestible)"
        elif ease >= 30:
            complexity = "Difficult (Academic/Professional)"
        else:
            complexity = "Very Difficult (Highly Technical)"
            
        # Estimate reading time (avg adult reads 238 words per minute)
        word_count = textstat.lexicon_count(text, removepunct=True)
        reading_time_sec = max(1, round((word_count / 238) * 60))
        time_str = f"{reading_time_sec} sec" if reading_time_sec < 60 else f"{round(reading_time_sec/60, 1)} min"

        return {
            "grade_level": grade,
            "complexity": complexity,
            "reading_time": time_str
        }
    except Exception:
        return {"grade_level": "Unknown", "complexity": "Standard", "reading_time": "< 1 sec"}

# ── Feature 6: Formality Analysis
def analyze_formality(text: str) -> dict:
    """
    Estimates if text is Formal, Casual, or Slang.
    """
    lower_text = text.lower()
    words = set(re.findall(r'\b\w+\b', lower_text))
    
    casual_markers = {"gonna", "wanna", "kinda", "sorta", "dunno", "lemme", "yall", "im", "dont", "cant", "wont"}
    slang_markers = {"lol", "lmao", "fr", "ngl", "bruh", "tbh", "smh", "stfu", "wtf", "omg", "af", "lit"}
    formal_markers = {"furthermore", "therefore", "moreover", "accordingly", "nevertheless", "thus", "consequently", "regarding", "sincerely"}
    
    casual_count = len(words & casual_markers)
    slang_count = len(words & slang_markers)
    formal_count = len(words & formal_markers)
    
    # Heuristic scoring
    if slang_count > 0 or casual_count >= 2:
        return {"score": 0.2, "label": "Casual / Slang"}
    elif formal_count > 0 or textstat.flesch_reading_ease(text) < 50:
        return {"score": 0.9, "label": "Highly Formal"}
    else:
        return {"score": 0.5, "label": "Standard Content"}

# ── Feature 7: Semantic Intent
def detect_intent(text: str, polarity: float) -> dict:
    """
    Estimates the primary intent of the user.
    """
    lower_text = text.lower()
    
    if "?" in text or any(lower_text.startswith(w) for w in ["how", "what", "why", "where", "when", "can", "will", "is", "are", "do", "does"]):
        return {"label": "Questioning / Inquiry", "color": "blue"}
        
    if polarity < -0.3 and any(w in lower_text for w in ["hate", "horrible", "awful", "terrible", "worst", "fix", "issue", "bug", "broken", "sucks"]):
        return {"label": "Complaining / Frustration", "color": "red"}
        
    if polarity > 0.4 and any(w in lower_text for w in ["love", "amazing", "great", "excellent", "best", "thanks", "thank you", "appreciate"]):
        return {"label": "Praising / Appreciation", "color": "green"}
        
    verbs_start = any(lower_text.startswith(w) for w in ["please", "do", "make", "take", "get", "bring", "tell", "give"])
    if verbs_start:
        return {"label": "Directing / Commanding", "color": "yellow"}
        
    return {"label": "Informational / Stating", "color": "gray"}

# ── Main analysis function
def perform_advanced_analysis(text: str):
    result = {
        "text": text,
        "sentiment": "Neutral",
        "confidence": 0.0,
        "emoji": "😐",
        "language": "unknown",
        "emotions": {},
        "entities": [],
        "aspects": {},
        # ── New fields
        "sarcasm": {"score": 0.0, "label": "Sincere", "clues": []},
        "toxicity": {"label": "Safe", "score": 0.0, "matched_words": []},
        "sentence_breakdown": [],
        "keyword_map": []
    }

    if not text.strip():
        return result

    # Language detection
    try:
        from langdetect import detect
        result["language"] = detect(text)
    except Exception:
        pass

    # Core sentiment
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

    # Override for severe negative/self-harm context (models often miss this and score neutral)
    self_harm_keywords = {
        'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
        'better off dead', 'take my own life', 'no reason to live', 'jump off',
        'slit my wrists', 'overdose'
    }
    if any(keyword in text.lower() for keyword in self_harm_keywords):
        result["sentiment"] = "Negative"
        result["confidence"] = 0.99

    result["emoji"] = get_emoji(result["sentiment"])

    # Emotions (NRCLex)
    nrc = NRCLex(text)
    # Handle both old API (raw_emotion_scores) and new API (affect_frequencies)
    raw_scores = getattr(nrc, 'raw_emotion_scores', None) or getattr(nrc, 'affect_frequencies', {})
    emotions = {k: v for k, v in raw_scores.items() if k not in ['positive', 'negative']}
    top_emotions = dict(sorted(emotions.items(), key=lambda item: item[1], reverse=True)[:3])
    result["emotions"] = top_emotions

    # SpaCy — NER + ABSA
    if nlp and result["language"] == "en":
        doc = nlp(text)

        entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]
        unique_entities = []
        seen = set()
        for e in entities:
            if e["text"].lower() not in seen:
                seen.add(e["text"].lower())
                unique_entities.append(e)
        result["entities"] = unique_entities[:5]

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

    # ── 8 Features
    result["sarcasm"]            = detect_sarcasm(text, polarity, result["emotions"])
    result["toxicity"]           = detect_toxicity(text)
    result["sentence_breakdown"] = sentence_breakdown(text)
    result["keyword_map"]        = keyword_sentiment_map(text)
    
    # New features
    result["subjectivity"]       = round(blob.sentiment.subjectivity, 2)
    result["readability"]        = calculate_readability(text)
    result["formality"]          = analyze_formality(text)
    result["intent"]             = detect_intent(text, polarity)

    return result
