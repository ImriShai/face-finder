"""convert primary keys to uuid4

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("detected_faces")
    op.drop_table("photos")

    op.create_table(
        "photos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_path", sa.String(500), nullable=False),
        sa.Column("thumbnail_path", sa.String(500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "detected_faces",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "photo_id",
            sa.Uuid(),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("face_index", sa.Integer, nullable=False),
        sa.Column("faiss_vector_id", sa.Integer, nullable=False, unique=True, index=True),
    )


def downgrade() -> None:
    op.drop_table("detected_faces")
    op.drop_table("photos")

    op.create_table(
        "photos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_path", sa.String(500), nullable=False),
        sa.Column("thumbnail_path", sa.String(500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "detected_faces",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "photo_id",
            sa.Integer,
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("face_index", sa.Integer, nullable=False),
        sa.Column("faiss_vector_id", sa.Integer, nullable=False, unique=True, index=True),
    )
