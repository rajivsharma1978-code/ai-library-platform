"use client";

type BookOpeningAnimationProps = {
  title: string;
};

export default function BookOpeningAnimation({
  title,
}: BookOpeningAnimationProps) {
  return (
    <section className="flex h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#fff8e8_0%,#d8b36d_52%,#5f3513_100%)]">
      <div className="relative flex flex-col items-center">
        <div className="absolute top-[58%] h-28 w-[620px] rounded-full bg-black/40 blur-3xl" />

        <div className="relative h-[560px] w-[380px] animate-[bookOpen_900ms_ease-in-out_forwards] rounded-r-[2.6rem] rounded-l-xl border border-amber-300 bg-gradient-to-br from-[#0d1b35] via-[#183763] to-[#06101f] p-10 text-white shadow-[35px_45px_100px_rgba(0,0,0,0.65)]">
          <div className="absolute inset-y-0 left-6 w-2 rounded-full bg-white/10" />
          <div className="absolute inset-y-0 right-0 w-16 rounded-r-[2.6rem] bg-gradient-to-l from-black/40 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between text-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">
                Opening Book
              </p>

              <h1 className="mt-14 text-4xl font-black leading-tight">
                {title}
              </h1>
            </div>

            <p className="text-sm text-blue-100">
              Preparing your AI-powered reading experience...
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes bookOpen {
            0% {
              transform: scale(1) rotateY(0deg) translateY(0);
              opacity: 1;
            }
            45% {
              transform: scale(1.12) rotateY(-28deg) translateY(-20px);
              opacity: 1;
            }
            100% {
              transform: scale(1.18) rotateY(-76deg) translateY(-25px);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    </section>
  );
}