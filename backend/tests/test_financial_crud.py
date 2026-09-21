import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models as _models
from app.bills import create_bill, delete_bill, list_bills, update_bill
from app.budget import update_allocations
from app.database import Base
from app.goals import add_contribution, create_goal, delete_goal, list_goals
from app.reports import monthly_summary
from app.setup import save_setup
from app.models import MonthlyPlan, User
from app.schemas import (
    BillCreate,
    BillUpdate,
    BudgetAllocationUpdate,
    ContributionCreate,
    GoalCreate,
    SetupRequest,
    TransactionCreate,
    TransactionUpdate,
)
from app.transactions import create_transaction, delete_transaction, update_transaction

del _models


class FinancialCrudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.session_factory = sessionmaker(bind=cls.engine)

    def setUp(self) -> None:
        self.db = self.session_factory()
        now = datetime.now(timezone.utc)
        self.user = User(
            email=f"{uuid4()}@example.com",
            password_hash="test",
            created_at=now,
            updated_at=now,
        )
        self.other_user = User(
            email=f"{uuid4()}@example.com",
            password_hash="test",
            created_at=now,
            updated_at=now,
        )
        self.db.add_all([self.user, self.other_user])
        self.db.flush()
        self.plan = MonthlyPlan(
            user_id=self.user.id,
            month_start=date(2026, 9, 1),
            opening_balance=Decimal("1000"),
            planned_income=Decimal("5000"),
            created_at=now,
            updated_at=now,
        )
        self.db.add(self.plan)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_transaction_crud_and_ownership(self) -> None:
        created = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 9, 20),
                transaction_type="EXPENSE",
                amount=Decimal("125"),
                category="Food",
                description="Lunch",
                need_want="NEED",
            ),
            self.user,
            self.db,
        )
        updated = update_transaction(
            created.id,
            TransactionUpdate(
                transaction_date=date(2026, 9, 20),
                transaction_type="EXPENSE",
                amount=Decimal("150"),
                category="Food",
                description="Dinner",
                need_want="WANT",
            ),
            self.user,
            self.db,
        )
        self.assertEqual(updated.description, "Dinner")
        with self.assertRaises(HTTPException) as error:
            delete_transaction(created.id, self.other_user, self.db)
        self.assertEqual(error.exception.status_code, 404)
        delete_transaction(created.id, self.user, self.db)

    def test_bill_crud_and_ownership(self) -> None:
        created = create_bill(
            BillCreate(name="Rent", amount=Decimal("800"), frequency="Recurring", due_day=1),
            self.user,
            self.db,
        )
        self.assertEqual(len(list_bills(self.user, self.db)), 1)
        updated = update_bill(
            created.id,
            BillUpdate(name="Rent", amount=Decimal("850"), frequency="Recurring", due_day=3),
            self.user,
            self.db,
        )
        self.assertEqual(updated.amount, Decimal("850.00"))
        with self.assertRaises(HTTPException):
            delete_bill(            created.id, self.other_user, self.db)
        delete_bill(        created.id, self.user, self.db)
        self.assertEqual(list_bills(self.user, self.db), [])

    def test_goal_contribution_and_ownership(self) -> None:
        goal = create_goal(
            GoalCreate(name="Emergency fund", target=Decimal("1000"), monthly=Decimal("100")),
            self.user,
            self.db,
        )
        contribution = add_contribution(
            goal.id,
            ContributionCreate(amount=Decimal("250"), contribution_date=date(2026, 9, 20)),
            self.user,
            self.db,
        )
        self.assertEqual(contribution.amount, Decimal("250.00"))
        self.assertEqual(list_goals(self.user, self.db)[0].current, Decimal("250.00"))
        with self.assertRaises(HTTPException):
            delete_goal(            goal.id, self.other_user, self.db)
        delete_goal(goal.id, self.user, self.db)

    def test_budget_allocations_are_replaced_for_selected_plan(self) -> None:
        allocations = update_allocations(
            BudgetAllocationUpdate(
                month_start=date(2026, 9, 1),
                allocations=[
                    {"name": "Food", "amount": Decimal("500")},
                    {"name": "Transport", "amount": Decimal("250")},
                ],
            ),
            self.user,
            self.db,
        )
        self.assertEqual({item.name for item in allocations}, {"Food", "Transport"})
        with self.assertRaises(HTTPException) as error:
            update_allocations(
                BudgetAllocationUpdate(
                    month_start=date(2026, 9, 1),
                    allocations=[
                        {"name": "Food", "amount": Decimal("500")},
                        {"name": " food ", "amount": Decimal("250")},
                    ],
                ),
                self.user,
                self.db,
            )
        self.assertEqual(error.exception.status_code, 422)

    def test_monthly_summary_uses_actual_cash_flow(self) -> None:
        create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 9, 20),
                transaction_type="INCOME",
                amount=Decimal("3000"),
                category="Salary",
                description="Received salary",
            ),
            self.user,
            self.db,
        )
        create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 9, 21),
                transaction_type="EXPENSE",
                amount=Decimal("750"),
                category="Food",
                description="Groceries",
                need_want="NEED",
            ),
            self.user,
            self.db,
        )
        goal = create_goal(
            GoalCreate(name="Emergency fund", target=Decimal("5000"), monthly=Decimal("500")),
            self.user,
            self.db,
        )
        add_contribution(
            goal.id,
            ContributionCreate(amount=Decimal("250"), contribution_date=date(2026, 9, 22)),
            self.user,
            self.db,
        )

        summary = monthly_summary(self.user, self.db, date(2026, 9, 1))

        self.assertEqual(summary.planned_income, Decimal("5000.00"))
        self.assertEqual(summary.actual_income, Decimal("3000.00"))
        self.assertEqual(summary.total_income, Decimal("3000.00"))
        self.assertEqual(summary.available_balance, Decimal("2000.00"))

    def test_setup_save_preserves_existing_bills_goals_and_contributions(self) -> None:
        bill = create_bill(
            BillCreate(name="Internet", amount=Decimal("100"), frequency="Recurring", due_day=5),
            self.user,
            self.db,
        )
        goal = create_goal(
            GoalCreate(name="Travel", target=Decimal("2000"), monthly=Decimal("200")),
            self.user,
            self.db,
        )
        add_contribution(
            goal.id,
            ContributionCreate(amount=Decimal("300"), contribution_date=date(2026, 9, 10)),
            self.user,
            self.db,
        )

        save_setup(
            SetupRequest(
                month_start=date(2026, 9, 1),
                opening_balance=Decimal("1000"),
                monthly_income=Decimal("5000"),
            ),
            self.user,
            self.db,
        )

        self.assertEqual(list_bills(self.user, self.db)[0].id, bill.id)
        saved_goal = list_goals(self.user, self.db)[0]
        self.assertEqual(saved_goal.id, goal.id)
        self.assertEqual(saved_goal.current, Decimal("300.00"))


if __name__ == "__main__":
    unittest.main()
