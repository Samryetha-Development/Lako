import { timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const internalIssuer = process.env.LAKO_INTERNAL_ISSUER ?? "http://localhost:3000";
const publicIssuer = process.env.LAKO_PUBLIC_ISSUER ?? "http://localhost:3000";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get("oauth_state")?.value ?? "";
  const expectedNonce = request.cookies.get("oauth_nonce")?.value ?? "";
  const verifier = request.cookies.get("oauth_verifier")?.value ?? "";
  if (!code || !state || !expectedState || !equal(state, expectedState)) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }
  const form = new URLSearchParams({ grant_type: "authorization_code", code, client_id: "samryetha", redirect_uri: "http://localhost:4000/auth/callback", code_verifier: verifier });
  const token = await fetch(`${internalIssuer}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  if (!token.ok) return NextResponse.json(await token.json(), { status: 400 });
  const tokens = await token.json();
  try {
    const jwks = createRemoteJWKSet(new URL(`${internalIssuer}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: publicIssuer, audience: "samryetha", algorithms: ["RS256"] });
    if (typeof payload.nonce !== "string" || !expectedNonce || !equal(payload.nonce, expectedNonce)) throw new Error("Invalid nonce");
    const info = await fetch(`${internalIssuer}/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!info.ok) return NextResponse.json({ error: "Userinfo failed" }, { status: 400 });
    const user = { ...(await info.json()), assurance: payload.acr };
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("samryetha_user", Buffer.from(JSON.stringify(user)).toString("base64url"), { httpOnly: true, sameSite: "lax", secure: false, maxAge: 900, path: "/" });
    response.cookies.delete("oauth_state"); response.cookies.delete("oauth_nonce"); response.cookies.delete("oauth_verifier");
    return response;
  } catch {
    return NextResponse.json({ error: "ID token validation failed" }, { status: 400 });
  }
}
