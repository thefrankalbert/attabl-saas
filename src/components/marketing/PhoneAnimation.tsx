'use client';

export default function PhoneAnimation() {
  return (
    <section className="relative bg-black py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left: Text content */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              ATTABL AI
            </p>
            <h2 className="mt-4 text-5xl font-semibold leading-tight text-white">
              Prenez des décisions intelligentes, rapidement
            </h2>
            <p className="mt-6 text-xl text-neutral-400">
              Interrogez Attabl AI sur votre activité pour obtenir des insights immédiats.
            </p>
            <button className="mt-8 rounded-lg border-2 border-white/20 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#CCFF00] hover:text-black hover:border-[#CCFF00]">
              En savoir plus
            </button>
          </div>

          {/* Right: Phone mockup */}
          <div className="relative flex justify-center">
            <div className="relative h-[600px] w-[300px] overflow-hidden rounded-[3rem] border-8 border-neutral-800 bg-black shadow-2xl shadow-[#CCFF00]/5">
              <div className="absolute left-1/2 top-0 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-neutral-800" />
              <div className="flex h-full flex-col items-center justify-center p-8">
                <div className="h-full w-full rounded-2xl bg-gradient-to-br from-[#CCFF00]/10 to-[#CCFF00]/5 p-6">
                  <div className="flex h-full flex-col justify-between">
                    <div className="text-2xl font-bold text-[#CCFF00]">Attabl AI</div>
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-white/10 p-4">
                        <p className="text-sm text-white">
                          Quelles sont mes meilleures ventes aujourd&apos;hui ?
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[#CCFF00]/20 p-4">
                        <p className="text-sm text-white">
                          Vos 3 plats les plus vendus : Pizza Margherita (47), Burger Classic (38),
                          Salade César (29)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
