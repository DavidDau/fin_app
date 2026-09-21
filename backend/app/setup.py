from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Bill,
    BudgetLine,
    Category,
    CategoryType,
    Goal,
    GoalStatus,
    IncomeSource,
    MonthlyPlan,
    User,
)
from app.schemas import (
    SetupAllocationResponse,
    SetupBillResponse,
    SetupGoalResponse,
    SetupRequest,
    SetupResponse,
)


router = APIRouter(prefix="/setup", tags=["setup"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _response(db: Session, user: User, plan: MonthlyPlan) -> SetupResponse:
    allocations = db.execute(
        select(BudgetLine, Category)
        .join(Category, BudgetLine.category_id == Category.id)
        .where(BudgetLine.monthly_plan_id == plan.id)
    ).all()
    bills = db.scalars(select(Bill).where(Bill.user_id == user.id).order_by(Bill.created_at)).all()
    goals = db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at)).all()
    return SetupResponse(
        month_start=plan.month_start,
        opening_balance=plan.opening_balance,
        monthly_income=plan.planned_income,
        allocations=[
            SetupAllocationResponse(
                name=category.name,
                amount=budget_line.planned_amount,
                category_id=category.id,
            )
            for budget_line, category in allocations
        ],
        bills=[
            SetupBillResponse(
                id=bill.id,
                name=bill.name,
                amount=bill.monthly_amount,
                frequency="One-time" if bill.frequency == "ONE_TIME" else "Recurring",
            )
            for bill in bills
        ],
        goals=[
            SetupGoalResponse(
                id=goal.id,
                name=goal.name,
                target=goal.target_amount,
                monthly=goal.monthly_target,
            )
            for goal in goals
        ],
    )


@router.get("", response_model=SetupResponse | None)
def get_setup(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SetupResponse | None:
    plan = db.scalar(
        select(MonthlyPlan)
        .where(MonthlyPlan.user_id == current_user.id)
        .order_by(MonthlyPlan.month_start.desc())
    )
    return _response(db, current_user, plan) if plan else None


@router.put("", response_model=SetupResponse)
def save_setup(
    payload: SetupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SetupResponse:
    now = _utcnow()
    plan = db.scalar(
        select(MonthlyPlan).where(
            MonthlyPlan.user_id == current_user.id,
            MonthlyPlan.month_start == payload.month_start,
        )
    )
    if plan is None:
        plan = MonthlyPlan(
            user_id=current_user.id,
            month_start=payload.month_start,
            created_at=now,
            updated_at=now,
        )
        db.add(plan)
        db.flush()
    plan.opening_balance = payload.opening_balance
    plan.planned_income = payload.monthly_income
    plan.updated_at = now

    db.execute(delete(BudgetLine).where(BudgetLine.monthly_plan_id == plan.id))
    db.execute(delete(IncomeSource).where(IncomeSource.monthly_plan_id == plan.id))
    for allocation in payload.allocations:
        category = db.scalar(
            select(Category).where(
                Category.user_id == current_user.id,
                Category.name == allocation.name,
                Category.category_type == CategoryType.EXPENSE.value,
            )
        )
        if category is None:
            category = Category(
                user_id=current_user.id,
                name=allocation.name,
                category_type=CategoryType.EXPENSE.value,
                created_at=now,
                updated_at=now,
            )
            db.add(category)
            db.flush()
        db.add(
            BudgetLine(
                monthly_plan_id=plan.id,
                category_id=category.id,
                planned_amount=allocation.amount,
                created_at=now,
                updated_at=now,
            )
        )

    if payload.monthly_income > 0:
        db.add(
            IncomeSource(
                monthly_plan_id=plan.id,
                name="Monthly income",
                planned_amount=payload.monthly_income,
                created_at=now,
                updated_at=now,
            )
        )

    bill_category = db.scalar(
        select(Category).where(
            Category.user_id == current_user.id,
            Category.name == "Bills",
            Category.category_type == CategoryType.BILL.value,
        )
    )
    if payload.bills and bill_category is None:
        bill_category = Category(
            user_id=current_user.id,
            name="Bills",
            category_type=CategoryType.BILL.value,
            created_at=now,
            updated_at=now,
        )
        db.add(bill_category)
        db.flush()
    for bill in payload.bills:
        existing_bill = db.scalar(
            select(Bill).where(
                Bill.user_id == current_user.id,
                Bill.name == bill.name,
            )
        )
        if existing_bill is None:
            existing_bill = Bill(
                user_id=current_user.id,
                category_id=bill_category.id,
                name=bill.name,
                due_day=1,
                created_at=now,
            )
            db.add(existing_bill)
        existing_bill.monthly_amount = bill.amount
        existing_bill.frequency = "ONE_TIME" if bill.frequency == "One-time" else "RECURRING"
        existing_bill.updated_at = now

    for goal in payload.goals:
        existing_goal = db.scalar(
            select(Goal).where(
                Goal.user_id == current_user.id,
                Goal.name == goal.name,
            )
        )
        if existing_goal is None:
            existing_goal = Goal(
                user_id=current_user.id,
                name=goal.name,
                goal_type="SAVING",
                status=GoalStatus.ACTIVE.value,
                created_at=now,
            )
            db.add(existing_goal)
        existing_goal.target_amount = goal.target
        existing_goal.monthly_target = goal.monthly
        existing_goal.updated_at = now
    db.commit()
    db.refresh(plan)
    return _response(db, current_user, plan)
