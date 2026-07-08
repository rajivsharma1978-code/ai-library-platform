export interface StatCardProps {
    icon?: string;
    label: string;
    value: string | number;
    valueClassName?: string;
    badge?: string;
  }
  
  /** A single overview stat card — icon + label + big number. Used in
   * grids across My Space, My Library, My Books, and Admin pages. */
  export default function StatCard({ icon, label, value, valueClassName = "text-slate-900", badge }: StatCardProps) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <p className="text-slate-500">{icon ? `${icon} ` : ""}{label}</p>
        <h2 className={`mt-2 text-4xl font-bold ${valueClassName}`}>{value}</h2>
        {badge && (
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            {badge}
          </span>
        )}
      </div>
    );
  }
  