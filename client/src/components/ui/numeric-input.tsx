import * as React from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  onChange?: (e: { target: { value: string } }) => void;
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, onBlur, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState<string>("");
    const [isFocused, setIsFocused] = React.useState(false);

    React.useEffect(() => {
      if (!isFocused) {
        if (value === null || value === undefined || value === "") {
          setInternalValue("");
        } else {
          setInternalValue(String(value));
        }
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      raw = raw.replace(/,/g, ".");
      raw = raw.replace(/[^0-9.\-]/g, "");
      const dotCount = (raw.match(/\./g) || []).length;
      if (dotCount > 1) {
        const firstDot = raw.indexOf(".");
        raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
      }
      if (raw.indexOf("-") > 0) {
        raw = raw.replace(/-/g, "");
      }

      setInternalValue(raw);

      if (onChange) {
        onChange({ target: { value: raw } });
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      e.target.select();
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      let cleaned = internalValue.trim();
      if (cleaned === "" || cleaned === "-" || cleaned === ".") {
        setInternalValue(value !== null && value !== undefined ? String(value) : "");
      } else {
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          setInternalValue(String(num));
        }
      }
      if (onBlur) {
        onBlur(e);
      }
    };

    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={isFocused ? internalValue : (value !== null && value !== undefined ? String(value) : "")}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
