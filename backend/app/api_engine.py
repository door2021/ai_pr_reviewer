from langchain_huggingface import HuggingFaceEndpoint
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.pydantic_v1 import BaseModel, Field
from typing import List, Dict, Any, Optional
import json
from app.config import settings
from app.schemas import AIAnalysis, FeedbackItem
import asyncio

class CodeIssue(BaseModel):
    severity: str = Field(description="high, medium, or low")
    message: str = Field(description="Description of the issue")
    line_number: Optional[int] = Field(description="Line number if applicable")
    suggestion: str = Field(description="How to fix the issue")

class CodeReview(BaseModel):
    summary: str = Field(description="Brief summary of changes")
    issues: List[CodeIssue] = Field(description="List of identified issues")
    suggestions: List[str] = Field(description="General improvement suggestions")
    safety_score: int = Field(description="0-100 safety score for auto-merge")
    ready_for_merge: bool = Field(description="Whether code is safe to merge")

class MergeDecision(BaseModel):
    should_merge: bool = Field(description="Whether to proceed with merge")
    reason: str = Field(description="Reason for decision")
    required_actions: List[str] = Field(description="Actions needed before merge")

class AIEngine:
    def __init__(self):
        self.llm = HuggingFaceEndpoint(
            repo_id=settings.HF_MODEL_NAME,
            huggingfacehub_api_token=settings.HF_TOKEN,
            task="text-generation",
            max_new_tokens=2000,
            temperature=0.2,
        )
        
        self.review_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert code reviewer with 20+ years of experience.
            Analyze code changes thoroughly and provide structured feedback.
            
            Focus on:
            1. Security vulnerabilities (critical)
            2. Bug potential (high priority)
            3. Performance issues
            4. Code quality and best practices
            5. Readability and maintainability
            
            Provide a safety score (0-100) for auto-merge consideration.
            Score below 70 = NOT safe for auto-merge.
            Score 70-85 = Review required before merge.
            Score 85+ = Safe for auto-merge.
            
            Return ONLY valid JSON matching the schema."""),
            ("human", """ORIGINAL CODE:
{original_code}

CODE DIFF:
{code_diff}

REPO: {repo_name}
BRANCH: {branch_name}

Analyze and return structured review.""")
        ])
        
        self.review_chain = self.review_prompt | self.llm | JsonOutputParser(pydantic_object=CodeReview)
        
        self.merge_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a release manager deciding whether to merge a PR.
            Consider:
            - Code review safety score
            - CI/CD status
            - Branch protection rules
            - Number of approvals needed
            
            Be conservative - when in doubt, require manual review."""),
            ("human", """REVIEW SUMMARY: {review_summary}
SAFETY SCORE: {safety_score}
CI_STATUS: {ci_status}
BRANCH: {branch_name}
REQUIRED_REVIEWS: {required_reviews}
CURRENT_APPROVALS: {current_approvals}

Decide whether to auto-merge.""")
        ])
        
        self.merge_chain = self.merge_prompt | self.llm | JsonOutputParser(pydantic_object=MergeDecision)
        
        self.improve_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a senior developer. Improve code based on review feedback.
            Return ONLY the improved code, no explanations."""),
            ("human", """ORIGINAL CODE:
{original_code}

REVIEW FEEDBACK:
{feedback}

Generate improved code with all suggestions applied.""")
        ])
        
        self.improve_chain = self.improve_prompt | self.llm | StrOutputParser()
    
    async def analyze_code(self, code_diff: str, original_code: str, 
                          repo_name: str = "", branch_name: str = "") -> AIAnalysis:
        try:
            review = await asyncio.to_thread(
                self.review_chain.invoke,
                {
                    "original_code": original_code,
                    "code_diff": code_diff,
                    "repo_name": repo_name,
                    "branch_name": branch_name
                }
            )
            
            issues = [
                FeedbackItem(
                    severity=issue.severity,
                    message=issue.message,
                    line_number=issue.line_number,
                    suggestion=issue.suggestion
                )
                for issue in review.issues
            ]
            
            return AIAnalysis(
                summary=review.summary,
                issues=issues,
                suggestions=review.suggestions,
                safety_score=review.safety_score,
                ready_for_merge=review.ready_for_merge
            )
            
        except Exception as e:
            return AIAnalysis(
                summary=f"Analysis encountered an error: {str(e)}",
                issues=[
                    FeedbackItem(
                        severity="high",
                        message="AI analysis failed. Manual review required.",
                        suggestion="Please review the code manually"
                    )
                ],
                suggestions=["Manual review required due to AI error"],
                safety_score=0,
                ready_for_merge=False
            )
    
    async def generate_reviewed_code(self, original_code: str, feedback: AIAnalysis) -> str:
        try:
            improved_code = await asyncio.to_thread(
                self.improve_chain.invoke,
                {
                    "original_code": original_code,
                    "feedback": feedback.summary + "\n" + 
                               "\n".join([f"- {i.message}" for i in feedback.issues])
                }
            )
            return improved_code.strip()
        except Exception as e:
            return f"# Error generating reviewed code: {str(e)}\n{original_code}"
    
    async def decide_merge(self, review: AIAnalysis, ci_status: str,
                          branch_name: str, required_reviews: int,
                          current_approvals: int) -> MergeDecision:
        try:
            decision = await asyncio.to_thread(
                self.merge_chain.invoke,
                {
                    "review_summary": review.summary,
                    "safety_score": review.safety_score,
                    "ci_status": ci_status,
                    "branch_name": branch_name,
                    "required_reviews": required_reviews,
                    "current_approvals": current_approvals
                }
            )
            return decision
        except Exception as e:
            return MergeDecision(
                should_merge=False,
                reason=f"Merge decision error: {str(e)}",
                required_actions=["Manual review required"]
            )
    
    async def chat_with_code(self, code: str, question: str, 
                            review_context: Optional[AIAnalysis] = None) -> str:
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful code assistant. Answer questions about code clearly."),
            ("human", "CODE:\n{code}\n\nREVIEW CONTEXT:\n{context}\n\nQUESTION:\n{question}")
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        
        try:
            response = await asyncio.to_thread(
                chain.invoke,
                {
                    "code": code,
                    "context": review_context.summary if review_context else "No review context",
                    "question": question
                }
            )
            return response.strip()
        except Exception as e:
            return f"Error: {str(e)}"

ai_engine = AIEngine()