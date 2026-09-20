"""add bill frequency

Revision ID: c32c0a2f1f4d
Revises: 8b8b283e90ed
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c32c0a2f1f4d"
down_revision: Union[str, None] = "8b8b283e90ed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("frequency", sa.String(length=20), nullable=False, server_default="RECURRING"))
    op.alter_column("bills", "frequency", server_default=None)


def downgrade() -> None:
    op.drop_column("bills", "frequency")
