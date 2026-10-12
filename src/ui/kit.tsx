import type { CSSProperties, ReactNode } from 'react';

/** Size in design units: scales with the device frame (see --u in app.css). */
export const U = (n: number) => `calc(var(--u) * ${n})`;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            style={{
                paddingTop: `calc(max(12px, ${U(16)}) + env(safe-area-inset-top, 0px))`,
                paddingBottom: `calc(max(12px, ${U(16)}) + env(safe-area-inset-bottom, 0px))`,
                paddingLeft: `calc(max(12px, ${U(16)}) + env(safe-area-inset-left, 0px))`,
                paddingRight: `calc(max(12px, ${U(16)}) + env(safe-area-inset-right, 0px))`,
            }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="pop flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl border border-cyan-400/50 bg-[#0e1530] shadow-[0_0_40px_rgba(24,224,255,0.25)]"
                style={{ maxWidth: U(wide ? 680 : 600) }}
            >
                <div className="flex shrink-0 items-center justify-between border-b border-cyan-400/30" style={{ padding: `${U(14)} ${U(20)}` }}>
                    <h2 className="font-extrabold tracking-wide text-cyan-300" style={{ fontSize: U(30) }}>{title}</h2>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center rounded-full bg-white/10 font-bold text-white hover:bg-white/20 active:scale-95"
                        style={{ width: U(48), height: U(48), minWidth: '40px', minHeight: '40px', fontSize: U(26) }}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
                <div className="overflow-y-auto overscroll-contain" style={{ padding: U(20), fontSize: U(24), WebkitOverflowScrolling: 'touch' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl bg-white/5 active:bg-white/10" style={{ padding: `${U(12)} ${U(16)}`, marginBottom: U(10), minHeight: '44px' }}>
            <span className="font-semibold text-left">{label}</span>
            <span className={`relative shrink-0 rounded-full transition-colors ${on ? 'bg-cyan-400' : 'bg-gray-600'}`} style={{ width: U(76), height: U(40), minWidth: '48px', minHeight: '26px' }}>
                <span className="absolute rounded-full bg-white transition-all shadow" style={{ top: U(4), left: on ? U(40) : U(4), width: U(32), height: U(32), minWidth: '20px', minHeight: '20px' }} />
            </span>
        </button>
    );
}

export function Chip({ active, children, onClick, style }: { active?: boolean; children: ReactNode; onClick: () => void; style?: CSSProperties }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-xl font-semibold active:scale-95 transition-all ${active ? 'bg-cyan-400 text-black shadow-[0_0_14px_rgba(24,224,255,0.7)]' : 'bg-white/10 text-white'}`}
            style={{ padding: `${U(10)} ${U(12)}`, fontSize: U(21), minHeight: '40px', ...style }}
        >
            {children}
        </button>
    );
}

export function RoundBtn({ children, onClick, size = 64, label, className = '', style }: { children: ReactNode; onClick: () => void; size?: number; label: string; className?: string; style?: CSSProperties }) {
    return (
        <button
            aria-label={label}
            onClick={onClick}
            className={`flex items-center justify-center rounded-full border border-cyan-300/60 bg-[#0b1230]/85 text-white shadow-[0_0_14px_rgba(24,224,255,0.35)] active:scale-95 ${className}`}
            style={{ width: U(size), height: U(size), minWidth: '42px', minHeight: '42px', fontSize: U(size * 0.46), ...style }}
        >
            {children}
        </button>
    );
}
