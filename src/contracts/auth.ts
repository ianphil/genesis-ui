import { z } from 'zod';

export const AuthStatusSchema = z.object({
  authenticated: z.boolean(),
  login: z.string().min(1).optional(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const AuthAccountSchema = z.object({
  login: z.string().min(1),
});
export type AuthAccount = z.infer<typeof AuthAccountSchema>;

/**
 * Auth progress emitted to `auth:progress`. `step` is open-ended string
 * (AuthService owns the taxonomy) — we only enforce shape, not a closed
 * enum, to avoid regressions when new steps are introduced service-side.
 */
export const AuthProgressSchema = z.object({
  step: z.string().min(1),
  userCode: z.string().optional(),
  verificationUri: z.string().optional(),
  login: z.string().optional(),
  error: z.string().optional(),
});
export type AuthProgress = z.infer<typeof AuthProgressSchema>;

export const AuthStartLoginResultSchema = z.object({
  success: z.boolean(),
  login: z.string().min(1).optional(),
});
export type AuthStartLoginResult = z.infer<typeof AuthStartLoginResultSchema>;

/** `auth:getStatus` — [] */
export const AuthGetStatusArgs = z.tuple([]);
/** `auth:listAccounts` — [] */
export const AuthListAccountsArgs = z.tuple([]);
/** `auth:startLogin` — [] */
export const AuthStartLoginArgs = z.tuple([]);
/** `auth:switchAccount` — [login] */
export const AuthSwitchAccountArgs = z.tuple([z.string().min(1)]);
/** `auth:logout` — [] */
export const AuthLogoutArgs = z.tuple([]);
