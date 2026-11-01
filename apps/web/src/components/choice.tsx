import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  label?: string;
  value: string;
  options: [value: string, text: string][];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/** Labelled single-choice select built from shadcn primitives. */
export function Choice({ label, value, options, onChange, placeholder, disabled, className }: Props) {
  const select = (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? 'w-full'} aria-label={label ?? placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!label) return select;
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {select}
    </div>
  );
}
