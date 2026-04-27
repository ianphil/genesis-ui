export const PRIVILEGED_PROTO_VERSION = 1;

export type PrivilegedRequest =
  | {
      protoVersion: typeof PRIVILEGED_PROTO_VERSION;
      type: 'credential.findCredentials';
      requestId: string;
      payload: { service: string };
    }
  | {
      protoVersion: typeof PRIVILEGED_PROTO_VERSION;
      type: 'credential.setPassword';
      requestId: string;
      payload: { service: string; account: string; password: string };
    }
  | {
      protoVersion: typeof PRIVILEGED_PROTO_VERSION;
      type: 'credential.deletePassword';
      requestId: string;
      payload: { service: string; account: string };
    };

export function parsePrivilegedRequest(value: unknown): PrivilegedRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Privileged request must be an object.');
  }
  const request = value as Partial<PrivilegedRequest>;
  if (request.protoVersion !== PRIVILEGED_PROTO_VERSION) {
    throw new Error(`Unsupported privileged protocol version: ${String(request.protoVersion)}`);
  }
  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    throw new Error('Privileged request requires requestId.');
  }
  if (typeof request.type !== 'string') {
    throw new Error('Privileged request requires type.');
  }
  return request as PrivilegedRequest;
}
