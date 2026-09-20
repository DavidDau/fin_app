from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str | None
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthenticatedUserResponse(UserResponse):
    pass


class SetupAllocation(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class SetupBill(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    frequency: Literal["One-time", "Recurring"]


class SetupGoal(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    target: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    monthly: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class SetupRequest(BaseModel):
    month_start: date
    opening_balance: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    monthly_income: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    allocations: list[SetupAllocation] = Field(default_factory=list, max_length=50)
    bills: list[SetupBill] = Field(default_factory=list, max_length=50)
    goals: list[SetupGoal] = Field(default_factory=list, max_length=50)


class SetupAllocationResponse(SetupAllocation):
    category_id: UUID


class SetupBillResponse(SetupBill):
    id: UUID


class BillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    frequency: Literal["One-time", "Recurring"]
    due_day: int = Field(default=1, ge=1, le=31)


class BillResponse(BillCreate):
    id: UUID


class BillUpdate(BillCreate):
    pass


class SetupGoalResponse(SetupGoal):
    id: UUID


class SetupResponse(BaseModel):
    month_start: date
    opening_balance: Decimal
    monthly_income: Decimal
    allocations: list[SetupAllocationResponse]
    bills: list[SetupBillResponse]
    goals: list[SetupGoalResponse]


class TransactionCreate(BaseModel):
    transaction_date: date
    transaction_type: Literal["INCOME", "EXPENSE"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=255)
    need_want: Literal["NEED", "WANT"] | None = None


class TransactionUpdate(TransactionCreate):
    pass


class TransactionResponse(BaseModel):
    id: UUID
    transaction_date: date
    transaction_type: Literal["INCOME", "EXPENSE"]
    amount: Decimal
    category: str
    description: str
    need_want: Literal["NEED", "WANT"] | None


class MonthlyAllocationSummary(BaseModel):
    name: str
    planned: Decimal
    spent: Decimal


class MonthlySummaryResponse(BaseModel):
    month_start: date
    opening_balance: Decimal
    planned_income: Decimal
    actual_income: Decimal
    total_income: Decimal
    total_expenses: Decimal
    available_balance: Decimal
    allocations: list[MonthlyAllocationSummary]
