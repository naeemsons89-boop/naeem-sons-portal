export type PasswordCheck = {
  ok: boolean;
  message: string | null;
  checks: {
    length: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
  };
};

/** Staff-portal password policy: 8+ chars with upper, lower, and a number. */
export function checkPassword(password: string): PasswordCheck {
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const ok = checks.length && checks.upper && checks.lower && checks.number;
  let message: string | null = null;
  if (!ok) {
    message =
      "Password must be at least 8 characters and include uppercase, lowercase, and a number";
  }
  return { ok, message, checks };
}

export function passwordsMatch(a: string, b: string): boolean {
  return a === b && a.length > 0;
}
