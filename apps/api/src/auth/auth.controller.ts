import { Body, Controller, ForbiddenException, HttpCode, HttpException, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminAuthService, hashPassword, verifyPassword } from './admin-auth.service';

interface AttemptState { failures: number; blockedUntil: number; lastAttempt: number; }

@Controller('/api/admin/auth')
export class AuthController {
  private readonly attempts = new Map<string, AttemptState>();
  private dummyHash?: string;

  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService) {}

  @Post('/login')
  @HttpCode(200)
  async login(@Body() body: any, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertSameSiteMutation(request);
    const ip = request.socket.remoteAddress || 'unknown';
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    // Next.js may proxy all browser logins through one server address; scope the lockout to the account as well.
    const attemptKey = `${ip}:${username || 'invalid-account'}`;
    const state = this.attempts.get(attemptKey);
    if (state && state.blockedUntil > Date.now()) throw new HttpException('محاولات كثيرة. يرجى الانتظار ثم المحاولة مجددًا.', 429);

    const password = typeof body?.password === 'string' ? body.password : '';
    if (username.length > 80 || password.length > 128) throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة.');

    const admin = /^[a-z0-9._-]{3,40}$/.test(username) ? await this.auth.findByUsername(username) : null;
    const hash = admin?.passwordHash || await this.getDummyHash();
    const passwordMatches = await verifyPassword(password || 'invalid-password', hash);
    if (!admin || !admin.isActive || !passwordMatches) {
      this.recordFailure(attemptKey);
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    this.attempts.delete(attemptKey);
    response.setHeader('Set-Cookie', `${this.auth.cookieName()}=${encodeURIComponent(this.auth.createSession(admin))}; ${this.auth.cookieOptions()}`);
    response.setHeader('Cache-Control', 'no-store');
    return { success: true };
  }

  @Post('/logout')
  @HttpCode(200)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertSameSiteMutation(request);
    response.setHeader('Set-Cookie', `${this.auth.cookieName()}=; ${this.auth.clearCookieOptions()}`);
    response.setHeader('Cache-Control', 'no-store');
    return { success: true };
  }

  private assertSameSiteMutation(request: Request): void {
    if (request.header('x-admin-request') !== '1') {
      throw new ForbiddenException('تعذر التحقق من مصدر الطلب. أعد تحميل الصفحة وحاول مجددًا.');
    }
  }

  private recordFailure(ip: string): void {
    const now = Date.now();
    const previous = this.attempts.get(ip);
    const failures = (previous?.failures || 0) + 1;
    this.attempts.set(ip, { failures, blockedUntil: failures >= 5 ? now + 15 * 60 * 1000 : 0, lastAttempt: now });
    if (this.attempts.size > 2_000) {
      for (const [key, value] of this.attempts) if (value.lastAttempt < now - 15 * 60 * 1000 && value.blockedUntil < now) this.attempts.delete(key);
      if (this.attempts.size > 2_500) {
        const oldest = Array.from(this.attempts.entries()).sort((a, b) => a[1].lastAttempt - b[1].lastAttempt).slice(0, this.attempts.size - 2_000);
        for (const [key] of oldest) this.attempts.delete(key);
      }
    }
  }

  private async getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = await hashPassword('not-a-real-password-' + Math.random().toString(36));
    return this.dummyHash;
  }
}
