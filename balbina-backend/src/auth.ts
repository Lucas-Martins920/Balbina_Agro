import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signToken(payload: JwtPayload): string {
  const jwtSecret = process.env.JWT_SECRET;
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", jwtSecret as string)
    .update(`${header}.${body}`)
    .digest();

  return `${header}.${body}.${base64Url(signature)}`;
}

function verifyToken(token: string): JwtPayload | null {
  const jwtSecret = process.env.JWT_SECRET;
  const parts = token.split(".");
  if (parts.length !== 3 || !jwtSecret) return null;

  const [header, body, signature] = parts;
  const expected = base64Url(
    crypto
      .createHmac("sha256", jwtSecret)
      .update(`${header}.${body}`)
      .digest()
  );

  if (signature.length !== expected.length) return null;

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as JwtPayload;

    return payload.exp > Math.floor(Date.now() / 1000)
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function createToken(subject: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET não configurado.");
  }

  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: subject,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: "Não autorizado." });
    return;
  }

  next();
}