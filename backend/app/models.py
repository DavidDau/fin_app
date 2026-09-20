from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CategoryType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    BILL = "BILL"
    SAVING = "SAVING"
    DEBT = "DEBT"


class TransactionType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    BILL_PAYMENT = "BILL_PAYMENT"
    SAVING = "SAVING"
    DEBT_PAYMENT = "DEBT_PAYMENT"
    TRANSFER = "TRANSFER"


class NeedWant(str, enum.Enum):
    NEED = "NEED"
    WANT = "WANT"


class GoalStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


Money = Numeric(14, 2)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    settings: Mapped[UserSettings | None] = relationship(back_populates="user", uselist=False)
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(back_populates="user")
    categories: Mapped[list[Category]] = relationship(back_populates="user")
    monthly_plans: Mapped[list[MonthlyPlan]] = relationship(back_populates="user")
    transactions: Mapped[list[Transaction]] = relationship(back_populates="user")
    bills: Mapped[list[Bill]] = relationship(back_populates="user")
    goals: Mapped[list[Goal]] = relationship(back_populates="user")


class RefreshToken(TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="RWF")
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="en-RW")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Africa/Kigali")
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="system")

    user: Mapped[User] = relationship(back_populates="settings")


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", "category_type", name="uq_category_user_name_type"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category_type: Mapped[CategoryType] = mapped_column(String(30), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User] = relationship(back_populates="categories")
    subcategories: Mapped[list[Subcategory]] = relationship(back_populates="category")
    budget_lines: Mapped[list[BudgetLine]] = relationship(back_populates="category")


class Subcategory(TimestampMixin, Base):
    __tablename__ = "subcategories"
    __table_args__ = (UniqueConstraint("category_id", "name", name="uq_subcategory_category_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    category: Mapped[Category] = relationship(back_populates="subcategories")


class MonthlyPlan(TimestampMixin, Base):
    __tablename__ = "monthly_plans"
    __table_args__ = (UniqueConstraint("user_id", "month_start", name="uq_monthly_plan_user_month"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    month_start: Mapped[date] = mapped_column(Date, nullable=False)
    planned_income: Mapped[Decimal] = mapped_column(Money, nullable=False, default=0)
    opening_balance: Mapped[Decimal] = mapped_column(Money, nullable=False, default=0)

    user: Mapped[User] = relationship(back_populates="monthly_plans")
    income_sources: Mapped[list[IncomeSource]] = relationship(back_populates="monthly_plan")
    budget_lines: Mapped[list[BudgetLine]] = relationship(back_populates="monthly_plan")


class IncomeSource(TimestampMixin, Base):
    __tablename__ = "income_sources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monthly_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("monthly_plans.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    planned_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    __table_args__ = (CheckConstraint("planned_amount >= 0", name="ck_income_source_amount_non_negative"),)

    monthly_plan: Mapped[MonthlyPlan] = relationship(back_populates="income_sources")


class BudgetLine(TimestampMixin, Base):
    __tablename__ = "budget_lines"
    __table_args__ = (
        UniqueConstraint("monthly_plan_id", "category_id", name="uq_budget_line_plan_category"),
        CheckConstraint("planned_amount >= 0", name="ck_budget_line_amount_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monthly_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("monthly_plans.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    planned_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    allocation_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))

    monthly_plan: Mapped[MonthlyPlan] = relationship(back_populates="budget_lines")
    category: Mapped[Category] = relationship(back_populates="budget_lines")


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
        Index("ix_transactions_user_date", "user_id", "transaction_date"),
        Index("ix_transactions_user_category_date", "user_id", "category_id", "transaction_date"),
        Index("ix_transactions_user_type_date", "user_id", "transaction_type", "transaction_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(String(30), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subcategories.id"))
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    merchant: Mapped[str | None] = mapped_column(String(150))
    need_want: Mapped[NeedWant | None] = mapped_column(String(10))
    payment_method: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="transactions")


class Bill(TimestampMixin, Base):
    __tablename__ = "bills"
    __table_args__ = (
        CheckConstraint("due_day BETWEEN 1 AND 31", name="ck_bill_due_day_valid"),
        CheckConstraint("monthly_amount > 0", name="ck_bill_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subcategories.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    due_day: Mapped[int] = mapped_column(nullable=False)
    monthly_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="RECURRING")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User] = relationship(back_populates="bills")


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("target_amount > 0", name="ck_goal_target_positive"),
        CheckConstraint("monthly_target >= 0", name="ck_goal_monthly_target_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    goal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    monthly_target: Mapped[Decimal] = mapped_column(Money, nullable=False, default=0)
    status: Mapped[GoalStatus] = mapped_column(String(20), nullable=False, default=GoalStatus.ACTIVE)

    user: Mapped[User] = relationship(back_populates="goals")
    contributions: Mapped[list[GoalContribution]] = relationship(back_populates="goal")


class GoalContribution(TimestampMixin, Base):
    __tablename__ = "goal_contributions"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_goal_contribution_amount_positive"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transactions.id", ondelete="SET NULL"))
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    contribution_date: Mapped[date] = mapped_column(Date, nullable=False)

    goal: Mapped[Goal] = relationship(back_populates="contributions")
