from sqlalchemy import select
from app.common.database import SessionFactory
from app.common.models import AccountRecoveryCode, Identity
from app.security.core import token_hash
from app.authentication.mfa_service import normalize_recovery_code


async def test_username_only_register_and_recover(client):
    registration = await client.post("/api/auth/register", json={"username": "new_user", "password": "initial password 123"})
    assert registration.status_code == 201
    assert registration.headers["cache-control"] == "no-store"
    codes = registration.json()["recovery_codes"]
    assert len(codes) == len(set(codes)) == 8
    async with SessionFactory() as db:
        assert len((await db.execute(select(Identity))).scalars().all()) == 1
        stored = (await db.execute(select(AccountRecoveryCode))).scalars().all()
        assert {row.code_hash for row in stored} == {token_hash(normalize_recovery_code(code)) for code in codes}
    login = await client.post("/api/auth/login", json={"login": "new_user", "password": "initial password 123"})
    assert login.status_code == 200
    payload = {"username": "NEW_USER", "code": codes[0].lower().replace("-", ""), "new_password": "new password 456"}
    invalid = await client.post("/api/auth/password/reset/recovery-code", json={**payload, "code": "wrong"})
    assert invalid.status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 200
    assert (await client.post("/api/auth/password/reset/recovery-code", json=payload)).status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.post("/api/auth/password/reset/recovery-code", json=payload)).status_code == 401
    assert (await client.post("/api/auth/login", json={"login": "new_user", "password": "initial password 123"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"login": "new_user", "password": "new password 456"})).status_code == 200


async def test_regeneration_requires_password_and_csrf(client, logged_in):
    old = (await client.post("/api/auth/register", json={"username": "other", "password": "other password 123"})).json()["recovery_codes"]
    assert (await client.post("/api/account/recovery-codes", json={"password": "correct horse battery"})).status_code == 403
    headers = {"x-csrf-token": client.cookies.get("lako_csrf")}
    assert (await client.post("/api/account/recovery-codes", headers=headers, json={"password": "wrong"})).status_code == 401
    response = await client.post("/api/account/recovery-codes", headers=headers, json={"password": "correct horse battery"})
    assert response.status_code == 200
    assert len(response.json()["recovery_codes"]) == 8
    assert (await client.get("/api/account/recovery-codes")).json()["remaining"] == 8
    previous = response.json()["recovery_codes"][0]
    response = await client.post("/api/account/recovery-codes", headers=headers, json={"password": "correct horse battery"})
    assert len(response.json()["recovery_codes"]) == 8
    response = await client.post("/api/auth/password/reset/recovery-code", json={"username": "avocado", "code": previous, "new_password": "replacement password"})
    assert response.status_code == 401
    # A different user's code cannot recover the signed-in user's account.
    response = await client.post("/api/auth/password/reset/recovery-code", json={"username": "avocado", "code": old[0], "new_password": "replacement password"})
    assert response.status_code == 401


async def test_recovery_throttle_and_disabled_account(client, registered):
    from app.common.models import User, UserStatus
    import uuid
    async with SessionFactory() as db:
        user = await db.get(User, uuid.UUID(registered["id"]))
        user.status = UserStatus.DISABLED
        await db.commit()
    payload = {"username": "avocado", "code": registered["recovery_codes"][0], "new_password": "new password value"}
    for _ in range(5):
        assert (await client.post("/api/auth/password/reset/recovery-code", json=payload)).status_code == 401
    assert (await client.post("/api/auth/password/reset/recovery-code", json=payload)).status_code == 429
    async with SessionFactory() as db:
        assert len((await db.execute(select(AccountRecoveryCode))).scalars().all()) == 8
