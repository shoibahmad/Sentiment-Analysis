import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")
else:
    model = None
    print("Warning: GEMINI_API_KEY not set. AI features will be disabled.")


def get_sentiment_explanation(analysis: dict) -> str:
    """
    Generate a human-readable narrative explanation of a sentiment analysis result.
    """
    if not model:
        return "AI explanation unavailable (API key not configured)."

    sentiment = analysis.get("sentiment", "Neutral")
    confidence = round(analysis.get("confidence", 0) * 100)
    language = analysis.get("language", "unknown")
    emotions = analysis.get("emotions", {})
    entities = analysis.get("entities", [])
    text = analysis.get("text", "")

    top_emotions = ", ".join(
        [f"{k} ({v})" for k, v in sorted(emotions.items(), key=lambda x: -x[1])[:3]]
    ) if emotions else "none detected"

    entity_names = ", ".join([e.get("text", "") for e in entities[:3]]) if entities else "none detected"

    prompt = f"""You are an expert sentiment intelligence analyst. Analyze the following text and its NLP results, then write a concise, insightful 2–3 sentence explanation for the user. Be natural, conversational, and specific about what drives the sentiment.

Text: "{text}"
Sentiment: {sentiment} (Confidence: {confidence}%)
Language: {language}
Top Emotions: {top_emotions}
Named Entities: {entity_names}

Write only the explanation paragraph. With bullet points,  headings,  preamble."""

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini explain error: {e}")
        return f"This text carries a {sentiment.lower()} sentiment with {confidence}% confidence."


def get_tone_rewrites(text: str) -> dict:
    """
    Rewrite the given text in three different tones using Gemini.
    Returns a dict with keys: positive, neutral, formal
    """
    if not model:
        return {
            "positive": "AI rewriting unavailable.",
            "neutral": "AI rewriting unavailable.",
            "formal": "AI rewriting unavailable."
        }

    prompt = f"""Rewrite the following text in exactly 3 different tones. Return ONLY a valid JSON object with exactly these three keys: "positive", "neutral", "formal". Do not include any markdown formatting, code blocks, or extra text — just the raw JSON.

Original text: "{text}"

Rules:
- "positive": Rewrite with an optimistic, upbeat, and encouraging tone while keeping the core meaning.
- "neutral": Rewrite in a balanced, objective, and factual tone removing emotional language.
- "formal": Rewrite in a professional, polished, and corporate tone suitable for business communication.

Each rewrite should be roughly the same length as the original. Return raw JSON only."""

    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()
        # Strip markdown code fences if Gemini adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        import json
        rewrites = json.loads(raw.strip())
        return {
            "positive": rewrites.get("positive", ""),
            "neutral": rewrites.get("neutral", ""),
            "formal": rewrites.get("formal", "")
        }
    except Exception as e:
        print(f"Gemini rewrite error: {e}")
        return {
            "positive": text,
            "neutral": text,
            "formal": text
        }


def get_bulk_summary(results: list) -> str:
    """
    Generate a concise executive summary for a list of analysis results.
    """
    if not model:
        return "AI executive summary unavailable."

    # Prepare a condensed summary of stats for Gemini
    pos = sum(1 for r in results if r["sentiment"] == "Positive")
    neg = sum(1 for r in results if r["sentiment"] == "Negative")
    neu = sum(1 for r in results if r["sentiment"] == "Neutral")
    total = len(results)

    # Sample some key texts (first few and last few to stay within prompt limits)
    sample_size = min(10, total)
    samples = []
    for r in results[:5] + (results[-5:] if total > 5 else []):
        samples.append(f"- [{r['sentiment']}] {r['text'][:100]}...")

    prompt = f"""You are a high-level data analyst. Analyze the following bulk sentiment data and provide a concise 'Executive Summary' (2-3 sentences max). 
Identify the overall mood and highlight the key drivers (if any trends are visible in the samples).

Stats:
- Total Analyzed: {total}
- Positive: {pos}
- Negative: {neg}
- Neutral: {neu}

Sample Texts:
{chr(10).join(samples)}

Write only the summary paragraph. Do not use bullet points or headings."""

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini bulk summary error: {e}")
        return f"Batch analysis of {total} items completed. {pos} positive, {neg} negative, and {neu} neutral results found."

