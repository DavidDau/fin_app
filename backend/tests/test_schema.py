import unittest
from decimal import Decimal

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models  # pyright: ignore[reportUnusedImport]
from app.models import Bill, MonthlyPlan


class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.inspector = inspect(cls.engine)
        cls.session_factory = sessionmaker(bind=cls.engine)

    def test_all_financial_tables_exist(self) -> None:
        expected = {
            "users",
            "user_settings",
            "refresh_tokens",
            "categories",
            "subcategories",
            "monthly_plans",
            "income_sources",
            "budget_lines",
            "transactions",
            "bills",
            "goals",
            "goal_contributions",
        }
        self.assertTrue(expected.issubset(set(self.inspector.get_table_names())))

    def test_money_columns_use_decimal_precision(self) -> None:
        for table_name, column_name in (
            ("monthly_plans", "planned_income"),
            ("transactions", "amount"),
            ("bills", "monthly_amount"),
            ("goals", "target_amount"),
            ("goal_contributions", "amount"),
        ):
            column = next(column for column in self.inspector.get_columns(table_name) if column["name"] == column_name)
            self.assertEqual(column["type"].precision, 14)
            self.assertEqual(column["type"].scale, 2)

    def test_required_constraints_are_declared(self) -> None:
        transaction_checks = {
            check["name"] for check in self.inspector.get_check_constraints("transactions")
        }
        bill_checks = {check["name"] for check in self.inspector.get_check_constraints("bills")}
        self.assertIn("ck_transaction_amount_positive", transaction_checks)
        self.assertIn("ck_bill_due_day_valid", bill_checks)

    def test_model_defaults_preserve_decimal_values(self) -> None:
        self.assertEqual(MonthlyPlan.__table__.c.planned_income.default.arg, 0)
        self.assertEqual(Bill.__table__.c.monthly_amount.type.python_type, Decimal)


if __name__ == "__main__":
    unittest.main()
