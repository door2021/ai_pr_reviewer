from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional
from typing_extensions import TypedDict
from app.ai_engine import ai_engine
from app.schemas import AIAnalysis, MergeDecision
from app.config import settings

class PRReviewState(TypedDict):
    review_id: int
    pr_url: str
    repo_name: str
    pr_number: int
    branch_name: str
    code_diff: str
    original_code: str
    review: Optional[AIAnalysis]
    reviewed_code: Optional[str]
    merge_decision: Optional[MergeDecision]
    ci_status: str
    current_approvals: int
    required_approvals: int
    status: str
    errors: List[str]

async def analyze_code_node(state: PRReviewState) -> PRReviewState:
    try:
        review = await ai_engine.analyze_code(
            code_diff=state["code_diff"],
            original_code=state["original_code"],
            repo_name=state["repo_name"],
            branch_name=state["branch_name"]
        )
        return {"review": review, "status": "analyzed"}
    except Exception as e:
        return {"errors": [f"Analysis failed: {str(e)}"], "status": "failed"}

async def generate_improvements_node(state: PRReviewState) -> PRReviewState:
    try:
        if state.get("review"):
            reviewed_code = await ai_engine.generate_reviewed_code(
                original_code=state["original_code"],
                feedback=state["review"]
            )
            return {"reviewed_code": reviewed_code}
        return {}
    except Exception as e:
        return {"errors": [f"Code generation failed: {str(e)}"]}

async def check_safety_node(state: PRReviewState) -> PRReviewState:
    try:
        review = state.get("review")
        if not review:
            return {"errors": ["No review available"], "status": "failed"}
        
        is_protected = state["branch_name"] in settings.PROTECTED_BRANCHES
        ci_passing = state["ci_status"] == "success"
        has_approvals = state["current_approvals"] >= state["required_approvals"]
        safety_ok = review.safety_score >= 85
        
        should_merge = (
            safety_ok and 
            (not is_protected or (ci_passing and has_approvals))
        )
        
        decision = MergeDecision(
            should_merge=should_merge,
            reason=f"Safety:{review.safety_score}, CI:{state['ci_status']}, Approvals:{state['current_approvals']}/{state['required_approvals']}",
            required_actions=[] if should_merge else ["Manual review required"]
        )
        
        return {"merge_decision": decision, "status": "safety_checked"}
    except Exception as e:
        return {"errors": [f"Safety check failed: {str(e)}"], "status": "failed"}

async def execute_merge_node(state: PRReviewState) -> PRReviewState:
    try:
        if not state.get("merge_decision") or not state["merge_decision"].should_merge:
            return {"status": "merge_skipped"}
        return {"status": "merge_ready"}
    except Exception as e:
        return {"errors": [f"Merge failed: {str(e)}"], "status": "failed"}

def should_continue_after_analysis(state: PRReviewState) -> str:
    if state.get("errors"):
        return "end"
    return "generate"

def should_merge(state: PRReviewState) -> str:
    if state.get("errors"):
        return "end"
    if state.get("merge_decision") and state["merge_decision"].should_merge:
        return "merge"
    return "end"

def create_pr_review_workflow():
    workflow = StateGraph(PRReviewState)
    
    workflow.add_node("analyze", analyze_code_node)
    workflow.add_node("generate", generate_improvements_node)
    workflow.add_node("safety_check", check_safety_node)
    workflow.add_node("merge", execute_merge_node)
    
    workflow.set_entry_point("analyze")
    
    workflow.add_conditional_edges(
        "analyze",
        should_continue_after_analysis,
        {
            "generate": "generate",
            "end": END
        }
    )
    
    workflow.add_edge("generate", "safety_check")
    
    workflow.add_conditional_edges(
        "safety_check",
        should_merge,
        {
            "merge": "merge",
            "end": END
        }
    )
    
    workflow.add_edge("merge", END)
    
    return workflow.compile()

pr_review_workflow = create_pr_review_workflow()