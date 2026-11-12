import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CEFR_LEVELS, ROLES } from '../constants.js';
import { config } from '../config/index.js';
import { usersRepository } from '../repositories/users.repository.js';
import { refreshTokensRepository } from '../repositories/refreshTokens.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { toPublicUser } from '../utils/userView.js';
import { LANGUAGE_CODES } from '../utils/languages.js';
import {
  createRefreshTokenValue,
  getRefreshExpiryDate,
  hashToken,
  signAccessToken,
} from '../utils/tokens.js';

const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(80).optional(),
  cefrLevel: z.enum(CEFR_LEVELS).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(72),
});

const SALT_ROUNDS = 10;

function googleConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = createRefreshTokenValue();
  await refreshTokensRepository.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshExpiryDate(),
  });
  return { accessToken, refreshToken, user: toPublicUser(user) };
}

async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    const detail = tokenData?.error_description || tokenData?.error || 'token exchange failed';
    throw createHttpError(401, 'GOOGLE_TOKEN_ERROR', detail);
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json().catch(() => null);
  if (!profileRes.ok || !profile?.sub || !profile?.email) {
    throw createHttpError(401, 'GOOGLE_PROFILE_ERROR', 'Could not load Google profile');
  }

  return {
    googleId: String(profile.sub),
    email: String(profile.email).toLowerCase().trim(),
    displayName: profile.name ? String(profile.name).slice(0, 80) : null,
    emailVerified: Boolean(profile.email_verified),
  };
}

export const authService = {
  providers() {
    return { google: googleConfigured() };
  },

  async register(input) {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { email, password, displayName, cefrLevel, language } = parsed.data;
    const existing = await usersRepository.findByEmail(email);
    if (existing) {
      throw createHttpError(409, 'EMAIL_TAKEN', 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await usersRepository.create({
      email,
      passwordHash,
      role: ROLES.LEARNER,
      cefrLevel,
      displayName,
      language,
    });

    return issueTokens(user);
  },

  async login(input) {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { email, password } = parsed.data;
    const user = await usersRepository.findByEmail(email);
    if (!user) {
      throw createHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (!user.password_hash) {
      throw createHttpError(
        401,
        'USE_GOOGLE',
        'Этот аккаунт создан через Google. Войдите кнопкой «Войти через Google».',
      );
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw createHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    return issueTokens(user);
  },

  createGoogleAuthState() {
    if (!googleConfigured()) {
      throw createHttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Sign-In is not configured');
    }
    const state = randomBytes(24).toString('hex');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', config.google.clientId);
    url.searchParams.set('redirect_uri', config.google.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);
    return { url: url.toString(), state };
  },

  async loginWithGoogleCode(code) {
    if (!googleConfigured()) {
      throw createHttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Sign-In is not configured');
    }
    if (!code) {
      throw createHttpError(400, 'MISSING_CODE', 'Missing Google authorization code');
    }

    const profile = await exchangeGoogleCode(code);
    if (!profile.emailVerified) {
      throw createHttpError(403, 'EMAIL_NOT_VERIFIED', 'Google email is not verified');
    }

    let user = await usersRepository.findByGoogleId(profile.googleId);
    if (!user) {
      const byEmail = await usersRepository.findByEmail(profile.email);
      if (byEmail) {
        user = await usersRepository.linkGoogleId(byEmail.id, profile.googleId);
        // linkGoogleId returns public fields without password_hash — reload auth row
        user = await usersRepository.findByGoogleId(profile.googleId);
      } else {
        user = await usersRepository.create({
          email: profile.email,
          passwordHash: null,
          role: ROLES.LEARNER,
          displayName: profile.displayName,
          googleId: profile.googleId,
        });
        user = await usersRepository.findByGoogleId(profile.googleId);
      }
    }

    if (!user) {
      throw createHttpError(500, 'GOOGLE_USER_ERROR', 'Could not create Google user');
    }

    return issueTokens(user);
  },

  async logout(refreshToken) {
    if (!refreshToken) return;
    await refreshTokensRepository.revokeByHash(hashToken(refreshToken));
  },

  /**
   * Обновляет access (и ротирует refresh) по действующему refresh cookie/token.
   */
  async refresh(refreshToken) {
    if (!refreshToken) {
      throw createHttpError(401, 'UNAUTHORIZED', 'Missing refresh token');
    }

    const stored = await refreshTokensRepository.findValidByHash(hashToken(refreshToken));
    if (!stored) {
      throw createHttpError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
    }

    const user = await usersRepository.findById(stored.user_id);
    if (!user) {
      throw createHttpError(401, 'UNAUTHORIZED', 'User not found');
    }

    await refreshTokensRepository.revokeByHash(hashToken(refreshToken));
    return issueTokens(user);
  },

  async me(userId) {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw createHttpError(401, 'UNAUTHORIZED', 'User not found');
    }
    return toPublicUser(user);
  },
};
