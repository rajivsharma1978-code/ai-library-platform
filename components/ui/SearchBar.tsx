export interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    className?: string;
  }
  
  /** One consistent search input, used across every page with a search
   * box (My Library, My Books, Quiz, Flashcards, Admin tables, etc.). */
  export default function SearchBar({ value, onChange, placeholder, className = "" }: SearchBarProps) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-sm shadow-sm outline-none focus:border-transparent focus:ring-2 focus:ring-amber-400 ${className}`}
      />
    );
  }
  