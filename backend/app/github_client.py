import httpx
from typing import List, Dict, Optional, Tuple
from app.config import settings

class GitHubClient:
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json"
        }
    
    async def get_user(self) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/user", headers=self.headers)
            response.raise_for_status()
            return response.json()
    
    async def get_repos(self) -> List[Dict]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/user/repos",
                headers=self.headers,
                params={"per_page": 100}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_pull_requests(self, repo: str, state: str = "open") -> List[Dict]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls",
                headers=self.headers,
                params={"state": state}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_pr_diff(self, repo: str, pr_number: int) -> str:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}",
                headers=self.headers
            )
            response.raise_for_status()
            data = response.json()
            return data.get("diff_url", "")
    
    async def get_pr_details(self, repo: str, pr_number: int) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_ci_status(self, repo: str, pr_number: int) -> str:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/repos/{repo}/pulls/{pr_number}/statuses",
                    headers=self.headers
                )
                if response.status_code != 200:
                    return "unknown"
                
                statuses = response.json()
                if not statuses:
                    return "none"
                
                all_success = all(s["state"] == "success" for s in statuses)
                any_failure = any(s["state"] == "failure" for s in statuses)
                
                if any_failure:
                    return "failure"
                elif all_success:
                    return "success"
                else:
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
                    "required_approvals": data.get("required_pull_request_reviews", {}).get("required_approving_review_count", 1),
                    "require_ci": data.get("required_status_checks", {}).get("strict", False)
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
            body = {"event": "APPROVE"}
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
    
    async def merge_pr(self, repo: str, pr_number: int, 
                      commit_title: str = "", commit_message: str = "",
                      merge_method: str = "merge") -> Dict:
        async with httpx.AsyncClient() as client:
            body = {
                "merge_method": merge_method,
                "commit_title": commit_title,
                "commit_message": commit_message
            }
            
            response = await client.put(
                f"{self.base_url}/repos/{repo}/pulls/{pr_number}/merge",
                headers=self.headers,
                json=body
            )
            
            if response.status_code == 405:
                return {"error": "PR cannot be merged (conflicts or checks failing)"}
            
            response.raise_for_status()
            return response.json()
    
    async def verify_pr_ownership(self, repo: str, pr_number: int, 
                                  expected_branch: str) -> Tuple[bool, str]:
        try:
            pr_details = await self.get_pr_details(repo, pr_number)
            
            actual_branch = pr_details.get("head", {}).get("ref", "")
            if expected_branch and actual_branch != expected_branch:
                return False, f"Branch mismatch: expected {expected_branch}, got {actual_branch}"
            
            actual_repo = pr_details.get("head", {}).get("repo", {}).get("full_name", "")
            if actual_repo != repo:
                return False, f"Repo mismatch: expected {repo}, got {actual_repo}"
            
            return True, "Verified"
        except Exception as e:
            return False, f"Verification failed: {str(e)}"

def get_github_client(token: str) -> GitHubClient:
    return GitHubClient(token)