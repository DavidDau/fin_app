from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import BudgetLine, Category, CategoryType, MonthlyPlan, User
from app.schemas import BudgetAllocationUpdate, SetupAllocationResponse


router = APIRouter(prefix="/budget", tags=["budget"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.put("/allocations", response_model=list[SetupAllocationResponse])
def update_allocations(
    payload: BudgetAllocationUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SetupAllocationResponse]:
    names = [allocation.name.strip().casefold() for allocation in payload.allocations]
    if len(names) != len(set(names)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Allocation names must be unique")
    plan = db.scalar(
        select(MonthlyPlan).where(
            MonthlyPlan.user_id == current_user.id,
            MonthlyPlan.month_start == payload.month_start,
        )
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly plan not found")

    now = _utcnow()
    db.execute(delete(BudgetLine).where(BudgetLine.monthly_plan_id == plan.id))
    result: list[SetupAllocationResponse] = []
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
        result.append(
            SetupAllocationResponse(
                name=category.name,
                amount=allocation.amount,
                category_id=category.id,
            )
        )
    plan.updated_at = now
    db.commit()
    return result
