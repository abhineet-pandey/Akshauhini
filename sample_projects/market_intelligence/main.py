"""
Market Intelligence Pipeline — Main Entrypoint

Runs the five-agent market research pipeline for a user-specified query and emits Akshauhini
telemetry so the agents can be watched live. This is the same pipeline as demo_run.py: search and
analysis tools are mock implementations and no LLM is called, so no API keys are needed.

Usage:
    python main.py --query "Electric vehicle market trends 2025"
    python main.py --query "AI enterprise adoption" --endpoint http://localhost:8765 --fast
"""
import argparse
import os
import sys
from pathlib import Path

# Allow running from any directory
sys.path.insert(0, str(Path(__file__).parent))

from demo_run import run_demo


if __name__ == "__main__":
    # A redirected stdout on Windows uses a legacy code page; never let a banner glyph crash the run.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Market Intelligence Multi-Agent Pipeline")
    parser.add_argument("--query", default="Global AI enterprise adoption trends 2025")
    parser.add_argument("--endpoint", default=os.getenv("AKSHAUHINI_ENDPOINT", "http://127.0.0.1:8765"))
    parser.add_argument("--fast", action="store_true", help="Run with 5x compressed timings")
    args = parser.parse_args()
    run_demo(args.query, args.endpoint, args.fast)
