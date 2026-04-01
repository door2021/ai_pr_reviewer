"""
GitHub App Authentication Layer

Handles:
  - JWT generation (signed with app private key)
  - Installation access token (short-lived, per-repo token)
  - Token caching (tokens last 1hr, we cache for 55min)
  - Webhook signature verification

Auth flow:
  Your private key → JWT (10min) → Installation token (1hr) → API calls

Never use PAT tokens for GitHub App operations — always use installation tokens.
"""

import jwt as pyjwt
import time
import httpx
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Dict, Optional
from app.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# In-memory token cache: { installation_id: (token, expires_at) }
# ─────────────────────────────────────────────────────────────────────────────
_token_cache: Dict[int, tuple] = {}


def generate_jwt() -> str:
    """
    Generate a short-lived JWT signed with the GitHub App private key.
    Valid for 10 minutes — used only to get installation tokens.

    Requires in .env:
      GITHUB_APP_ID=123456
      GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----"
    """
    if not settings.GITHUB_APP_ID or not settings.GITHUB_APP_PRIVATE_KEY:
        raise ValueError("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set in .env")

    private_key = settings.GITHUB_APP_PRIVATE_KEY.replace("\\n", "\n")

    now = int(time.time())
    payload = {
        "iat": now - 60,      # issued 60s ago (clock drift buffer)
        "exp": now + (9 * 60), # expires in 9 minutes (max 10)
        "iss": str(settings.GITHUB_APP_ID),
    }

    return pyjwt.encode(payload, private_key, algorithm="RS256")


async def get_installation_token(installation_id: int) -> str:
    """
    Get a valid installation access token for a given installation.
    Tokens last 1 hour — we cache for 55 minutes to avoid edge cases.

    This is what you use to call the GitHub API on behalf of an installation.
    """
    # Check cache first
    if installation_id in _token_cache:
        token, expires_at = _token_cache[installation_id]
        if datetime.utcnow() < expires_at:
            return token

    # Generate fresh JWT and exchange for installation token
    jwt_token = generate_jwt()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {jwt_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        response.raise_for_status()
        data = response.json()

    token = data["token"]
    # Cache for 55 minutes (tokens last 60min, give 5min buffer)
    expires_at = datetime.utcnow() + timedelta(minutes=55)
    _token_cache[installation_id] = (token, expires_at)

    return token


async def get_app_installations() -> list:
    """List all installations of this GitHub App (which orgs/users installed it)"""
    jwt_token = generate_jwt()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/app/installations",
            headers={
                "Authorization": f"Bearer {jwt_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        response.raise_for_status()
        return response.json()


async def get_installation_repos(installation_id: int) -> list:
    """Get all repos accessible to a specific installation"""
    token = await get_installation_token(installation_id)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/installation/repositories",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={"per_page": 100},
        )
        response.raise_for_status()
        return response.json().get("repositories", [])


def verify_webhook_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """
    Verify the X-Hub-Signature-256 header that GitHub sends with every webhook.
    Always verify — never skip this in production.

    signature_header format: "sha256=abc123..."
    """
    if not settings.GITHUB_WEBHOOK_SECRET:
        return False  # fail closed

    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

    actual = signature_header[len("sha256="):]
    return hmac.compare_digest(expected, actual)