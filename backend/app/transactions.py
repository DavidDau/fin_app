from calendar import monthrange
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Category, CategoryType, Transaction, TransactionType, User
from app.schemas import TransactionCreate, TransactionResponse


router = APIRouter(prefix="/transactions", tags=["transactions"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _response(transaction: Transaction, category: Category) -> TransactionResponse:
    transaction_type = transaction.transaction_type.value if isinstance(transaction.transaction_type, TransactionType) else transaction.transaction_type
    need_want = transaction.need_want.value if hasattr(transaction.need_want, "value") else transaction.need_want
    return TransactionResponse(
        id=transaction.id,
        transaction_date=transaction.transaction_date,
        transaction_type=transaction_type,
        amount=transaction.amount,
        category=category.name,
        description=transaction.description or "",
        need_want=need_want,
    )


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    month_start: date | None = Query(default=None),
) -> list[TransactionResponse]:
    statement = (
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
    )
    if month_start:
        month_end = month_start.replace(day=monthrange(month_start.year, month_start.month)[1])
        statement = statement.where(Transaction.transaction_date.between(month_start, month_end))
    return [_response(transaction, category) for transaction, category in db.execute(statement).all()]


@router.post("", response_model=TransactionResponse, status_code=201)
def create_transaction(
    payload: TransactionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TransactionResponse:
    now = _utcnow()
    category_type = CategoryType.INCOME.value if payload.transaction_type == "INCOME" else CategoryType.EXPENSE.value
    category = db.scalar(
        select(Category).where(
            Category.user_id == current_user.id,
            Category.name == payload.category,
            Category.category_type == category_type,
        )
    )
    if category is None:
        category = Category(
            user_id=current_user.id,
            name=payload.category,
            category_type=category_type,
            created_at=now,
            updated_at=now,
        )
        db.add(category)
        db.flush()
    transaction = Transaction(
        user_id=current_user.id,
        transaction_date=payload.transaction_date,
        transaction_type=payload.transaction_type,
        category_id=category.id,
        amount=payload.amount,
        description=payload.description,
        need_want=payload.need_want,
        created_at=now,
        updated_at=now,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return _response(transaction, category)
