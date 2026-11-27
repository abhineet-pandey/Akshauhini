"""Mock search and web-scraping tools for the market intelligence demo."""
import time
import random

# Canned search results keyed by topic keyword
_RESULTS: dict[str, list[dict]] = {
    "default": [
        {"title": "Global Market Outlook Q1 2025", "url": "https://example.com/outlook", "snippet": "Leading analysts forecast 8.3% growth across technology sectors through 2025."},
        {"title": "Competitive Landscape Analysis", "url": "https://example.com/competitive", "snippet": "Three major players control 62% of the addressable market; consolidation expected."},
        {"title": "Consumer Sentiment Report", "url": "https://example.com/sentiment", "snippet": "Consumer confidence reached a 3-year high in Q4 2024, with 74% expressing intent to buy."},
        {"title": "Regulatory Environment Update", "url": "https://example.com/regulatory", "snippet": "New compliance requirements effective March 2025 will reshape go-to-market strategies."},
        {"title": "Supply Chain Resilience Index", "url": "https://example.com/supply", "snippet": "Regional diversification efforts reduce single-point dependency risk by 31%."},
    ],
    "electric": [
        {"title": "EV Adoption Accelerates in 2025", "url": "https://example.com/ev", "snippet": "Global EV sales surpassed 18 million units, a 34% increase year-over-year."},
        {"title": "Battery Technology Breakthrough", "url": "https://example.com/battery", "snippet": "Solid-state batteries promise 60% longer range at comparable cost by 2026."},
        {"title": "Charging Infrastructure Gap", "url": "https://example.com/charging", "snippet": "Public fast-charger availability remains the #1 barrier cited by potential buyers."},
        {"title": "Major OEM Investment Plans", "url": "https://example.com/oem", "snippet": "Ford, GM, and Volkswagen collectively pledged $85B in EV-specific capex through 2027."},
        {"title": "Grid Impact Assessment", "url": "https://example.com/grid", "snippet": "Smart charging rollouts could offset 70% of peak load increases from mass EV adoption."},
    ],
    "ai": [
        {"title": "Enterprise AI Adoption 2025 Report", "url": "https://example.com/ai-report", "snippet": "87% of Fortune 500 companies have at least one production AI workload."},
        {"title": "Generative AI Market Size", "url": "https://example.com/genai", "snippet": "The GenAI market is projected to reach $1.3T by 2032, growing at 42% CAGR."},
        {"title": "AI Regulation Landscape", "url": "https://example.com/ai-reg", "snippet": "The EU AI Act and US executive orders are setting global compliance baselines."},
        {"title": "Open-Source vs. Proprietary Models", "url": "https://example.com/open-vs-prop", "snippet": "Open-weight models close capability gap with proprietary counterparts for most enterprise tasks."},
        {"title": "Compute Cost Trends", "url": "https://example.com/compute", "snippet": "Inference costs fell 85% over 18 months; training costs remain the primary bottleneck."},
    ],
}


def web_search(query: str, num_results: int = 5) -> list[dict]:
    """Simulate a web search. Returns canned results with realistic delay."""
    time.sleep(random.uniform(1.5, 3.0))
    # Pick result set based on keywords in query
    for key in _RESULTS:
        if key in query.lower():
            return _RESULTS[key][:num_results]
    return _RESULTS["default"][:num_results]


def scrape_page(url: str) -> dict:
    """Simulate scraping a page. Returns extended content with realistic delay."""
    time.sleep(random.uniform(0.8, 2.0))
    return {
        "url": url,
        "title": "Retrieved article from " + url.split("/")[-1].replace("-", " ").title(),
        "content": (
            "This article provides an in-depth analysis of current market dynamics. "
            "Key findings include: (1) market penetration has reached 23% in Q4 2024, "
            "up from 14% in the same period last year; (2) price sensitivity remains "
            "the primary barrier for mainstream adoption; (3) three emerging segments "
            "show above-average growth potential — enterprise, SMB, and prosumer markets. "
            "Analysts from leading firms recommend a diversified positioning strategy."
        ),
        "word_count": 412,
        "published": "2025-01-15",
    }
