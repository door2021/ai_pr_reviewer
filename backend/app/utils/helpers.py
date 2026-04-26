from typing import Optional, Tuple
import re

def parse_github_pr_url(url: str) -> Tuple[Optional[str], Optional[int]]:
    pattern = r"github\.com/([^/]+/[^/]+)/pull/(\d+)"
    match = re.search(pattern, url)
    if match:
        return match.group(1), int(match.group(2))
    return None, None

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def truncate_string(text: str, max_length: int = 100) -> str:
    if len(text) <= max_length:
        return text
    return text[:max_length-3] + "..."