"""Independent one-time account recovery codes, including password-only accounts."""
from alembic import op
import sqlalchemy as sa

revision = "0008_account_recovery"
down_revision = "0007_email_codes"
branch_labels = None
depends_on = None


def upgrade():
    # The initial migration creates current model metadata on fresh installs.
    if "account_recovery_codes" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("account_recovery_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_account_recovery_codes_user_id", "account_recovery_codes", ["user_id"])


def downgrade():
    op.drop_table("account_recovery_codes")
