import { useState, useRef, useEffect, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

const countries: Country[] = [
  { code: "IT", name: "Italia", dialCode: "+39", flag: "🇮🇹" },
  { code: "DE", name: "Germania", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "Francia", dialCode: "+33", flag: "🇫🇷" },
  { code: "ES", name: "Spagna", dialCode: "+34", flag: "🇪🇸" },
  { code: "GB", name: "Regno Unito", dialCode: "+44", flag: "🇬🇧" },
  { code: "US", name: "Stati Uniti", dialCode: "+1", flag: "🇺🇸" },
  { code: "CH", name: "Svizzera", dialCode: "+41", flag: "🇨🇭" },
  { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
  { code: "BE", name: "Belgio", dialCode: "+32", flag: "🇧🇪" },
  { code: "NL", name: "Paesi Bassi", dialCode: "+31", flag: "🇳🇱" },
  { code: "PT", name: "Portogallo", dialCode: "+351", flag: "🇵🇹" },
  { code: "PL", name: "Polonia", dialCode: "+48", flag: "🇵🇱" },
  { code: "RO", name: "Romania", dialCode: "+40", flag: "🇷🇴" },
  { code: "HR", name: "Croazia", dialCode: "+385", flag: "🇭🇷" },
  { code: "SI", name: "Slovenia", dialCode: "+386", flag: "🇸🇮" },
  { code: "AL", name: "Albania", dialCode: "+355", flag: "🇦🇱" },
  { code: "RS", name: "Serbia", dialCode: "+381", flag: "🇷🇸" },
  { code: "BA", name: "Bosnia", dialCode: "+387", flag: "🇧🇦" },
  { code: "ME", name: "Montenegro", dialCode: "+382", flag: "🇲🇪" },
  { code: "MK", name: "Macedonia del Nord", dialCode: "+389", flag: "🇲🇰" },
  { code: "GR", name: "Grecia", dialCode: "+30", flag: "🇬🇷" },
  { code: "TR", name: "Turchia", dialCode: "+90", flag: "🇹🇷" },
  { code: "SE", name: "Svezia", dialCode: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norvegia", dialCode: "+47", flag: "🇳🇴" },
  { code: "DK", name: "Danimarca", dialCode: "+45", flag: "🇩🇰" },
  { code: "FI", name: "Finlandia", dialCode: "+358", flag: "🇫🇮" },
  { code: "IE", name: "Irlanda", dialCode: "+353", flag: "🇮🇪" },
  { code: "CZ", name: "Rep. Ceca", dialCode: "+420", flag: "🇨🇿" },
  { code: "SK", name: "Slovacchia", dialCode: "+421", flag: "🇸🇰" },
  { code: "HU", name: "Ungheria", dialCode: "+36", flag: "🇭🇺" },
  { code: "BG", name: "Bulgaria", dialCode: "+359", flag: "🇧🇬" },
  { code: "UA", name: "Ucraina", dialCode: "+380", flag: "🇺🇦" },
  { code: "RU", name: "Russia", dialCode: "+7", flag: "🇷🇺" },
  { code: "BR", name: "Brasile", dialCode: "+55", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" },
  { code: "CN", name: "Cina", dialCode: "+86", flag: "🇨🇳" },
  { code: "JP", name: "Giappone", dialCode: "+81", flag: "🇯🇵" },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "MA", name: "Marocco", dialCode: "+212", flag: "🇲🇦" },
  { code: "TN", name: "Tunisia", dialCode: "+216", flag: "🇹🇳" },
  { code: "EG", name: "Egitto", dialCode: "+20", flag: "🇪🇬" },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { code: "ZA", name: "Sudafrica", dialCode: "+27", flag: "🇿🇦" },
];

function detectCountryFromValue(value: string): Country {
  if (!value) return countries[0];
  const cleaned = value.replace(/\s/g, "");
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    if (cleaned.startsWith(country.dialCode)) {
      return country;
    }
  }
  return countries[0];
}

function extractNumber(value: string, dialCode: string): string {
  if (!value) return "";
  const cleaned = value.replace(/\s/g, "");
  if (cleaned.startsWith(dialCode)) {
    return cleaned.slice(dialCode.length).trim();
  }
  if (cleaned.startsWith("+")) {
    const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (cleaned.startsWith(c.dialCode)) {
        return cleaned.slice(c.dialCode.length).trim();
      }
    }
  }
  return cleaned;
}

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = "", onChange, placeholder = "Numero di telefono", className, "data-testid": testId, ...props }, ref) => {
    const [selectedCountry, setSelectedCountry] = useState<Country>(() => detectCountryFromValue(value));
    const [localNumber, setLocalNumber] = useState(() => extractNumber(value, detectCountryFromValue(value).dialCode));
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const lastExternalValue = useRef(value);

    useEffect(() => {
      const composed = localNumber.trim() ? `${selectedCountry.dialCode} ${localNumber}` : "";
      if (value !== lastExternalValue.current && value !== composed) {
        const detected = detectCountryFromValue(value);
        setSelectedCountry(detected);
        setLocalNumber(extractNumber(value, detected.dialCode));
        lastExternalValue.current = value;
      }
    }, [value]);

    const handleCountrySelect = (country: Country) => {
      setSelectedCountry(country);
      setOpen(false);
      setSearch("");
      if (localNumber) {
        const newVal = `${country.dialCode} ${localNumber}`;
        lastExternalValue.current = newVal;
        onChange?.(newVal);
      }
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = e.target.value.replace(/[^\d\s]/g, "");
      setLocalNumber(num);
      if (num.trim()) {
        const newVal = `${selectedCountry.dialCode} ${num}`;
        lastExternalValue.current = newVal;
        onChange?.(newVal);
      } else {
        lastExternalValue.current = "";
        onChange?.("");
      }
    };

    const filteredCountries = search
      ? countries.filter(
          (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.dialCode.includes(search) ||
            c.code.toLowerCase().includes(search.toLowerCase())
        )
      : countries;

    return (
      <div className={cn("flex gap-0", className)} data-testid={testId}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="flex items-center gap-1 px-2 rounded-r-none border-r-0 min-w-[90px] h-9 justify-between"
              data-testid={testId ? `${testId}-country` : "phone-country-select"}
            >
              <span className="text-base leading-none">{selectedCountry.flag}</span>
              <span className="text-xs text-muted-foreground">{selectedCountry.dialCode}</span>
              <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={searchInputRef}
                className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Cerca paese..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid={testId ? `${testId}-search` : "phone-country-search"}
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors",
                    selectedCountry.code === country.code && "bg-accent"
                  )}
                  onClick={() => handleCountrySelect(country)}
                  data-testid={testId ? `${testId}-option-${country.code}` : `phone-country-${country.code}`}
                >
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="flex-1 text-left">{country.name}</span>
                  <span className="text-xs text-muted-foreground">{country.dialCode}</span>
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Nessun paese trovato</div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          ref={ref}
          type="tel"
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={placeholder}
          className="rounded-l-none flex-1"
          data-testid={testId ? `${testId}-number` : "phone-number-input"}
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
