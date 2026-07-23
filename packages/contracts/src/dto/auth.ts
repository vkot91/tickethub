import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = registerSchema;
export type LoginDto = z.infer<typeof loginSchema>;

export const roleSchema = z.enum(['user', 'organizer', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const userPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
});
export type UserPayload = z.infer<typeof userPayloadSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const refreshSchema = z.object({ refreshToken: z.string() });
export type RefreshDto = z.infer<typeof refreshSchema>;

export const getUserRequestSchema = z.object({ userId: z.string().uuid() });
export type GetUserRequest = z.infer<typeof getUserRequestSchema>;

export const getUserResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
});
export type GetUserResponse = z.infer<typeof getUserResponseSchema>;

export const userRegisteredSchema = z.object({
  messageId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
});
export type UserRegisteredEvent = z.infer<typeof userRegisteredSchema>;
