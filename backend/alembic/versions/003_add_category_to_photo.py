"""add category column to photos

Revision ID: 003
Revises: 002
Create Date: 2024-01-01 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("category", sa.String(50), nullable=True))
    op.create_index("ix_photos_category", "photos", ["category"])


def downgrade() -> None:
    op.drop_index("ix_photos_category", table_name="photos")
    op.drop_column("photos", "category")
