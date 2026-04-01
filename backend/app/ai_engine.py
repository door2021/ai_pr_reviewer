"""
AI Engine — OpenRouter primary + Groq fallback.

Both are FREE with no credit card required:

  OpenRouter → https://openrouter.ai  (sign up, get API key, 50 req/day free)
    Free models: meta-llama/llama-3.3-70b-instruct:free
                 deepseek/deepseek-r1:free
                 qwen/qwen3-coder-480b-instruct:free

  Groq → https://console.groq.com  (14,400 req/day free, just email signup)
    Free model: llama-3.3-70b-versatile

Install:
  pip install openai   ← covers both providers (OpenAI-compatible APIs)
"""

import json
import asyncio
from typing import Optional

from app.config import settings
from app.schemas import AIAnalysis, FeedbackItem


# ── Prompt templates ──────────────────────────────────────────────────────────

REVIEW_SYSTEM_PROMPT = """You are a senior software engineer doing a thorough code review.

Analyze the code diff and return ONLY a valid JSON object. No markdown, no explanation, no backticks.

JSON schema:
{
  "summary": "2-3 sentence overview of what changed",
  "issues": [
    {
      "severity": "high|medium|low",
      "message": "clear description of the issue",
      "line_number": null,
      "suggestion": "how to fix it"
    }
  ],
  "suggestions": ["general improvement 1", "general improvement 2"],
  "safety_score": 85,
  "ready_for_merge": true
}

Safety score: 90-100=clean/merge, 70-89=minor issues, 50-69=needs work, 0-49=do not merge.
Focus on: security, bugs, performance, bad practices. Skip formatting nitpicks.
Return ONLY the JSON object."""


IMPROVE_SYSTEM_PROMPT = """You are a senior software engineer.
Given original code and review feedback, return ONLY the improved code with all fixes applied.
No explanation, no markdown fences, just raw improved code."""


PR_DESCRIPTION_SYSTEM = """You are a senior engineer writing clear PR descriptions.
Return ONLY a valid JSON object, no markdown, no backticks:
{
  "title": "concise PR title under 72 chars",
  "summary": "2-3 sentence overview of what this PR does and why",
  "changes": ["specific change 1", "specific change 2"],
  "testing": "how to test these changes",
  "notes": "any breaking changes, or empty string"
}"""


# ── Provider calls ────────────────────────────────────────────────────────────

def _get_async_client():
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI
    except ImportError:
        raise RuntimeError("Run: pip install openai")


async def _call_openrouter(system: str, user: str) -> str:
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    AsyncOpenAI = _get_async_client()
    client = AsyncOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "https://ai-pr-reviewer.app",
            "X-Title": "AI PR Reviewer",
        },
    )
    response = await client.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


