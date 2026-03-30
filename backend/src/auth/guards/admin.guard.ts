import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Admin, AdminRole } from '../../admin/entities/admin.entity';

/**
 * Requires an authenticated Admin JWT with {@link AdminRole.ADMIN} or {@link AdminRole.SUPERADMIN}.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: Admin }>();
    const user = req.user;
    if (!user || typeof user !== 'object' || !('role' in user)) {
      throw new ForbiddenException('Admin access required');
    }
    const admin = user as Admin;
    if (admin.role !== AdminRole.ADMIN && admin.role !== AdminRole.SUPERADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
