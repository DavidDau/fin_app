from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import BudgetLine, Category, Goal, GoalContribution, MonthlyPlan, Transaction, TransactionType, User
from app.schemas import MonthlyAllocationSummary, MonthlySummaryResponse


router = APIRouter(prefix="/reports", tags=["reports"])


def _month_end(month_start: date) -> date:
    return month_start.replace(day=monthrange(month_start.year, month_start.month)[1])


@router.get("/monthly-summary", response_model=MonthlySummaryResponse)
def monthly_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    month_start: date = Query(...),
) -> MonthlySummaryResponse:
    month_end = _month_end(month_start)
    plan = db.scalar(
        select(MonthlyPlan).where(
            MonthlyPlan.user_id == current_user.id,
            MonthlyPlan.month_start == month_start,
        )
    )
    opening_balance = plan.opening_balance if plan else Decimal("0")
    planned_income = plan.planned_income if plan else Decimal("0")

    actual_income = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == TransactionType.INCOME.value,
            Transaction.transaction_date.between(month_start, month_end),
        )
    ) or Decimal("0")
    total_expenses = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == TransactionType.EXPENSE.value,
            Transaction.transaction_date.between(month_start, month_end),
        )
    ) or Decimal("0")
    actual_savings = db.scalar(
        select(func.coalesce(func.sum(GoalContribution.amount), 0))
        .join(Goal, Goal.id == GoalContribution.goal_id)
        .where(
            Goal.user_id == current_user.id,
            GoalContribution.contribution_date.between(month_start, month_end),
        )
    ) or Decimal("0")

    allocations: list[MonthlyAllocationSummary] = []
    if plan:
        rows = db.execute(
            select(
                Category.name,
                BudgetLine.planned_amount,
                func.coalesce(
                    func.sum(
                        case(
                            (Transaction.transaction_type == TransactionType.EXPENSE.value, Transaction.amount),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .join(BudgetLine, BudgetLine.category_id == Category.id)
            .outerjoin(
                Transaction,
                (Transaction.category_id == Category.id)
                & (Transaction.user_id == current_user.id)
                & (Transaction.transaction_date.between(month_start, month_end)),
            )
            .where(BudgetLine.monthly_plan_id == plan.id)
            .group_by(Category.name, BudgetLine.planned_amount)
            .order_by(Category.name)
        ).all()
        allocations = [
            MonthlyAllocationSummary(name=name, planned=planned, spent=spent)
            for name, planned, spent in rows
        ]

    total_income = actual_income
    return MonthlySummaryResponse(
        month_start=month_start,
        opening_balance=opening_balance,
        planned_income=planned_income,
        actual_income=actual_income,
        total_income=total_income,
        total_expenses=total_expenses,
        available_balance=total_income - total_expenses - actual_savings,
        allocations=allocations,
    )
