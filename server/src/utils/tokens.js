import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

function parseDurationToMs(value) {
  const match = String(value).match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const map = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * map[unit];
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      jti: crypto.randomUUID(),
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

export function createRefreshTokenValue() {
  return crypto.randomBytes(48).toString('hex');
}

export function getRefreshExpiryDate() {
  const ms = parseDurationToMs(config.jwt.refreshExpires);
  return new Date(Date.now() + ms);
}
