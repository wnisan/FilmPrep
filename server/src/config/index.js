import dotenv from 'dotenv';

dotenv.config();

/** Конфигурация сервера из переменных окружения. */
export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  // Secure cookies need HTTPS; the Docker build serves plain http://localhost
  cookieSecure: process.env.COOKIE_SECURE
    ? String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  llm: {
    enabled: String(process.env.LLM_ENABLED || 'false').toLowerCase() === 'true',
    provider: process.env.LLM_PROVIDER || 'literouter',
    apiKey: process.env.LLM_API_KEY || process.env.LITEROUTER_API_KEY || process.env.GROQ_API_KEY || '',
    model: process.env.LLM_MODEL || 'qwen3.8-27b:free',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.literouter.com/v1').replace(/\/$/, ''),
    lexiconLimit: Number(process.env.LLM_LEXICON_LIMIT) || 25,
    phraseLimit: Number(process.env.LLM_PHRASE_LIMIT) || 20,
    // Free LiteRouter: ~7s cooldown between messages
    minIntervalMs: Number(process.env.LLM_MIN_INTERVAL_MS) || 7500,
  },
  storage: {
    // "s3" when S3_BUCKET + keys are set, "yadisk" with YADISK_TOKEN, otherwise local folder
    driver:
      process.env.STORAGE_DRIVER ||
      (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID
        ? 's3'
        : process.env.YADISK_TOKEN
          ? 'yadisk'
          : 'local'),
    yadisk: {
      token: process.env.YADISK_TOKEN || '',
      root: process.env.YADISK_ROOT || 'disk:/FilmPrep',
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true').toLowerCase() === 'true',
      label: process.env.S3_LABEL || '',
    },
    // "proxy": segments go through API (works with private bucket, no CORS setup)
    // "signed": player loads segments from bucket by presigned URL (bucket CORS required)
    segments: process.env.STREAM_SEGMENTS || 'proxy',
    // keep a full local copy of cloud films (uploads/cache) so playback does not wait for the bucket
    warmCache: String(process.env.STREAM_CACHE_WARM || 'true').toLowerCase() === 'true',
  },
  userFilms: {
    limit: Number(process.env.USER_FILMS_LIMIT) || 10,
  },
  video: {
    maxUploadMb: Number(process.env.VIDEO_MAX_UPLOAD_MB) || 8192,
    variants: (process.env.HLS_VARIANTS || '720,360')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => [1080, 720, 480, 360].includes(v)),
    preset: process.env.HLS_PRESET || 'veryfast',
    streamTokenTtl: process.env.STREAM_TOKEN_TTL || '8h',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Must match Google Console + go through Vite proxy so refresh cookie sticks to :5173
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/api/v1/auth/google/callback`,
  },
};
