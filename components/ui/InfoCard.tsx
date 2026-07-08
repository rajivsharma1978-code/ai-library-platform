export interface InfoCardProps {
    children: React.ReactNode;
    tone?: "default" | "amber" | "dark";
    className?: string;
  }
  
  const TONE_CLASSES = {
    default: "bg-white shadow-lg ring-1 ring-black/5 text-slate-900",
    amber:   "bg-amber-50 ring-1 ring-amber-200 text-amber-800",
    dark:    "bg-slate-900 text-white shadow-lg",
  };
  
  /** Generic card wrapper — used for demo banners, empty states, and any
   * grouped block of content that should look consistent with the rest of
   * the app (rounded-3xl, consistent padding). */
  export default function InfoCard({ children, tone = "default", className = "" }: InfoCardProps) {
    return (
      <div className={`rounded-3xl p-6 ${TONE_CLASSES[tone]} ${className}`}>
        {children}
      </div>
    );
  }
  