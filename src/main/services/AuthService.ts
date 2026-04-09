// AuthService — GitHub device flow + Windows Credential Manager storage.
// Stores token where copilot CLI expects it — one login, everything works.
// IMPORTANT: The CLI reads credentials via keytar, which interprets the
// CredentialBlob as UTF-8. We must write UTF-8 bytes — NOT cmdkey, which
// writes UTF-16LE and produces null-byte-riddled tokens when keytar reads them.

import * as https from 'https';
import { execFileSync } from 'child_process';

const CLIENT_ID = 'Ov23ctDVkRmgkPke0Mmm';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const AUTH_SCOPE = 'read:user,read:org,repo,gist';
const CREDENTIAL_TARGET_PREFIX = 'copilot-cli/https://github.com';

// Win32 Credential Manager — write UTF-8 blobs compatible with keytar
const credentialNative = (() => {
  // PowerShell script that calls CredWriteW with a UTF-8 encoded blob.
  // cmdkey stores UTF-16LE; keytar reads UTF-8. This bridges the gap.
  const writeScript = (target: string, user: string, token: string) => `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredWriter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredWrite(ref CREDENTIAL credential, int flags);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredDelete(string target, int type, int flags);

    public static bool Write(string target, string user, string password) {
        byte[] passwordBytes = Encoding.UTF8.GetBytes(password);
        IntPtr blob = Marshal.AllocHGlobal(passwordBytes.Length);
        Marshal.Copy(passwordBytes, 0, blob, passwordBytes.Length);

        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1; // CRED_TYPE_GENERIC
        cred.TargetName = target;
        cred.UserName = user;
        cred.CredentialBlob = blob;
        cred.CredentialBlobSize = passwordBytes.Length;
        cred.Persist = 2; // CRED_PERSIST_LOCAL_MACHINE

        bool result = CredWrite(ref cred, 0);
        Marshal.FreeHGlobal(blob);
        return result;
    }
}
"@
[CredWriter]::Write('${target.replace(/'/g, "''")}', '${user.replace(/'/g, "''")}', '${token.replace(/'/g, "''")}')
`;

  return {
    write(target: string, user: string, token: string): boolean {
      try {
        const result = execFileSync('powershell', [
          '-NoProfile', '-NonInteractive', '-Command',
          writeScript(target, user, token),
        ], { encoding: 'utf-8', timeout: 10_000 }).trim();
        return result === 'True';
      } catch (err) {
        console.error('[Auth] CredWrite failed:', err);
        return false;
      }
    },
  };
})();

export interface AuthProgress {
  step: 'device_code' | 'polling' | 'authenticated' | 'error';
  userCode?: string;
  verificationUri?: string;
  login?: string;
  error?: string;
}

function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Chamber/0.11.0',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Invalid JSON: ${body}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url: string, token: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Chamber/0.11.0',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Invalid JSON: ${body}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export class AuthService {
  private onProgress?: (progress: AuthProgress) => void;
  private aborted = false;

  setProgressHandler(handler: (progress: AuthProgress) => void): void {
    this.onProgress = handler;
  }

  abort(): void {
    this.aborted = true;
  }

  /** Check if a copilot credential exists in Windows Credential Manager */
  getStoredCredential(): { login: string } | null {
    try {
      const output = execFileSync('cmdkey', [
        `/list:${CREDENTIAL_TARGET_PREFIX}*`,
      ], { encoding: 'utf-8' });
      const match = output.match(/Target:\s+copilot-cli\/https:\/\/github\.com:(\S+)/);
      if (match) {
        return { login: match[1] };
      }
    } catch { /* no credentials */ }
    return null;
  }

  /** Store token in Windows Credential Manager as UTF-8 blob.
   *  The CLI reads credentials via keytar which interprets blobs as UTF-8.
   *  cmdkey writes UTF-16LE, causing null-byte corruption when keytar reads. */
  private storeCredential(login: string, token: string): void {
    const target = `${CREDENTIAL_TARGET_PREFIX}:${login}`;
    const user = `https://github.com:${login}`;
    try {
      const ok = credentialNative.write(target, user, token);
      if (ok) {
        console.log(`[Auth] Stored credential for ${login} (UTF-8 blob)`);
      } else {
        console.error('[Auth] CredWrite returned false');
      }
    } catch (err) {
      console.error('[Auth] Failed to store credential:', err);
    }
  }

  async startLogin(): Promise<{ success: boolean; login?: string }> {
    this.aborted = false;

    try {
      // 1. Start device flow
      const deviceResp = await postJson(DEVICE_CODE_URL, {
        client_id: CLIENT_ID,
        scope: AUTH_SCOPE,
      });

      const userCode = String(deviceResp.user_code);
      const verificationUri = String(deviceResp.verification_uri);
      const deviceCode = String(deviceResp.device_code);
      let interval = Number(deviceResp.interval) || 5;
      const expiresIn = Number(deviceResp.expires_in) || 900;

      this.onProgress?.({ step: 'device_code', userCode, verificationUri });

      // 2. Poll for access token
      this.onProgress?.({ step: 'polling', userCode, verificationUri });
      const deadline = Date.now() + expiresIn * 1000;

      while (Date.now() < deadline && !this.aborted) {
        await new Promise(r => setTimeout(r, interval * 1000));
        if (this.aborted) return { success: false };

        const tokenResp = await postJson(ACCESS_TOKEN_URL, {
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });

        if (tokenResp.access_token) {
          const token = String(tokenResp.access_token);

          // Get user login
          let login = 'user';
          try {
            const user = await getJson('https://api.github.com/user', token);
            login = String(user.login);
          } catch { /* use default */ }

          // Store in Windows Credential Manager
          this.storeCredential(login, token);

          this.onProgress?.({ step: 'authenticated', login });
          return { success: true, login };
        }

        const error = String(tokenResp.error || '');
        if (error === 'authorization_pending') continue;
        if (error === 'slow_down') {
          interval += 5;
          continue;
        }

        this.onProgress?.({ step: 'error', error: `Auth failed: ${error}` });
        return { success: false };
      }

      if (this.aborted) return { success: false };
      this.onProgress?.({ step: 'error', error: 'Timed out waiting for authorization' });
      return { success: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onProgress?.({ step: 'error', error: message });
      return { success: false };
    }
  }
}
