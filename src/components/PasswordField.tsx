import { MIN_PASSWORD_LENGTH } from "@/lib/auth-username";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5 min-w-[200px] flex-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
