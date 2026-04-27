import { describe, expect, it } from 'vitest';
import { parsePrivilegedRequest } from './privileged-protocol';

describe('privileged protocol', () => {
  it('rejects unsupported protocol versions', () => {
    expect(() =>
      parsePrivilegedRequest({
        protoVersion: 999,
        type: 'credential.findCredentials',
        requestId: 'r1',
        payload: { service: 'copilot-cli' },
      }),
    ).toThrow('Unsupported privileged protocol version');
  });

  it('requires requestId', () => {
    expect(() =>
      parsePrivilegedRequest({
        protoVersion: 1,
        type: 'credential.findCredentials',
        payload: { service: 'copilot-cli' },
      }),
    ).toThrow('requestId');
  });
});
