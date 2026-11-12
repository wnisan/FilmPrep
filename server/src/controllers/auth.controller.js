import { authService } from '../services/auth.service.js';
import { config } from '../config/index.js';

const REFRESH_COOKIE = 'filmprep_refresh';
const OAUTH_STATE_COOKIE = 'filmprep_oauth_state';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: 10 * 60 * 1000,
  };
}

function clientRedirect(pathAndQuery) {
  const base = config.clientOrigin.replace(/\/$/, '');
  return `${base}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`;
}

export const authController = {
  async providers(_req, res, next) {
    try {
      res.json({ providers: authService.providers() });
    } catch (err) {
      next(err);
    }
  },

  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
      res.status(201).json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
      res.status(200).json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  },

  async googleStart(_req, res, next) {
    try {
      const { url, state } = authService.createGoogleAuthState();
      res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  },

  async googleCallback(req, res, next) {
    try {
      const { code, state, error, error_description: errorDescription } = req.query;

      if (error) {
        const msg = encodeURIComponent(String(errorDescription || error));
        res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
        return res.redirect(clientRedirect(`/login?google_error=${msg}`));
      }

      const expected = req.cookies?.[OAUTH_STATE_COOKIE];
      res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
      if (!state || !expected || state !== expected) {
        return res.redirect(
          clientRedirect(`/login?google_error=${encodeURIComponent('Неверный OAuth state')}`),
        );
      }

      const result = await authService.loginWithGoogleCode(String(code || ''));
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
      const token = encodeURIComponent(result.accessToken);
      return res.redirect(clientRedirect(`/auth/callback?access_token=${token}`));
    } catch (err) {
      const msg = encodeURIComponent(err.message || 'Google login failed');
      return res.redirect(clientRedirect(`/login?google_error=${msg}`));
    }
  },

  async logout(req, res, next) {
    try {
      const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      await authService.logout(token);
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async refresh(req, res, next) {
    try {
      const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      const result = await authService.refresh(token);
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
      res.status(200).json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      next(err);
    }
  },

  async me(req, res, next) {
    try {
      const user = await authService.me(req.user.id);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
};
