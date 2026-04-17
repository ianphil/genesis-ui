import { describe, it, expect } from 'vitest';
import {
  AuthStatusSchema,
  AuthAccountSchema,
  AuthProgressSchema,
  AuthGetStatusArgs,
  AuthListAccountsArgs,
  AuthStartLoginArgs,
  AuthSwitchAccountArgs,
  AuthLogoutArgs,
} from './auth';

describe('auth contract', () => {
  it('AuthStatus accepts authenticated with login and unauthenticated', () => {
    expect(AuthStatusSchema.safeParse({ authenticated: true, login: 'alice' }).success).toBe(true);
    expect(AuthStatusSchema.safeParse({ authenticated: false }).success).toBe(true);
    expect(AuthStatusSchema.safeParse({}).success).toBe(false);
  });

  it('AuthAccount requires login', () => {
    expect(AuthAccountSchema.safeParse({ login: 'alice' }).success).toBe(true);
    expect(AuthAccountSchema.safeParse({}).success).toBe(false);
  });

  it('AuthProgress permits known steps with optional fields', () => {
    expect(AuthProgressSchema.safeParse({ step: 'device_code', userCode: 'ABC-123', verificationUri: 'https://x' }).success).toBe(true);
    expect(AuthProgressSchema.safeParse({ step: 'polling' }).success).toBe(true);
    expect(AuthProgressSchema.safeParse({ step: 'complete', login: 'alice' }).success).toBe(true);
    expect(AuthProgressSchema.safeParse({ step: 'error', error: 'boom' }).success).toBe(true);
    expect(AuthProgressSchema.safeParse({ step: 'other' }).success).toBe(true);
  });

  it('argless channels reject extra args', () => {
    for (const schema of [AuthGetStatusArgs, AuthListAccountsArgs, AuthStartLoginArgs, AuthLogoutArgs]) {
      expect(schema.safeParse([]).success).toBe(true);
      expect(schema.safeParse(['x']).success).toBe(false);
    }
  });

  it('auth:switchAccount requires string login', () => {
    expect(AuthSwitchAccountArgs.safeParse(['alice']).success).toBe(true);
    expect(AuthSwitchAccountArgs.safeParse(['']).success).toBe(false);
    expect(AuthSwitchAccountArgs.safeParse([42]).success).toBe(false);
    expect(AuthSwitchAccountArgs.safeParse([]).success).toBe(false);
  });
});
