import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Permission, roleHasPermission } from '@wassouf/shared';
import { AdminAuthService, AdminRecord } from './admin-auth.service';

export const ADMIN_PERMISSION_KEY = 'admin.permission';
export const RequirePermission = (permission: Permission) => SetMetadata(ADMIN_PERMISSION_KEY, permission);

export interface AuthenticatedRequest extends Request {
  admin?: AdminRecord;
}

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().admin;
});

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) && request.header('x-admin-request') !== '1') {
      throw new ForbiddenException('تعذر التحقق من مصدر الطلب. أعد تحميل الصفحة وحاول مجددًا.');
    }

    const admin = await this.auth.authenticateCookie(request.headers.cookie);
    request.admin = admin;
    const permission = this.reflector.getAllAndOverride<Permission>(ADMIN_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (permission && !roleHasPermission(admin.role, permission)) {
      throw new ForbiddenException('لا تملك صلاحية تنفيذ هذه العملية.');
    }
    return true;
  }
}

export function assertAdminPermission(admin: AdminRecord, permission: Permission): void {
  if (!admin || !roleHasPermission(admin.role, permission)) throw new ForbiddenException('لا تملك صلاحية تنفيذ هذه العملية.');
}

export function assertAdmin(admin: AdminRecord | undefined): asserts admin is AdminRecord {
  if (!admin) throw new UnauthorizedException('يلزم تسجيل الدخول لإكمال العملية.');
}
