from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Bill, Category, CategoryType, User
from app.schemas import BillCreate, BillResponse, BillUpdate


router = APIRouter(prefix="/bills", tags=["bills"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _response(bill: Bill) -> BillResponse:
    return BillResponse(
        id=bill.id,
        name=bill.name,
        amount=bill.monthly_amount,
        frequency="One-time" if bill.frequency == "ONE_TIME" else "Recurring",
        due_day=bill.due_day,
    )


def _owned_bill(db: Session, user: User, bill_id: str) -> Bill:
    bill = db.scalar(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == user.id)
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


def _bill_category(db: Session, user: User, now: datetime) -> Category:
    category = db.scalar(
        select(Category).where(
            Category.user_id == user.id,
            Category.name == "Bills",
            Category.category_type == CategoryType.BILL.value,
        )
    )
    if category is None:
        category = Category(
            user_id=user.id,
            name="Bills",
            category_type=CategoryType.BILL.value,
            created_at=now,
            updated_at=now,
        )
        db.add(category)
        db.flush()
    return category


@router.get("", response_model=list[BillResponse])
def list_bills(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BillResponse]:
    bills = db.scalars(
        select(Bill)
        .where(Bill.user_id == current_user.id, Bill.is_active.is_(True))
        .order_by(Bill.created_at)
    ).all()
    return [_response(bill) for bill in bills]


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
def create_bill(
    payload: BillCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BillResponse:
    now = _utcnow()
    bill = Bill(
        user_id=current_user.id,
        category_id=_bill_category(db, current_user, now).id,
        name=payload.name,
        due_day=payload.due_day,
        monthly_amount=payload.amount,
        frequency="ONE_TIME" if payload.frequency == "One-time" else "RECURRING",
        created_at=now,
        updated_at=now,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _response(bill)


@router.put("/{bill_id}", response_model=BillResponse)
def update_bill(
    bill_id: str,
    payload: BillUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BillResponse:
    bill = _owned_bill(db, current_user, bill_id)
    bill.name = payload.name
    bill.due_day = payload.due_day
    bill.monthly_amount = payload.amount
    bill.frequency = "ONE_TIME" if payload.frequency == "One-time" else "RECURRING"
    bill.updated_at = _utcnow()
    db.commit()
    db.refresh(bill)
    return _response(bill)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(
    bill_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    bill = _owned_bill(db, current_user, bill_id)
    db.delete(bill)
    db.commit()
