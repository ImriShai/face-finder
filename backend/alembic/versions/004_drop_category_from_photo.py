"""drop category column from photos

Revision ID: 004
Revises: 003
Create Date: 2026-07-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_photos_category", table_name="photos")
    op.drop_column("photos", "category")


def downgrade() -> None:
    op.add_column("photos", sa.Column("category", sa.String(50), nullable=True))
    op.create_index("ix_photos_category", "photos", ["category"])
