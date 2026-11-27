"""Mock analysis tools for the market intelligence demo."""
import time
import random


def cross_reference(sources: list[dict]) -> dict:
    """Cross-reference multiple sources to extract key themes.

    Returns a structured analysis with themes, contradictions, and confidence scores.
    """
    time.sleep(random.uniform(2.0, 4.5))
    titles = [s.get("title", s.get("name", "Source")) for s in sources[:5]]
    return {
        "sources_analyzed": len(sources),
        "key_themes": [
            "Market growth driven by technology adoption",
            "Regulatory environment creating compliance overhead",
            "Consumer confidence trending positive",
            "Supply chain improvements reducing risk",
        ],
        "contradictions": [
            "Short-term cost pressures vs. long-term efficiency gains",
        ],
        "confidence_score": round(random.uniform(0.72, 0.91), 2),
        "coverage_gaps": [
            "Limited data on emerging market adoption rates",
            "Insufficient longitudinal data on regulatory impact",
        ],
        "source_titles": titles,
    }


def sentiment_score(text: str) -> dict:
    """Analyze sentiment of market-related text.

    Returns sentiment polarity, confidence, and key positive/negative signals.
    """
    time.sleep(random.uniform(0.5, 1.5))
    # Very simple keyword-based mock
    positive_words = {"growth", "increase", "improve", "high", "positive", "surge", "accelerate", "boom"}
    negative_words = {"decline", "risk", "barrier", "challenge", "shortage", "concern", "volatile", "gap"}
    words = set(text.lower().split())
    pos_count = len(words & positive_words)
    neg_count = len(words & negative_words)
    total = max(pos_count + neg_count, 1)
    polarity = (pos_count - neg_count) / total
    label = "positive" if polarity > 0.1 else ("negative" if polarity < -0.1 else "neutral")
    return {
        "sentiment": label,
        "polarity": round(polarity, 3),
        "confidence": round(random.uniform(0.68, 0.95), 2),
        "positive_signals": list(words & positive_words)[:4],
        "negative_signals": list(words & negative_words)[:4],
    }
