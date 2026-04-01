"""
Stripe Billing Router — subscriptions, webhooks, portal

Endpoints:
  POST /billing/create-checkout   → start a Stripe Checkout session
  POST /billing/create-portal     → open customer billing portal (manage/cancel)
  GET  /billing/subscription      → get current subscription status
  POST /billing/webhook           → Stripe webhook handler (no auth)

Plans (defined in .env via STRIPE_PRICE_*):
  free   → $0  — 10 reviews/month, 1 repo
  solo   → $9  — unlimited reviews, 5 repos
  team   → $29 — team features, Slack, trends
  pro    → $59 — security mode, multi-model, unlimited

Usage:
  pip install stripe
"""

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/billing", tags=["Billing"])

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


# ─────────────────────────────────────────────────────────────────────────────
# Plan definitions — maps plan name → Stripe Price ID from .env
# ─────────────────────────────────────────────────────────────────────────────

PLANS = {
    "solo": {
        "name": "Solo",
        "price": "$9/month",
        "price_id": settings.STRIPE_PRICE_SOLO,
        "features": [
            "Unlimited PR reviews",
            "5 repositories",
            "AI PR descriptions",
            "Review history 30 days",
        ],
    },
    "team": {
        "name": "Team",
        "price": "$29/month",
        "price_id": settings.STRIPE_PRICE_TEAM,
        "features": [
            "Everything in Solo",
            "Unlimited repositories",
            "Team rules engine",
            "Slack integration",
            "Trends dashboard",
            "5 seats included",
        ],
    },
    "pro": {
        "name": "Pro",
        "price": "$59/month",
        "price_id": settings.STRIPE_PRICE_PRO,
        "features": [
            "Everything in Team",
            "Security-focused review mode",
            "Multi-model consensus reviews",
            "Jira / Linear integration",
            "Unlimited seats",
            "Priority support",
        ],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str          # "solo" | "team" | "pro"
    success_url: str   # where to redirect after successful payment
    cancel_url: str    # where to redirect if user cancels


class PortalRequest(BaseModel):
    return_url: str    # where to return after managing subscription


# ─────────────────────────────────────────────────────────────────────────────
# Helper: get or create Stripe customer for a user
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_customer(user: User, db: Session) -> str:
    """Return existing Stripe customer ID or create a new one."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name or user.email,
        metadata={"user_id": str(user.id), "app": "ai-pr-reviewer"},
    )
    user.stripe_customer_id = customer.id
    db.commit()
    return customer.id


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/plans")
async def get_plans():
    """Return all available subscription plans (public)"""
    return {
        "free": {
            "name": "Free",
            "price": "$0/month",
            "price_id": None,
            "features": [
                "10 PR reviews/month",
                "1 repository",
                "Basic AI review",
            ],
        },
        **PLANS,
    }


@router.get("/subscription")
async def get_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's subscription status"""
    if not current_user.stripe_customer_id:
        return {
            "plan": "free",
            "status": "active",
            "current_period_end": None,
            "cancel_at_period_end": False,
        }

    try:
        subscriptions = stripe.Subscription.list(
            customer=current_user.stripe_customer_id,
            status="active",
            limit=1,
        )
        if not subscriptions.data:
            # Also check for trialing
            trialing = stripe.Subscription.list(
                customer=current_user.stripe_customer_id,
                status="trialing",
                limit=1,
            )
            if not trialing.data:
                return {"plan": "free", "status": "active", "current_period_end": None, "cancel_at_period_end": False}
            sub = trialing.data[0]
        else:
            sub = subscriptions.data[0]

        price_id = sub["items"]["data"][0]["price"]["id"]
        plan_name = _price_id_to_plan(price_id)

        return {
            "plan": plan_name,
            "status": sub["status"],
            "current_period_end": sub["current_period_end"],
            "cancel_at_period_end": sub["cancel_at_period_end"],
            "stripe_subscription_id": sub["id"],
        }
    except stripe.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")


@router.post("/create-checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session for a subscription.
    Returns { checkout_url } — redirect the user there.
    """
    plan = request.plan.lower()
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan '{plan}'. Choose: solo, team, pro")

    price_id = PLANS[plan]["price_id"]
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Stripe Price ID not configured for '{plan}'. Set STRIPE_PRICE_{plan.upper()} in .env")

    try:
        customer_id = _get_or_create_customer(current_user, db)

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=request.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=request.cancel_url,
            metadata={
                "user_id": str(current_user.id),
                "plan": plan,
            },
            subscription_data={
                "metadata": {
                    "user_id": str(current_user.id),
                    "plan": plan,
                }
            },
            allow_promotion_codes=True,  # lets users enter coupon codes
        )

        return {"checkout_url": session.url, "session_id": session.id}

    except stripe.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create checkout: {str(e)}")


@router.post("/create-portal")
async def create_billing_portal(
    request: PortalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a Stripe Customer Portal session.
    User can update card, cancel, or change plan from there.
    Returns { portal_url }
    """
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found")

    try:
        session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=request.return_url,
        )
        return {"portal_url": session.url}
    except stripe.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to open billing portal: {str(e)}")


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Stripe webhook — handles subscription lifecycle events.
    No JWT auth — Stripe calls this directly.
    Verified via Stripe-Signature header.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

    event_type = event["type"]
    print(f"[billing] Stripe event: {event_type}")

    # ── Subscription activated / renewed ─────────────────────────────────────
    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        price_id = sub["items"]["data"][0]["price"]["id"]
        plan = _price_id_to_plan(price_id)
        status = sub["status"]

        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.subscription_plan = plan if status in ("active", "trialing") else "free"
            user.subscription_status = status
            user.stripe_subscription_id = sub["id"]
            db.commit()
            print(f"[billing] User {user.id} → plan={plan}, status={status}")

    # ── Subscription cancelled / expired ─────────────────────────────────────
    elif event_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub["customer"]

        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.subscription_plan = "free"
            user.subscription_status = "canceled"
            user.stripe_subscription_id = None
            db.commit()
            print(f"[billing] User {user.id} subscription cancelled → free plan")

    # ── Payment failed ────────────────────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice["customer"]
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.subscription_status = "past_due"
            db.commit()
            print(f"[billing] Payment failed for user {user.id}")

    # ── Checkout completed ────────────────────────────────────────────────────
    elif event_type == "checkout.session.completed":
        session_obj = event["data"]["object"]
        user_id = session_obj.get("metadata", {}).get("user_id")
        plan = session_obj.get("metadata", {}).get("plan", "solo")
        customer_id = session_obj.get("customer")

        if user_id:
            user = db.query(User).filter(User.id == int(user_id)).first()
            if user and customer_id:
                user.stripe_customer_id = customer_id
                user.subscription_plan = plan
                user.subscription_status = "active"
                db.commit()
                print(f"[billing] Checkout completed: user {user_id} → {plan}")

    return {"received": True}


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _price_id_to_plan(price_id: str) -> str:
    """Reverse-lookup plan name from Stripe Price ID."""
    for plan_name, plan_data in PLANS.items():
        if plan_data["price_id"] == price_id:
            return plan_name
    return "unknown"