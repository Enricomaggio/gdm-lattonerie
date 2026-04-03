import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  "data-testid"?: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className = "",
  "data-testid": testId,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const displayText =
    selected.length === 0
      ? `${label}: Tutti`
      : selected.length === 1
        ? `${label}: ${options.find((o) => o.value === selected[0])?.label || selected[0]}`
        : `${label}: ${selected.length} sel.`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center justify-between gap-1 h-9 px-3 text-sm rounded-md border
          bg-background hover:bg-accent hover:text-accent-foreground
          ${selected.length > 0 ? "border-violet-400 text-violet-700 dark:text-violet-300" : "border-input text-muted-foreground"}
          transition-colors whitespace-nowrap min-w-[120px]
        `}
        data-testid={testId}
      >
        <span className="truncate max-w-[140px]">{displayText}</span>
        {selected.length > 0 ? (
          <X
            className="w-3.5 h-3.5 shrink-0 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-max min-w-full max-h-[280px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={`
                  flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left
                  hover:bg-accent hover:text-accent-foreground transition-colors
                  ${isSelected ? "bg-violet-50 dark:bg-violet-950/30" : ""}
                `}
                data-testid={`${testId}-option-${option.value}`}
              >
                <div className={`
                  w-4 h-4 rounded border flex items-center justify-center shrink-0
                  ${isSelected ? "bg-violet-600 border-violet-600 text-white" : "border-muted-foreground/40"}
                `}>
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}