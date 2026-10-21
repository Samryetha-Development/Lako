"""Account recovery is separate from second-factor recovery: losing TOTP settings
must not silently invalidate a password-only account's saved recovery file.
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.authentication.email_routes import _revoke_sessions, _set_password
from app.authentication.mfa_service import active_totp, normalize_recovery_code, recovery_code
from app.authentication.service import audit, authenticate
from app.common.client_ip import client_ip
from app.common.database import get_db
from app.common.errors import ApiError
from app.common.models import AccountRecoveryCode, Identity, IdentityType, User, UserStatus
from app.common.ratelimit import check
from app.security.core import normalize_username, token_hash
from app.security.csrf import require_csrf
from app.security.stepup import require_recent_aal2
from app.sessions.dependencies import AuthContext, require_auth

router = APIRouter(tags=["account recovery"])


async def replace_codes(db: AsyncSession, user_id) -> list[str]:
    await db.execute(delete(AccountRecoveryCode).where(AccountRecoveryCode.user_id == user_id))
    codes = [recovery_code() for _ in range(8)]
    db.add_all(AccountRecoveryCode(user_id=user_id, code_hash=token_hash(normalize_recovery_code(code))) for code in codes)
    return codes


class RecoverInput(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    code: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=12, max_length=256)


class GenerateInput(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@router.post("/api/auth/password/reset/recovery-code")
async def recover(body: RecoverInput, request: Request, db: AsyncSession = Depends(get_db)):
    await check(f"account-recovery:{client_ip(request)}", 5, 300)
    user = (await db.execute(select(User).join(Identity).where(
        Identity.type == IdentityType.USERNAME,
        Identity.normalized_identifier == normalize_username(body.username.strip()),
        User.status == UserStatus.ACTIVE))).scalar_one_or_none()
    # DELETE .. RETURNING makes concurrent redemption single-use on PostgreSQL and SQLite.
    used = None
    if user:
        used = (await db.execute(delete(AccountRecoveryCode).where(
            AccountRecoveryCode.user_id == user.id,
            AccountRecoveryCode.code_hash == token_hash(normalize_recovery_code(body.code))
        ).returning(AccountRecoveryCode.id))).scalar_one_or_none()
    if used is None:
        await audit(db, "account.recovery_failed", ip=client_ip(request))
        await db.commit()
        raise ApiError(401, "INVALID_RECOVERY_CODE", "Invalid username or recovery code")
    await _set_password(db, user.id, body.new_password)
    await _revoke_sessions(db, user.id)
    await audit(db, "account.recovered", target_user_id=user.id, ip=client_ip(request))
    await db.commit()
    return {"ok": True}


@router.get("/api/account/recovery-codes")
async def status(ctx: AuthContext = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(AccountRecoveryCode).where(AccountRecoveryCode.user_id == ctx.user.id))
    return {"remaining": count, "totp_enabled": bool(await active_totp(db, ctx.user.id))}


@router.post("/api/account/recovery-codes")
async def generate(body: GenerateInput, request: Request, ctx: AuthContext = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await check(f"account-recovery-generate:{client_ip(request)}", 5, 300)
    if await active_totp(db, ctx.user.id):
        require_recent_aal2(ctx)
    username = await db.scalar(select(Identity.identifier).where(Identity.user_id == ctx.user.id, Identity.type == IdentityType.USERNAME))
    await authenticate(db, username or "", body.password, client_ip(request))
    # Lock the owner so concurrent regenerations cannot create more than one set.
    await db.execute(select(User).where(User.id == ctx.user.id).with_for_update())
    codes = await replace_codes(db, ctx.user.id)
    await audit(db, "account.recovery_codes.regenerated", actor_user_id=ctx.user.id)
    await db.commit()
    return {"recovery_codes": codes}
