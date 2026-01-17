import { Context, type MiddlewareFn } from 'telegraf';

export const isAdmin: MiddlewareFn<Context> = (ctx, next) => {
  const adminIds = process.env.ADMIN?.split(',').map(id => id.trim()) || [];
  const userId = ctx.from?.id?.toString();
  
  if (!userId || !adminIds.includes(userId)) {
    ctx.reply('❌ Access denied. Only admins can perform this action.');
    return;
  }
  
  return next();
};

export const checkAdmin = (userId: string): boolean => {
  const adminIds = process.env.ADMIN?.split(',').map(id => id.trim()) || [];
  return adminIds.includes(userId);
};