async def _call_groq(system: str, user: str) -> str:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    AsyncOpenAI = _get_async_client()
    client = AsyncOpenAI(
        api_key=settings.GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


async def _generate(system: str, user: str) -> str:
    """Try OpenRouter first, auto-fallback to Groq on any error."""
    if settings.OPENROUTER_API_KEY:
        try:
            result = await _call_openrouter(system, user)
            print(f"[ai] OpenRouter OK ({settings.OPENROUTER_MODEL})")
            return result
        except Exception as e:
            print(f"[ai] OpenRouter failed: {e} — trying Groq")

    if settings.GROQ_API_KEY:
        try:
            result = await _call_groq(system, user)
            print(f"[ai] Groq OK ({settings.GROQ_MODEL})")
            return result
        except Exception as e:
            print(f"[ai] Groq failed: {e}")
            raise

    raise RuntimeError(
        "No AI provider configured. Add to .env:\n"
        "  OPENROUTER_API_KEY  (free at openrouter.ai)\n"
        "  GROQ_API_KEY        (free at console.groq.com)"
    )


# ── JSON parsing ──────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    cleaned = text.strip()
    if "```" in cleaned:
        lines = [l for l in cleaned.split("\n") if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start != -1 and end > start:
        cleaned = cleaned[start:end]
    return json.loads(cleaned)


# ── Public API ────────────────────────────────────────────────────────────────

class AIEngine:

    async def analyze_code(
        self,
        code_diff: str,
        original_code: str,
        repo_name: str = "",
        branch_name: str = "",
    ) -> AIAnalysis:
        if not code_diff and not original_code:
            return self._empty_analysis("No code provided.")

        user_prompt = (
            f"REPOSITORY: {repo_name or 'unknown'}\n"
            f"BRANCH: {branch_name or 'unknown'}\n\n"
            f"CODE DIFF:\n{code_diff[:12000]}"
        )
        if original_code and original_code != code_diff:
            user_prompt += f"\n\nORIGINAL FILE:\n{original_code[:3000]}"

        raw = ""
        try:
            raw = await _generate(REVIEW_SYSTEM_PROMPT, user_prompt)
            data = _parse_json(raw)
            issues = [
                FeedbackItem(
                    severity=i.get("severity", "low"),
                    message=i.get("message", ""),
                    line_number=i.get("line_number"),
                    suggestion=i.get("suggestion", ""),
                )
                for i in data.get("issues", [])
            ]
            return AIAnalysis(
                summary=data.get("summary", "Review completed."),
                issues=issues,
                suggestions=data.get("suggestions", []),
                safety_score=max(0, min(100, int(data.get("safety_score", 50)))),
                ready_for_merge=bool(data.get("ready_for_merge", False)),
            )
        except json.JSONDecodeError as e:
            print(f"[ai] JSON parse error: {e} | raw: {raw[:300]}")
            return self._error_analysis(f"AI returned invalid JSON: {e}")
        except Exception as e:
            print(f"[ai] analyze_code error: {e}")
            return self._error_analysis(str(e))

    async def generate_reviewed_code(self, original_code: str, feedback: AIAnalysis) -> str:
        if not original_code:
            return ""
        issues_text = "\n".join(
            f"- [{i.severity.upper()}] {i.message} -> {i.suggestion}"
            for i in feedback.issues
        ) or "No critical issues."
        user_prompt = (
            f"ORIGINAL CODE:\n{original_code[:8000]}\n\n"
            f"REVIEW SUMMARY: {feedback.summary}\n\n"
            f"ISSUES TO FIX:\n{issues_text}\n\n"
            f"Return the complete improved code."
        )
        try:
            return await _generate(IMPROVE_SYSTEM_PROMPT, user_prompt)
        except Exception as e:
            print(f"[ai] generate_reviewed_code error: {e}")
            return original_code

    async def generate_pr_description(self, code_diff: str) -> dict:
        if not code_diff:
            return {"title": "Update code", "summary": "", "changes": [], "testing": "", "notes": ""}
        user_prompt = f"CODE DIFF:\n{code_diff[:10000]}\n\nGenerate the PR description JSON."
        raw = ""
        try:
            raw = await _generate(PR_DESCRIPTION_SYSTEM, user_prompt)
            return _parse_json(raw)
        except Exception as e:
            print(f"[ai] generate_pr_description error: {e}")
            return {"title": "Code changes", "summary": "Could not auto-generate.", "changes": [], "testing": "Manual testing required.", "notes": str(e)}

    async def chat_with_code(self, code: str, question: str, review_context: Optional[AIAnalysis] = None) -> str:
        context = f"\nREVIEW SUMMARY: {review_context.summary}" if review_context else ""
        system = "You are a helpful code assistant. Answer questions clearly and concisely."
        user_prompt = f"CODE:\n{code[:6000]}{context}\n\nQUESTION: {question}"
        try:
            return await _generate(system, user_prompt)
        except Exception as e:
            return f"Error: {e}"

    @staticmethod
    def _empty_analysis(reason: str) -> AIAnalysis:
        return AIAnalysis(summary=reason, issues=[], suggestions=[], safety_score=0, ready_for_merge=False)

    @staticmethod
    def _error_analysis(error: str) -> AIAnalysis:
        return AIAnalysis(
            summary=f"AI review failed: {error}",
            issues=[FeedbackItem(severity="high", message="AI analysis failed — review manually.", suggestion="Check server logs.")],
            suggestions=["Manual review required."],
            safety_score=0,
            ready_for_merge=False,
        )


ai_engine = AIEngine()