import { checkPassword } from "@/lib/password";

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { checks } = checkPassword(password);
  const items = [
    { ok: checks.length, label: "8+ characters" },
    { ok: checks.upper, label: "Uppercase" },
    { ok: checks.lower, label: "Lowercase" },
    { ok: checks.number, label: "Number" },
  ];
  return (
    <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
      {items.map((item) => (
        <li
          key={item.label}
          className={item.ok ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"}
        >
          {item.ok ? "✓" : "○"} {item.label}
        </li>
      ))}
    </ul>
  );
}
