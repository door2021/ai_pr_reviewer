import httpx
from typing import List, Dict, Optional, Tuple
from app.config import settings


class GitHubClient:
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_user(self) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/user", headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_repos(self) -> List[Dict]:
        """Get all repos the token has access to (owned + collaborator)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/user/repos",
                headers=self.headers,
                params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator"}
            )
            response.raise_for_status()
            return response.json()

    async def get_repo_details(self, repo_full_name: str) -> Dict:
        """Get details for a specific repo"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo_full_name}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def get_pull_requests(self, repo: str, state: str = "open") -> List[Dict]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls",
                headers=self.headers,
                params={"state": state, "per_page": 100}
            )
            response.raise_for_status()
            return response.json()

    async def get_pr_details(self, repo: str, pr_number: int) -> Dict:
        """Get full PR details including mergeable state"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def get_pr_diff(self, repo: str, pr_number: int) -> str:
        """Get the unified diff for a PR"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}",
                headers={**self.headers, "Accept": "application/vnd.github.v3.diff"}
            )
            response.raise_for_status()
            return response.text

    async def get_ci_status(self, repo: str, sha: str) -> str:
        """Check CI/check-run status for a commit SHA"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/repos/{repo}/commits/{sha}/check-runs",
                    headers=self.headers
                )
                if response.status_code != 200:
                    return "unknown"

                data = response.json()
                runs = data.get("check_runs", [])
                if not runs:
                    return "none"

                conclusions = [r.get("conclusion") for r in runs if r.get("conclusion")]
                if any(c == "failure" for c in conclusions):
                    return "failure"
                if all(c == "success" for c in conclusions):
                    return "success"
                return "pending"
        except Exception:
            return "unknown"

    async def get_branch_protection(self, repo: str, branch: str) -> Dict:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/repos/{repo}/branches/{branch}/protection",
                    headers=self.headers
                )
                if response.status_code == 404:
                    return {"protected": False}
                response.raise_for_status()
                data = response.json()
                return {
                    "protected": True,
                    "required_approvals": data.get("required_pull_request_reviews", {}).get(
                        "required_approving_review_count", 1
                    ),
                    "require_ci": data.get("required_status_checks", {}).get("strict", False),
                }
        except Exception:
            return {"protected": False}

    async def get_pr_approvals(self, repo: str, pr_number: int) -> int:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/repos/{repo}/pulls/{pr_number}/reviews",
                    headers=self.headers
                )
                response.raise_for_status()
                reviews = response.json()
                return sum(1 for r in reviews if r["state"] == "APPROVED")
        except Exception:
            return 0

    async def create_pr_comment(self, repo: str, pr_number: int, comment: str) -> Dict:
        """Post a comment on a PR (issue comment — visible in PR timeline)"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/repos/{repo}/issues/{pr_number}/comments",
                headers=self.headers,
                json={"body": comment}
            )
            response.raise_for_status()
            return response.json()

    async def approve_pr(self, repo: str, pr_number: int, comment: str = "") -> Dict:
        async with httpx.AsyncClient() as client:
            body: Dict = {"event": "APPROVE"}
            if comment:
                body["body"] = comment
            response = await client.post(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}/reviews",
                headers=self.headers,
                json=body
            )
            response.raise_for_status()
            return response.json()

    async def request_changes(self, repo: str, pr_number: int, comment: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}/reviews",
                headers=self.headers,
                json={"event": "REQUEST_CHANGES", "body": comment}
            )
            response.raise_for_status()
            return response.json()

    async def merge_pr(
        self,
        repo: str,
        pr_number: int,
        commit_title: str = "",
        commit_message: str = "",
        merge_method: str = "squash"
    ) -> Dict:
        """
        Merge a PR into the correct base branch of the correct repo.
        Uses the token from this client instance (correct account).
        """
        async with httpx.AsyncClient() as client:
            body = {
                "merge_method": merge_method,
            }
            if commit_title:
                body["commit_title"] = commit_title
            if commit_message:
                body["commit_message"] = commit_message

            response = await client.put(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}/merge",
                headers=self.headers,
                json=body
            )

            if response.status_code == 405:
                return {"error": "PR cannot be merged (conflicts, checks failing, or already merged)"}
            if response.status_code == 409:
                return {"error": "PR has a merge conflict — resolve before merging"}

            response.raise_for_status()
            return response.json()

    async def verify_pr_ownership(
        self, repo: str, pr_number: int, expected_branch: str
    ) -> Tuple[bool, str]:
        """Verify that a PR's head branch matches what we expect"""
        try:
            pr_details = await self.get_pr_details(repo, pr_number)
            actual_branch = pr_details.get("head", {}).get("ref", "")
            if expected_branch and actual_branch != expected_branch:
                return False, f"Branch mismatch: expected {expected_branch}, got {actual_branch}"
            actual_repo = pr_details.get("base", {}).get("repo", {}).get("full_name", "")
            if actual_repo and actual_repo != repo:
                return False, f"Repo mismatch: expected {repo}, got {actual_repo}"
            return True, "Verified"
        except Exception as e:
            return False, f"Verification failed: {str(e)}"


def get_github_client(token: str) -> GitHubClient:
    return GitHubClient(token)