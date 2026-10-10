import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { tr, colorName } from '../i18n';
import { COLORS } from '../game/rules';
import { RoundBtn, U } from './kit';
import { toggleFullscreen } from './FloatingControls';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** One combined progress bar, split by colour according to each player's share, names underneath. */
function ProgressBar() {
    const progress = useStore((s) => s.progress);
    const active = useStore((s) => s.active);
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const idxs = [0, 1, 2, 3].filter((i) => active[i]);
    const total = idxs.reduce((a, i) => a + progress[i], 0);
    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
        return !n || ['red', 'green', 'yellow', 'cyan'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };
    return (
        <div>
            <div className="flex overflow-hidden rounded-full border-2 border-white/40 bg-black/60" style={{ height: U(48) }}>
                {idxs.map((i) => (
                    <div
                        key={i}
                        className="flex items-center justify-center font-black text-white transition-[flex-grow] duration-500"
                        style={{ flexGrow: total === 0 ? 1 : Math.max(progress[i], 0.001), flexBasis: 0, background: hex(COLORS[i]), fontSize: U(24), textShadow: '0 1px 3px #000', color: '#fff' }}
                    >
                        {progress[i] > 0 ? `${progress[i]}%` : ''}
                    </div>
                ))}
            </div>
            <div className="flex" style={{ marginTop: U(4) }}>
                {idxs.map((i) => (
                    <div
                        key={i}
                        className="truncate text-center font-bold"
                        style={{ flexGrow: total === 0 ? 1 : Math.max(progress[i], 6), flexBasis: 0, color: hex(COLORS[i]), fontSize: U(20), textShadow: '0 1px 3px #000' }}
                    >
                        {players[i]?.avatar} {nm(i)}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function Hud() {
    const lang = useStore((s) => s.settings.lang);
    const popup = useStore((s) => s.popup);
    const result = useStore((s) => s.result);
    const players = useStore((s) => s.players);
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);
    const fs = useStore((s) => s.fullscreen);
    const modal = useStore((s) => s.modal);

    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
        return !n || ['red', 'green', 'yellow', 'cyan'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    return (
        <>
            <div className="hud-bar z-20"><ProgressBar /></div>
            <RoundBtn label="Settings" size={46} onClick={() => store.patch({ modal: 'settings' })} className="hud-gear z-20">⚙️</RoundBtn>

            {/* bottom-left: lucky wish; bottom-right: music + fullscreen */}
            <button
                onClick={() => bus.wish?.()}
                disabled={!wishUsable}
                aria-label="Lucky wish"
                className={`absolute z-20 flex items-center rounded-full border-2 font-black ${wishUsable ? 'pulse-wish border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-black' : 'border-white/20 bg-black/60 text-white/50'}`}
                style={{ left: U(16), bottom: U(18), height: U(64), padding: `0 ${U(18)}`, gap: U(8), fontSize: U(24) }}
            >
                ✨ {wishNums ? `${wishNums[0]},${wishNums[1]}` : 'no wish'}
            </button>
            <div className="absolute z-20 flex" style={{ right: U(16), bottom: U(18), gap: U(12) }}>
                <RoundBtn label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                <RoundBtn label="Fullscreen" onClick={toggleFullscreen}>{fs ? '⤡' : '⛶'}</RoundBtn>
            </div>

            {popup && !modal && (
                <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ bottom: U(130) }}>
                    <div
                        className="pop pointer-events-auto rounded-2xl border-2 text-center backdrop-blur"
                        style={{
                            padding: `${U(16)} ${U(30)}`, maxWidth: U(620),
                            borderColor: popup.kind === 'lucky' ? '#ffc83a' : popup.kind === 'penalty' ? '#ff4d4d' : '#18e0ff',
                            background: 'rgba(8,12,34,0.82)',
                        }}
                    >
                        <div className="font-black" style={{ fontSize: U(42), color: popup.kind === 'lucky' ? '#ffd84a' : popup.kind === 'penalty' ? '#ff6b6b' : '#7fe9ff' }}>
                            {popup.kind === 'lucky' ? '✨7 ' : popup.kind === 'penalty' ? '⚠️ ' : ''}{popup.title}
                        </div>
                        <div className="text-white/90" style={{ fontSize: U(26), marginTop: U(4) }}>{popup.sub}</div>
                        <button onClick={() => store.patch({ popup: null })} className="rounded-xl bg-white/15 font-bold" style={{ marginTop: U(10), padding: `${U(6)} ${U(26)}`, fontSize: U(24) }}>{tr(lang, 'ok')}</button>
                    </div>
                </div>
            )}

            {result && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75" style={{ padding: U(20) }}>
                    <div className="pop w-full rounded-2xl border-2 border-amber-300 bg-[#0e1530] text-center" style={{ maxWidth: U(560), padding: U(24) }}>
                        <div style={{ fontSize: U(70) }}>🏆</div>
                        <div className="font-black text-amber-300" style={{ fontSize: U(40) }}>{tr(lang, 'winT', { n: nm(result[0].idx) })}</div>
                        <div className="flex flex-col" style={{ gap: U(8), marginTop: U(16) }}>
                            {result.map((r, k) => (
                                <div key={r.idx} className="flex items-center justify-between rounded-xl bg-white/5" style={{ padding: `${U(10)} ${U(16)}`, borderLeft: `${U(8)} solid ${hex(COLORS[r.idx])}`, fontSize: U(26) }}>
                                    <span className="font-black">{['🥇', '🥈', '🥉', '4th'][k]} {players[r.idx].avatar} {nm(r.idx)}</span>
                                    <span className="font-bold text-white/80">{r.pct}%</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex" style={{ gap: U(12), marginTop: U(20) }}>
                            <button onClick={() => store.patch({ gameId: store.get().gameId + 1, result: null })} className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-black" style={{ padding: U(14), fontSize: U(26) }}>{tr(lang, 'again')}</button>
                            <button onClick={() => store.patch({ phase: 'menu', result: null })} className="flex-1 rounded-xl bg-white/10 font-bold" style={{ padding: U(14), fontSize: U(26) }}>{tr(lang, 'menu')}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
