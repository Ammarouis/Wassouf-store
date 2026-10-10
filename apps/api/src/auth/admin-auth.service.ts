import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

const scrypt = promisify(nodeScrypt);
const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;
const PASSWORD_HASH_BYTES = 64;
export const ADMIN_SESSION_COOKIE = 'wassouf_admin_session';

export interface AdminRecord {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'editor' | 'inventory_manager';
  isActive: boolean;
  sessionVersion?: number;
  passwordHash?: string;
  [key: string]: any;
}

interface SessionPayload { sub: string; exp: number; version: number; }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, PASSWORD_HASH_BYTES) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | undefined): Promise<boolean> {
  if (!encoded) return false;
  const [algorithm, salt, expectedHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex || !/^[\da-f]{128}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class AdminAuthService {
  constructor(@InjectModel('Admin') private readonly admins: Model<any>) {}

  cookieName(): string {
    return process.env.NODE_ENV === 'production' ? '__Host-wassouf_admin' : ADMIN_SESSION_COOKIE;
  }

  cookieOptions(): string {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}${secure}`;
  }

  clearCookieOptions(): string {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }

  async findByUsername(username: string): Promise<AdminRecord | null> {
    return this.admins.findOne({ username: username.toLowerCase(), isActive: true })
      .select('+passwordHash').exec();
  }

  async authenticateCookie(cookieHeader?: string): Promise<AdminRecord> {
    const token = this.readCookie(cookieHeader, this.cookieName());
    const payload = this.verifySession(token);
    if (!payload) throw new UnauthorizedException('انتهت الجلسة، سجّل الدخول مجددًا.');

    const admin = await this.admins.findById(payload.sub).exec() as AdminRecord | null;
    if (!admin || !admin.isActive || Number(admin.sessionVersion || 0) !== payload.version) {
      throw new UnauthorizedException('الحساب غير نشط أو انتهت الجلسة.');
    }
    return admin;
  }

  createSession(admin: AdminRecord): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
      sub: String(admin._id),
      exp: now + SESSION_LIFETIME_SECONDS,
      version: Number(admin.sessionVersion || 0),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  private getSecret(): string {
    const secret = process.env.SESSION_SECRET || '';
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('SESSION_SECRET must contain at least 32 bytes before admin sessions can be used.');
    }
    return secret;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.getSecret()).update(body).digest('base64url');
  }

  private verifySession(token?: string): SessionPayload | null {
    if (!token || token.length > 2048) return null;
    const [body, signature, ...extra] = token.split('.');
    if (!body || !signature || extra.length) return null;
    try {
      const expected = Buffer.from(this.sign(body), 'base64url');
      const received = Buffer.from(signature, 'base64url');
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
      if (!payload.sub || !Types.ObjectId.isValid(payload.sub) || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
      if (!Number.isSafeInteger(payload.version) || payload.version < 0) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const [key, ...value] = part.trim().split('=');
      if (key === name) {
        try { return decodeURIComponent(value.join('=')); } catch { return undefined; }
      }
    }
    return undefined;
  }
}
