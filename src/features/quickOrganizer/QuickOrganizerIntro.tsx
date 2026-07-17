import React, { useEffect, useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';

interface Props {
    userName: string;
    onDone: () => void;
}

interface Star {
    left: number;
    top: number;
    delay: number;
    duration: number;
    size: number;
}

const GREETING_MS = 120;
const SUBTITLE_MS = 280;
const HOLD_MS = 1250;

/** A short, continuous green launch sequence into the planning workspace. */
export const QuickOrganizerIntro: React.FC<Props> = ({ userName, onDone }) => {
    const [showGreeting, setShowGreeting] = useState(false);
    const [showSubtitle, setShowSubtitle] = useState(false);

    const stars = useMemo<Star[]>(() => (
        Array.from({ length: 22 }, () => ({
            left: Math.random() * 100,
            top: Math.random() * 100,
            delay: Math.random() * 0.6,
            duration: 0.72 + Math.random() * 0.6,
            size: 1 + Math.random() * 2,
        }))
    ), []);

    useEffect(() => {
        const t1 = window.setTimeout(() => setShowGreeting(true), GREETING_MS);
        const t2 = window.setTimeout(() => setShowSubtitle(true), SUBTITLE_MS);
        const t3 = window.setTimeout(onDone, HOLD_MS);
        return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
    }, [onDone]);

    return (
        <div
            className="fixed inset-0 z-[200] bg-gray-950 flex flex-col items-center justify-center gap-6 overflow-hidden"
        >
            <div className="qo-horizon absolute -inset-x-1/4 bottom-[-42%] h-[76%] blur-3xl pointer-events-none" style={{
                background: 'radial-gradient(ellipse at center, rgba(61,205,88,0.32), rgba(16,185,129,0.12) 38%, transparent 70%)',
            }} />
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(61,205,88,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(61,205,88,0.5) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
            }} />

            {stars.map((star, i) => (
                <div
                    key={i}
                    className="qo-particle absolute rounded-full bg-[#3DCD58] pointer-events-none"
                    style={{
                        left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size,
                        boxShadow: '0 0 5px rgba(61,205,88,0.8)',
                        animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s`,
                    }}
                />
            ))}

            <div className="qo-rocket-wrap relative w-24 h-24 flex items-center justify-center">
                <div className="qo-rocket-flame absolute bottom-[-19px] w-7 h-12 rounded-full bg-[#3DCD58] blur-md" />
                <div className="relative w-16 h-16 rounded-[1.4rem] bg-gradient-to-br from-[#5bec76] to-[#20a84a] flex items-center justify-center shadow-2xl shadow-emerald-500/40 border border-white/20">
                    <Rocket className="w-8 h-8 text-white -rotate-45" strokeWidth={2.5} />
                </div>
            </div>

            <div className="relative text-center">
                {showGreeting && <p className="qo-fade-up text-2xl font-black text-white tracking-tight">Ready, {userName}</p>}
                {showSubtitle && <p className="qo-fade-up text-[11px] font-bold text-[#3DCD58] uppercase tracking-[0.2em] mt-1.5">Launching your plan forward</p>}
            </div>

            <div className="relative w-48 h-[3px] rounded-full bg-gray-800 overflow-hidden">
                <div className="qo-progress h-full rounded-full" style={{ background: 'linear-gradient(90deg, #1f9d45, #3DCD58, #8af0a0)', animationDuration: `${HOLD_MS}ms` }} />
            </div>
        </div>
    );
};
