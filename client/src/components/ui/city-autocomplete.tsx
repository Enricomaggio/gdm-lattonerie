import { useState, useRef, useEffect, useCallback } from "react";
import { italianCities, type ItalianCity } from "@/data/italian-cities";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

interface CityAutocompleteProps {
  value: string;
  onChange: (city: string) => void;
  onCitySelect?: (city: ItalianCity) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function CityAutocomplete({
  value,
  onChange,
  onCitySelect,
  placeholder = "Città",
  className,
  "data-testid": dataTestId,
}: CityAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const [suggestions, setSuggestions] = useState<ItalianCity[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const normalize = useCallback(
    (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    []
  );

  const filterCities = useCallback(
    (query: string) => {
      if (!query || query.length < 2) return [];
      const nq = normalize(query);
      const starts = italianCities.filter((c) =>
        normalize(c.name).startsWith(nq)
      );
      const contains = italianCities.filter(
        (c) =>
          !normalize(c.name).startsWith(nq) && normalize(c.name).includes(nq)
      );
      return starts.slice(0, 8).concat(contains.slice(0, 4)).slice(0, 8);
    },
    [normalize]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    const filtered = filterCities(val);
    setSuggestions(filtered);
    setIsOpen(filtered.length > 0);
    setHighlightedIndex(-1);
  };

  const handleSelect = (city: ItalianCity) => {
    setInputValue(city.name);
    onChange(city.name);
    onCitySelect?.(city);
    setIsOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (inputValue.length >= 2) {
            const filtered = filterCities(inputValue);
            setSuggestions(filtered);
            setIsOpen(filtered.length > 0);
          }
        }}
        placeholder={placeholder}
        data-testid={dataTestId}
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-white shadow-lg"
          data-testid={dataTestId ? `${dataTestId}-suggestions` : undefined}
        >
          {suggestions.map((city, index) => (
            <li
              key={`${city.name}-${city.cap}`}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? "bg-[#4563FF]/10 text-[#050B41]"
                  : "hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(city);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              data-testid={
                dataTestId
                  ? `${dataTestId}-option-${city.name.toLowerCase().replace(/\s/g, "-")}`
                  : undefined
              }
            >
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium">{city.name}</span>
              <span className="text-gray-400 text-xs ml-auto">
                ({city.province}) {city.cap}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
