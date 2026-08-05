import { auth } from '@server/lib/auth/auth';
import { authError } from '@server/lib/auth/errors';
import { authUsers } from '@server/lib/auth/schema';
import {
  isTurnstileAuthEnabled,
  verifyTurnstileToken,
} from '@server/lib/auth/turnstile';
import { db } from '@server/lib/drizzle/db';
import { getRequestIp } from '@server/lib/http/requestIp';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

const CAPTCHA_PROTECTED_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/request-password-reset',
  '/api/auth/email-otp/send-verification-otp',
]);
const ADMIN_AUTH_PATH = '/api/auth/admin';

async function readRequestBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = (await request.clone().json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    return body ?? {};
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.clone().formData();
    return Object.fromEntries(form.entries());
  }

  return {};
}

async function validateCaptcha(context: Context): Promise<Response | null> {
  if (!CAPTCHA_PROTECTED_PATHS.has(context.req.path)) {
    return null;
  }

  if (!isTurnstileAuthEnabled()) {
    return null;
  }

  const body = await readRequestBody(context.req.raw);
  const captchaTokenHeader = context.req.header('x-turnstile-token');
  const captchaTokenBody =
    typeof body.captchaToken === 'string' ? body.captchaToken : '';
  const captchaToken = captchaTokenHeader || captchaTokenBody;

  if (!captchaToken) {
    return authError('请先完成人机验证', 400, 'CAPTCHA_REQUIRED');
  }

  const verified = await verifyTurnstileToken(captchaToken, getRequestIp(context));

  if (!verified) {
    return authError('人机验证失败，请重试', 400, 'CAPTCHA_FAILED');
  }

  return null;
}

async function validateOtpSignUpName(context: Context): Promise<Response | null> {
  if (context.req.path !== '/api/auth/sign-in/email-otp') {
    return null;
  }

  const body = await readRequestBody(context.req.raw);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!email) {
    return authError('缺少邮箱地址', 400, 'MISSING_EMAIL');
  }

  const existingUser = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);

  if (existingUser.length === 0 && !name) {
    return authError('首次注册请填写昵称', 400, 'NAME_REQUIRED');
  }

  return null;
}

export async function handleAuthRequest(context: Context): Promise<Response> {
  if (
    context.req.path === ADMIN_AUTH_PATH ||
    context.req.path.startsWith(`${ADMIN_AUTH_PATH}/`)
  ) {
    return authError('未找到该接口', 404, 'NOT_FOUND');
  }

  if (context.req.method === 'POST') {
    const captchaError = await validateCaptcha(context);
    if (captchaError) {
      return captchaError;
    }

    const otpNameError = await validateOtpSignUpName(context);
    if (otpNameError) {
      return otpNameError;
    }
  }

  return auth.handler(context.req.raw);
}
