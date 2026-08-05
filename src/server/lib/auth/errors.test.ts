import { describe, expect, it } from 'vitest';
import { authError } from './errors';

describe('authError', () => {
  it('uses the Better Auth error response shape', async () => {
    const response = authError('首次注册请填写昵称', 400, 'NAME_REQUIRED');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'NAME_REQUIRED',
      message: '首次注册请填写昵称',
    });
  });
});
