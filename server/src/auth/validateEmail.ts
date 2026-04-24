const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.length > 3 && t.length < 200 && EMAIL_RE.test(t);
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}
