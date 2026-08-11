function gatewayPort(): string {
  if (typeof window === 'undefined') return '8080';
  return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
}

function hostOrigin(sub: string): string {
  if (typeof window === 'undefined') {
    return `http://${sub}.localhost:8080`;
  }
  const { protocol, hostname } = window.location;
  const port = gatewayPort();
  const portSuffix =
    (protocol === 'http:' && port === '80') ||
    (protocol === 'https:' && port === '443')
      ? ''
      : `:${port}`;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${sub}.localhost${portSuffix}`;
  }

  // www.example.com → admin.example.com
  const parts = hostname.split('.');
  if (parts[0] === 'www') parts.shift();
  return `${protocol}//${sub}.${parts.join('.')}${portSuffix}`;
}

/** Master Admin login */
export function adminLoginUrl(): string {
  const fromEnv = import.meta.env.VITE_ADMIN_URL?.replace(/\/$/, '');
  if (fromEnv) return `${fromEnv}/login`;
  return `${hostOrigin('admin')}/login`;
}

/** Store Admin login */
export function appLoginUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL?.replace(/\/$/, '');
  if (fromEnv) return `${fromEnv}/login`;
  return `${hostOrigin('app')}/login`;
}

export function supportEmail(): string | null {
  const email = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  return email || null;
}
