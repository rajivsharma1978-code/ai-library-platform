export interface FilterOption<T extends string = string> {
    key: T;
    label: string;
  }
  
  export interface FilterBarProps<T extends string = string> {
    options: FilterOption<T>[];
    active: T;
    onChange: (key: T) => void;
    className?: string;
  }
  
  /** Consistent pill-style filter row — same active/inactive styling
   * everywhere filters appear (My Library, My Books, Quiz sources,
   * Flashcards sources, Admin status filters, etc.). */
  export default function FilterBar<T extends string = string>({ options, active, onChange, className = "" }: FilterBarProps<T>) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              active === opt.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
  