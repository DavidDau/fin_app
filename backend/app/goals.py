from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Goal, GoalContribution, GoalStatus, User
from app.schemas import (
    ContributionCreate,
    ContributionResponse,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
)


router = APIRouter(prefix="/goals", tags=["goals"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _current(db: Session, goal: Goal) -> object:
    return db.scalar(
        select(func.coalesce(func.sum(GoalContribution.amount), 0))
        .where(GoalContribution.goal_id == goal.id)
    ) or 0


def _response(db: Session, goal: Goal) -> GoalResponse:
    current = _current(db, goal)
    return GoalResponse(
        id=goal.id,
        name=goal.name,
        target=goal.target_amount,
        monthly=goal.monthly_target,
        current=current,
        status=goal.status.value if hasattr(goal.status, "value") else goal.status,
    )


def _owned_goal(db: Session, user: User, goal_id: str) -> Goal:
    goal = db.scalar(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.get("", response_model=list[GoalResponse])
def list_goals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[GoalResponse]:
    goals = db.scalars(
        select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at)
    ).all()
    return [_response(db, goal) for goal in goals]


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GoalResponse:
    now = _utcnow()
    goal = Goal(
        user_id=current_user.id,
        name=payload.name,
        goal_type="SAVING",
        target_amount=payload.target,
        monthly_target=payload.monthly,
        status=GoalStatus.ACTIVE.value,
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _response(db, goal)


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: str,
    payload: GoalUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GoalResponse:
    goal = _owned_goal(db, current_user, goal_id)
    goal.name = payload.name
    goal.target_amount = payload.target
    goal.monthly_target = payload.monthly
    goal.updated_at = _utcnow()
    db.commit()
    db.refresh(goal)
    return _response(db, goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    goal = _owned_goal(db, current_user, goal_id)
    db.delete(goal)
    db.commit()


@router.post("/{goal_id}/contributions", response_model=ContributionResponse, status_code=status.HTTP_201_CREATED)
def add_contribution(
    goal_id: str,
    payload: ContributionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ContributionResponse:
    goal = _owned_goal(db, current_user, goal_id)
    contribution = GoalContribution(
        goal_id=goal.id,
        amount=payload.amount,
        contribution_date=payload.contribution_date,
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    return ContributionResponse(
        id=contribution.id,
        amount=contribution.amount,
        contribution_date=contribution.contribution_date,
    )
