import { HeroDashboardPreview } from './HeroDashboardPreview';

/**
 * Premium laptop device frame with CommerceNest Master Admin on screen.
 * Pure CSS/HTML — no stock photos.
 */
export function HeroLaptopMockup() {
  return (
    <div className="hero-laptop relative w-full select-none" aria-hidden>
      {/* Ambient purple glow behind lid */}
      <div className="pointer-events-none absolute left-1/2 top-[18%] h-[70%] w-[88%] -translate-x-1/2 rounded-full bg-[#6C1DB3]/45 blur-3xl" />

      <div className="relative animate-float-slow">
        {/* Lid / screen chassis */}
        <div className="relative mx-auto w-[94%]">
          <div className="overflow-hidden rounded-t-[14px] rounded-b-[6px] border border-[#3f4555] bg-gradient-to-b from-[#2a2f3d] via-[#1c202b] to-[#151821] p-[10px] shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:rounded-t-[18px] sm:p-[12px]">
            {/* Camera notch */}
            <div className="absolute left-1/2 top-[7px] z-20 flex -translate-x-1/2 items-center gap-1 sm:top-[9px]">
              <span className="h-[5px] w-[5px] rounded-full bg-[#0b0d12] ring-1 ring-white/10 sm:h-1.5 sm:w-1.5" />
            </div>

            {/* Screen glass */}
            <div className="relative aspect-[16/10] overflow-hidden rounded-[6px] bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] sm:rounded-[8px]">
              <div className="absolute inset-0">
                <HeroDashboardPreview />
              </div>
              {/* Glass reflection */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.12] via-transparent to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent" />
            </div>
          </div>

          {/* Lid bottom edge / hinge lip */}
          <div className="relative mx-auto h-[6px] w-full rounded-b-[3px] bg-gradient-to-b from-[#3a4050] to-[#1a1e28]">
            <div className="absolute left-1/2 top-0 h-[3px] w-[18%] -translate-x-1/2 rounded-b-sm bg-[#0f1218]" />
          </div>
        </div>

        {/* Keyboard base — wider chassis under the lid */}
        <div className="relative mx-auto -mt-[1px] w-[102%]">
          <div
            className="mx-auto h-[16px] w-full rounded-b-[14px] bg-gradient-to-b from-[#d5d8e0] via-[#b4b9c6] to-[#8a91a1] shadow-[0_22px_48px_rgba(0,0,0,0.5)] sm:h-[22px] sm:rounded-b-[18px]"
            style={{
              clipPath: 'polygon(1.5% 0, 98.5% 0, 100% 100%, 0 100%)',
            }}
          >
            <div className="mx-auto mt-[4px] h-[5px] w-[38%] rounded-sm bg-gradient-to-b from-[#6d7484]/55 to-transparent sm:mt-[5px] sm:h-[6px]" />
            <div className="pointer-events-none absolute inset-x-[8%] top-[2px] h-px bg-white/35" />
          </div>
          <div className="mx-auto -mt-px h-[4px] w-[97%] rounded-b-full bg-gradient-to-b from-[#707788] to-[#4c5363]" />
        </div>
      </div>
    </div>
  );
}
