"use client";

type BookChromeProps = {
  children: React.ReactNode;
  mode: "single" | "double";
};

export default function BookChrome({ children, mode }: BookChromeProps) {
  return (
    <div className="relative flex items-center justify-center">
      <div
        className="relative overflow-hidden rounded-xl bg-[#fdfaf2]"
        style={{
          boxShadow:
            "0 35px 80px rgba(70, 45, 10, 0.28), 0 8px 20px rgba(70, 45, 10, 0.18)",
        }}
      >
        {mode === "double" && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-8 -translate-x-1/2"
            style={{
              background:
                "linear-gradient(to right, rgba(0,0,0,0.16), rgba(255,255,255,0.15), rgba(0,0,0,0.16))",
            }}
          />
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0) 35%, rgba(0,0,0,0.05))",
          }}
        />

        {children}
      </div>

      <div
        aria-hidden
        className="absolute -bottom-5 h-8 w-[92%] rounded-full blur-xl"
        style={{
          background: "rgba(60, 40, 10, 0.22)",
        }}
      />
    </div>
  );
}