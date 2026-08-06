
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Sparkles, LayoutDashboard, Layout, CheckSquare, Activity,
  Mail, Bell, Timer, FolderOpen, Trophy, Check, ArrowLeftRight,
} from 'lucide-react';
import { AppViewKey } from './SettingsModal';
import { Opportunity } from '../types';
import { playSound } from '../services/soundService';

/**
 * Hands-on first-steps tutorial ("Oppy the guide"), launched from the bottom of
 * the Settings modal. The user picks English or Spanish up front, then builds a
 * REAL opportunity alongside the guide: "do" steps watch the live opportunity
 * data and auto-advance when the user completes the action; "tell" steps dim
 * the app and explain. Spotlight/halo targets are [data-tutorial] attributes.
 */

interface Props {
  opportunities: Opportunity[];
  onClose: () => void;
  /** Switch the top-level view so spotlight targets exist on screen. */
  onNavigate?: (view: AppViewKey) => void;
  /** Open the most recently created opportunity's expediente (steps that live inside it). */
  onOpenLatestOpportunity?: () => void;
  /** Open the Settings modal (the quick-links step happens inside it). */
  onOpenSettings?: () => void;
  /** Live count of saved general quick links (Settings), for the quick-links "do" step. */
  quickLinksCount?: number;
}

type Lang = 'en' | 'es';
type Loc<T = string> = { en: T; es: T };
type MascotPose = 'wave' | 'point' | 'cheer' | 'idle';
type CheckKind = 'createOpp' | 'editHeader' | 'changeStatus' | 'addTask' | 'completeTask' | 'addHistory' | 'addNote' | 'linkFolder' | 'addQuickLink';

interface TutorialStep {
  id: string;
  kind: 'tell' | 'do';
  chapter: Loc;
  title: Loc;
  body: Loc<React.ReactNode>;
  /** Value of a [data-tutorial="..."] attribute to spotlight (tell) or halo (do). */
  target?: string;
  /** Top-level view to navigate to before showing this step. */
  view?: AppViewKey;
  pose: MascotPose;
  illustration?: React.ReactNode;
  /** Live-data condition that completes a "do" step. */
  check?: CheckKind;
  /**
   * Automatic set-up run when the step activates, so the user never has to
   * close things or find their way back by hand: overlays are always closed
   * (via the `oos-tutorial-prepare` event), then optionally the latest
   * opportunity's expediente is opened and one of its tabs is clicked.
   */
  prepare?: { expediente?: boolean; clickTab?: string; settings?: boolean };
}

const B = ({ children }: { children: React.ReactNode }) => <b className="text-gray-800">{children}</b>;
const G = ({ children }: { children: React.ReactNode }) => <b className="text-[#2db64a]">{children}</b>;

const UI_TEXT = {
  next: { en: 'Next', es: 'Siguiente' },
  back: { en: 'Back', es: 'Atrás' },
  finish: { en: 'Finish', es: 'Terminar' },
  skipTour: { en: "Skip the tour — I'll explore on my own", es: 'Saltar el tutorial — exploraré por mi cuenta' },
  skipStep: { en: 'Skip this step', es: 'Saltar este paso' },
  minLeft: { en: 'min left', es: 'min restantes' },
  yourTurn: { en: 'Your turn', es: 'Tu turno' },
  waiting: { en: "Your move — I'll notice the moment you do it!", es: 'Es tu turno — ¡lo detecto en cuanto lo hagas!' },
  wellDone: { en: 'Nice! You did it', es: '¡Bien hecho! Lo lograste' },
  exit: { en: 'Exit tutorial (Esc)', es: 'Salir del tutorial (Esc)' },
  moveCard: { en: 'Move this card to the other side', es: 'Mover esta tarjeta al otro lado' },
} as const;

/* ------------------------------- Live-data checks ------------------------------- */

interface Baseline {
  count: number;
  tasks: number;
  doneTasks: number;
  history: number;
  notes: number;
  folderLinks: number;
  quickLinks: number;
  headerSig: Map<string, string>;
  statusSig: Map<string, string>;
}

const countAll = (opps: Opportunity[], pick: (o: Opportunity) => unknown[] | undefined) =>
  opps.reduce((n, o) => n + (pick(o)?.length || 0), 0);

const countDoneTasks = (opps: Opportunity[]) =>
  opps.reduce((n, o) => n + (o.tasks || []).filter(t => t.status === 'Done').length, 0);

const countFolderLinks = (opps: Opportunity[]) =>
  opps.reduce((n, o) => n + Object.values(o.folderPaths || {}).filter(Boolean).length, 0);

const takeSnapshot = (opps: Opportunity[], quickLinks: number): Baseline => ({
  count: opps.length,
  tasks: countAll(opps, o => o.tasks),
  doneTasks: countDoneTasks(opps),
  history: countAll(opps, o => o.history),
  notes: countAll(opps, o => o.notes),
  folderLinks: countFolderLinks(opps),
  quickLinks,
  headerSig: new Map(opps.map(o => [o.id, `${o.title}|${o.customer}`])),
  statusSig: new Map(opps.map(o => [o.id, o.detailedStatus || ''])),
});

const checkDone = (kind: CheckKind, base: Baseline, opps: Opportunity[], quickLinks: number): boolean => {
  switch (kind) {
    case 'createOpp': return opps.length > base.count;
    case 'editHeader': return opps.some(o => {
      const prev = base.headerSig.get(o.id);
      const cur = `${o.title}|${o.customer}`;
      return prev === undefined ? (o.title !== 'New Opportunity' || o.customer !== 'New Customer') : prev !== cur;
    });
    case 'changeStatus': return opps.some(o => {
      const prev = base.statusSig.get(o.id);
      return prev !== undefined && prev !== (o.detailedStatus || '');
    });
    case 'addTask': return countAll(opps, o => o.tasks) > base.tasks;
    case 'completeTask': return countDoneTasks(opps) > base.doneTasks;
    case 'addHistory': return countAll(opps, o => o.history) > base.history;
    case 'addNote': return countAll(opps, o => o.notes) > base.notes;
    case 'linkFolder': return countFolderLinks(opps) > base.folderLinks;
    case 'addQuickLink': return quickLinks > base.quickLinks;
  }
};

/* ---------------------------------- Mascot ---------------------------------- */

const Mascot: React.FC<{ pose: MascotPose; size?: number }> = ({ pose, size = 92 }) => (
  <div className={`tut-mascot tut-pose-${pose}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 120 126" width={size} height={size}>
      <defs>
        <linearGradient id="tutBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fe06c" />
          <stop offset="100%" stopColor="#2db64a" />
        </linearGradient>
      </defs>
      <ellipse className="tut-shadow" cx="60" cy="118" rx="26" ry="5" fill="#0f172a" opacity="0.12" />
      <g className="tut-body">
        {/* antenna */}
        <line x1="60" y1="26" x2="60" y2="12" stroke="#2db64a" strokeWidth="3" strokeLinecap="round" />
        <circle className="tut-antenna" cx="60" cy="9" r="5" fill="#FFD447" />
        {/* arms (behind body): drawn pointing +x, positioned via outer translate, rotated via CSS */}
        <g transform="translate(30, 84)">
          <g className="tut-arm tut-arm-l">
            <rect x="0" y="-5" width="26" height="10" rx="5" fill="#2db64a" />
            <circle cx="26" cy="0" r="6.5" fill="#3DCD58" />
          </g>
        </g>
        <g transform="translate(90, 84)">
          <g className="tut-arm tut-arm-r">
            <rect x="0" y="-5" width="26" height="10" rx="5" fill="#2db64a" />
            <circle cx="26" cy="0" r="6.5" fill="#3DCD58" />
          </g>
        </g>
        {/* body */}
        <ellipse cx="60" cy="72" rx="38" ry="40" fill="url(#tutBody)" />
        <ellipse cx="60" cy="84" rx="24" ry="20" fill="#ffffff" opacity="0.22" />
        {/* face */}
        <g className="tut-eyes">
          <circle cx="46" cy="62" r="8.5" fill="#ffffff" />
          <circle cx="74" cy="62" r="8.5" fill="#ffffff" />
          <circle cx="47.5" cy="63" r="4" fill="#1F2937" />
          <circle cx="75.5" cy="63" r="4" fill="#1F2937" />
        </g>
        <circle cx="38" cy="76" r="4.5" fill="#ff9db1" opacity="0.55" />
        <circle cx="82" cy="76" r="4.5" fill="#ff9db1" opacity="0.55" />
        <path d="M 50 80 Q 60 89 70 80" stroke="#14532d" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* feet */}
        <ellipse cx="47" cy="112" rx="9" ry="5" fill="#2db64a" />
        <ellipse cx="73" cy="112" rx="9" ry="5" fill="#2db64a" />
      </g>
    </svg>
  </div>
);

/* ------------------------------- Illustrations ------------------------------ */

const Vignette: React.FC<{ children: React.ReactNode; caption?: string }> = ({ children, caption }) => (
  <div className="mt-3 rounded-xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-4 overflow-hidden">
    {children}
    {caption && <div className="mt-2 text-center text-[9px] text-gray-400 font-medium">{caption}</div>}
  </div>
);

const IllusViews = () => (
  <Vignette>
    <div className="grid grid-cols-4 gap-2">
      {[
        { icon: <LayoutDashboard className="w-4 h-4 text-[#3DCD58]" />, label: 'General' },
        { icon: <Layout className="w-4 h-4 text-[#3DCD58]" />, label: 'Proposals' },
        { icon: <CheckSquare className="w-4 h-4 text-[#3DCD58]" />, label: 'Tasks' },
        { icon: <Activity className="w-4 h-4 text-[#3DCD58]" />, label: 'Indicators' },
      ].map((v, i) => (
        <div key={v.label} className="tut-pop rounded-lg bg-white border border-gray-200 shadow-sm p-2 flex flex-col items-center gap-1" style={{ animationDelay: `${i * 0.25}s` }}>
          {v.icon}
          <span className="text-[9px] font-bold text-gray-600">{v.label}</span>
        </div>
      ))}
    </div>
  </Vignette>
);

const IllusStatuses: React.FC<{ caption: string }> = ({ caption }) => (
  <Vignette caption={caption}>
    <div className="flex gap-2">
      {[
        { name: 'Working on it', color: '#2F6B4F' },
        { name: 'Review', color: '#315C8C' },
        { name: 'Info Needed', color: '#A33A3A' },
        { name: 'Completed', color: '#39745A' },
      ].map((col, i) => (
        <div key={col.name} className="flex-1 rounded-lg border border-gray-200 bg-white p-1.5">
          <div className="text-[8px] font-bold text-white rounded px-1 py-0.5 mb-1.5 text-center truncate" style={{ background: col.color }}>{col.name}</div>
          <div className="space-y-1">
            <div className="h-5 rounded bg-gray-100 border border-gray-200" />
            {i === 0 && <div className="tut-card-move h-5 rounded bg-emerald-50 border border-[#3DCD58]" />}
          </div>
        </div>
      ))}
    </div>
  </Vignette>
);

const IllusExpediente: React.FC<{ caption: string }> = ({ caption }) => (
  <Vignette caption={caption}>
    <div className="flex flex-wrap justify-center gap-1.5">
      {['KPI', 'History', 'Tasks', 'Commercial', 'Notes', 'Emails', 'Folder'].map((t, i) => (
        <span key={t} className="tut-tab-glow text-[9px] font-bold px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-600" style={{ animationDelay: `${i * 0.8}s` }}>{t}</span>
      ))}
    </div>
  </Vignette>
);

const IllusEmailMagic = () => (
  <Vignette>
    <div className="flex items-center justify-center gap-3">
      <div className="tut-bob-slow flex flex-col items-center gap-1">
        <div className="w-12 h-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center"><Mail className="w-5 h-5 text-[#3DCD58]" /></div>
        <span className="text-[8px] font-bold text-gray-400">SR email</span>
      </div>
      <div className="flex gap-0.5">
        {[0, 1, 2].map(i => <div key={i} className="tut-dot-flow w-1.5 h-1.5 rounded-full bg-[#3DCD58]" style={{ animationDelay: `${i * 0.25}s` }} />)}
      </div>
      <div className="w-32 rounded-lg bg-white border border-gray-200 shadow-sm p-2 space-y-1.5">
        {['Project', 'Client', 'Due date'].map((f, i) => (
          <div key={f} className="flex items-center gap-1.5">
            <div className="text-[7px] font-bold text-gray-400 uppercase w-10">{f}</div>
            <div className="tut-flash-green h-2.5 flex-1 rounded bg-gray-100" style={{ animationDelay: `${0.7 + i * 0.5}s` }} />
          </div>
        ))}
      </div>
    </div>
  </Vignette>
);

const IllusCustomize: React.FC<{ caption: string }> = ({ caption }) => (
  <Vignette caption={caption}>
    <div className="space-y-1.5 max-w-[240px] mx-auto">
      {[{ label: 'Indicators view', on: false }, { label: 'Export PDF button', on: false }, { label: 'Reminders bell', on: true }].map((row, i) => (
        <div key={row.label} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 shadow-sm px-2.5 py-1.5">
          <span className="text-[9px] font-bold text-gray-600">{row.label}</span>
          <div className={`${row.on ? 'tut-switch-on-anim' : 'tut-switch-off-anim'} relative w-7 h-4 rounded-full`} style={{ animationDelay: `${i * 0.6}s` }}>
            <div className="tut-knob absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow" />
          </div>
        </div>
      ))}
    </div>
  </Vignette>
);

const Keycap: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <span className="tut-keycap inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md border border-gray-300 border-b-2 bg-white text-[10px] font-black text-gray-700 shadow-sm" style={{ animationDelay: `${delay}s` }}>
    {children}
  </span>
);

const IllusShortcuts: React.FC<{ openApp: string; openFolder: string }> = ({ openApp, openFolder }) => (
  <Vignette>
    <div className="space-y-2.5 max-w-[280px] mx-auto">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-gray-200 shadow-sm px-3 py-2">
        <span className="flex items-center gap-1">
          <Keycap>Ctrl</Keycap><span className="text-gray-300 text-[10px] font-bold">+</span>
          <Keycap delay={0.12}>Alt</Keycap><span className="text-gray-300 text-[10px] font-bold">+</span>
          <Keycap delay={0.24}>O</Keycap>
        </span>
        <span className="text-[9px] font-bold text-gray-500 text-right">{openApp}</span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-gray-200 shadow-sm px-3 py-2">
        <span className="flex items-center gap-1">
          <Keycap delay={0.5}>Ctrl</Keycap><span className="text-gray-300 text-[10px] font-bold">+</span>
          <Keycap delay={0.62}>Shift</Keycap><span className="text-gray-300 text-[10px] font-bold">+</span>
          <Keycap delay={0.74}>E</Keycap>
        </span>
        <span className="text-[9px] font-bold text-gray-500 text-right">{openFolder}</span>
      </div>
    </div>
  </Vignette>
);

const IllusExtras = () => (
  <Vignette>
    <div className="flex items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <Bell className="tut-bell w-6 h-6 text-[#3DCD58]" />
        <span className="text-[8px] font-bold text-gray-400">Reminders</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Timer className="tut-spin-slow w-6 h-6 text-[#3DCD58]" />
        <span className="text-[8px] font-bold text-gray-400">Timer</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <FolderOpen className="tut-bob-slow w-6 h-6 text-[#3DCD58]" />
        <span className="text-[8px] font-bold text-gray-400">Folder</span>
      </div>
    </div>
  </Vignette>
);

const Confetti = () => {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.4 + Math.random() * 1.6,
    color: ['#3DCD58', '#FFD447', '#5B8DEF', '#FF7A8A', '#B78DEB'][i % 5],
    size: 6 + Math.random() * 5,
    rot: Math.random() * 360,
  })), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[320] overflow-hidden">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="tut-confetti absolute rounded-sm"
          style={{
            left: `${p.left}%`, top: '-12px', width: p.size, height: p.size * 0.6,
            background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
};

/* ----------------------------------- Steps ---------------------------------- */

const buildSteps = (lang: Lang): TutorialStep[] => {
  const cap = <T,>(loc: Loc<T>) => loc[lang];
  return [
    {
      id: 'welcome', kind: 'tell', pose: 'wave',
      chapter: { en: 'Welcome', es: 'Bienvenida' },
      title: { en: "Hi! I'm Oppy 👋", es: '¡Hola! Soy Oppy 👋' },
      body: {
        en: <>Welcome to <B>OpportunityOS</B>! This is a <G>hands-on tour</G>: in about <B>15 minutes</B> you'll create a real opportunity, add a task, log a history event, write a note and learn how to make the app yours. I explain — <B>you do the clicking</B>. What you build is real and stays after the tour. Press <B>Esc</B> to leave anytime.</>,
        es: <>¡Bienvenido a <B>OpportunityOS</B>! Este es un <G>tutorial práctico</G>: en unos <B>15 minutos</B> crearás una oportunidad real, agregarás una tarea, registrarás un evento en el historial, escribirás una nota y aprenderás a configurar la app a tu gusto. Yo explico — <B>tú haces los clics</B>. Lo que construyas es real y se queda al terminar. Presiona <B>Esc</B> para salir cuando quieras.</>,
      },
    },
    {
      id: 'nav', kind: 'tell', pose: 'point', target: 'nav-tabs',
      chapter: { en: 'Navigation', es: 'Navegación' },
      title: { en: 'Your command center', es: 'Tu centro de mando' },
      body: {
        en: <>These tabs are the four main views. <B>General</B> lists every opportunity. <B>Proposals</B> is a kanban board that follows the process. <B>Tasks</B> is your daily agenda and planning hub. <B>Indicators</B> turns your work into metrics. Views you hide in Settings disappear from this bar.</>,
        es: <>Estas pestañas son las cuatro vistas principales. <B>General</B> lista todas tus oportunidades. <B>Proposals</B> es un tablero kanban que sigue el proceso. <B>Tasks</B> es tu agenda diaria y centro de planeación. <B>Indicators</B> convierte tu trabajo en métricas. Las vistas que ocultes en Settings desaparecen de esta barra.</>,
      },
      illustration: <IllusViews />,
    },
    {
      id: 'create', kind: 'do', pose: 'point', view: 'general-dashboard', target: 'new-opportunity', check: 'createOpp',
      chapter: { en: 'Create', es: 'Crear' },
      title: { en: 'Create your first opportunity', es: 'Crea tu primera oportunidad' },
      body: {
        en: <>Click the green <G>+ New</G> button on the dashboard. A fresh opportunity is created with your default task list already loaded — and its <B>expediente</B> opens automatically.</>,
        es: <>Haz clic en el botón verde <G>+ New</G> del tablero. Se crea una oportunidad nueva con tu lista de tareas estándar ya cargada — y su <B>expediente</B> se abre automáticamente.</>,
      },
    },
    {
      id: 'expediente', kind: 'tell', pose: 'idle',
      chapter: { en: 'The Expediente', es: 'El Expediente' },
      title: { en: 'Mission control', es: 'El centro de control' },
      body: {
        en: <>This is the <B>expediente</B> — mission control for the deal you just created. Everything lives in tabs: <B>KPI</B> (metrics & dates), <B>History</B> (event log), <B>Tasks</B> (action plan), <B>Commercial</B> (prices & margins), <B>Notes</B>, <B>Emails</B> and the <B>Opportunity Folder</B> (local files).</>,
        es: <>Este es el <B>expediente</B> — el centro de control de la oportunidad que acabas de crear. Todo vive en pestañas: <B>KPI</B> (métricas y fechas), <B>History</B> (bitácora de eventos), <B>Tasks</B> (plan de acción), <B>Commercial</B> (precios y márgenes), <B>Notes</B>, <B>Emails</B> y el <B>Opportunity Folder</B> (archivos locales).</>,
      },
      illustration: <IllusExpediente caption={cap({ en: "The tabs of every expediente — hide the ones you don't use in Settings", es: 'Las pestañas de cada expediente — oculta las que no uses en Settings' })} />,
    },
    {
      id: 'fill', kind: 'do', pose: 'point', target: 'opp-title', check: 'editHeader', prepare: { expediente: true },
      chapter: { en: 'The Expediente', es: 'El Expediente' },
      title: { en: 'Give it a name', es: 'Ponle nombre' },
      body: {
        en: <>At the top, replace <B>"New Opportunity"</B> with a real title and <B>"New Customer"</B> with a client name, then press Tab or click elsewhere. This header is the deal's identity — seller, address, dates and labels live here too.</>,
        es: <>En la parte superior, cambia <B>"New Opportunity"</B> por un título real y <B>"New Customer"</B> por el nombre del cliente; luego presiona Tab o haz clic fuera. Este encabezado es la identidad del negocio — el vendedor, la dirección, las fechas y las etiquetas también viven aquí.</>,
      },
    },
    {
      id: 'statuses', kind: 'tell', pose: 'idle',
      chapter: { en: 'Statuses', es: 'Status' },
      title: { en: 'Statuses drive the board', es: 'Los status mueven el tablero' },
      body: {
        en: <>Two statuses drive everything. The <B>Principal Status</B> says how the deal ends (In Progress, Won, Lost…). The <B>Process Status</B> says where it is right now (Working on it, Review, Info Needed, Paused, Approval, Meeting, Completed). On the <B>Proposals</B> board every process status is a column — change it and the card moves.</>,
        es: <>Dos status lo controlan todo. El <B>Principal Status</B> dice cómo termina el negocio (In Progress, Won, Lost…). El <B>Process Status</B> dice dónde va ahora mismo (Working on it, Review, Info Needed, Paused, Approval, Meeting, Completed). En el tablero <B>Proposals</B> cada process status es una columna — cámbialo y la tarjeta se mueve.</>,
      },
      illustration: <IllusStatuses caption={cap({ en: 'Cards travel across the board as the process status changes', es: 'Las tarjetas cruzan el tablero cuando cambia el process status' })} />,
    },
    {
      id: 'status-do', kind: 'do', pose: 'point', target: 'process-status', check: 'changeStatus', prepare: { expediente: true },
      chapter: { en: 'Statuses', es: 'Status' },
      title: { en: 'Move your deal forward', es: 'Avanza tu negocio' },
      body: {
        en: <>In the header, change the <G>Process Status</G> dropdown to any other value — say <B>Review</B>. Later, look at the Proposals board: your card will be sitting in that column.</>,
        es: <>En el encabezado, cambia el <G>Process Status</G> a cualquier otro valor — por ejemplo <B>Review</B>. Después mira el tablero Proposals: tu tarjeta estará en esa columna.</>,
      },
    },
    {
      id: 'task-create', kind: 'do', pose: 'point', target: 'add-task', check: 'addTask',
      prepare: { expediente: true, clickTab: 'detail-tab-tasks' },
      chapter: { en: 'Tasks', es: 'Tareas' },
      title: { en: 'Create a task', es: 'Crea una tarea' },
      body: {
        en: <>I opened the <G>Tasks</G> tab for you. Click the glowing <G>+ Add Task</G> button — a <B>"New Task"</B> appears at the end of the list. Click it to give it a title, an <B>owner</B>, a <B>priority</B>, a <B>due date</B> and subtasks if you need them.</>,
        es: <>Ya te abrí la pestaña <G>Tasks</G>. Haz clic en el botón resaltado <G>+ Add Task</G> — aparecerá una <B>"New Task"</B> al final de la lista. Ábrela para ponerle título, <B>responsable</B>, <B>prioridad</B>, <B>fecha límite</B> y subtareas si las necesitas.</>,
      },
    },
    {
      id: 'task-close', kind: 'do', pose: 'point', check: 'completeTask',
      prepare: { expediente: true, clickTab: 'detail-tab-tasks' },
      chapter: { en: 'Tasks', es: 'Tareas' },
      title: { en: 'Now close one', es: 'Ahora cierra una' },
      body: {
        en: <>Finishing work feels great: change any task's <B>Status</B> to <G>Done</G> — use the status control right on the task row, or open the task and change it there. Golden rule: a task that <B>depends</B> on others stays <B>blocked from "Done"</B> until its dependencies finish, so the plan always runs in order.</>,
        es: <>Terminar se siente bien: cambia el <B>Status</B> de cualquier tarea a <G>Done</G> — usa el control de status en la fila de la tarea, o ábrela y cámbialo ahí. Regla de oro: una tarea que <B>depende</B> de otras queda <B>bloqueada para "Done"</B> hasta que sus dependencias terminen, así el plan siempre avanza en orden.</>,
      },
    },
    {
      id: 'history', kind: 'do', pose: 'point', target: 'add-history', check: 'addHistory',
      prepare: { expediente: true, clickTab: 'detail-tab-history' },
      chapter: { en: 'History', es: 'Historial' },
      title: { en: 'Log your first event', es: 'Registra tu primer evento' },
      body: {
        en: <>We're now in the <G>History</G> tab — the deal's diary. Click the highlighted <G>+ Add Entry</G> and write something like <i>"Kickoff meeting done"</i>. Milestones, status changes and automatic entries like <i>"I sent an email to…"</i> all land here — ready to copy, stamped with your name.</>,
        es: <>Estamos en la pestaña <G>History</G> — el diario del negocio. Haz clic en el resaltado <G>+ Add Entry</G> y escribe algo como <i>"Kickoff meeting done"</i>. Aquí caen los hitos, los cambios de status y las entradas automáticas como <i>"I sent an email to…"</i> — listos para copiar, firmados con tu nombre.</>,
      },
    },
    {
      id: 'note', kind: 'do', pose: 'point', target: 'add-note', check: 'addNote',
      prepare: { expediente: true, clickTab: 'detail-tab-notes' },
      chapter: { en: 'Notes', es: 'Notas' },
      title: { en: 'Write a note', es: 'Escribe una nota' },
      body: {
        en: <>This is the <G>Notes</G> tab. Click <G>Blank</G> (highlighted) or any template to create a note — meeting minutes, ideas, anything. Organize notes in folders and even create <B>inline tasks</B> right from a note's text.</>,
        es: <>Esta es la pestaña <G>Notes</G>. Haz clic en <G>Blank</G> (resaltado) o en cualquier plantilla para crear una nota — minutas, ideas, lo que sea. Organiza las notas en carpetas e incluso crea <B>tareas directamente desde el texto</B> de una nota.</>,
      },
    },
    {
      id: 'folder-link', kind: 'do', pose: 'point', target: 'link-folder', check: 'linkFolder',
      prepare: { expediente: true, clickTab: 'detail-tab-folder' },
      chapter: { en: 'Folder', es: 'Carpeta' },
      title: { en: 'Link a folder to this deal', es: 'Liga una carpeta a este negocio' },
      body: {
        en: <>This is the <G>Opportunity Folder</G> tab — your project files, right inside the deal. You have two ways to link one: <B>Link Existing Folder</B> picks a Windows folder you already have, while <B>Create from Template</B> builds a brand-new folder with your standard subfolder structure and then links it. Pick one now — once linked, you can browse, preview, pin and copy files without leaving the app.</>,
        es: <>Esta es la pestaña <G>Opportunity Folder</G> — los archivos del proyecto, dentro del negocio. Tienes dos formas de ligar una: <B>Link Existing Folder</B> elige una carpeta de Windows que ya tengas, y <B>Create from Template</B> crea una carpeta nueva con tu estructura estándar de subcarpetas y luego la liga. Elige una ahora — ya ligada, podrás navegar, previsualizar, fijar y copiar archivos sin salir de la app.</>,
      },
    },
    {
      id: 'file-revisions', kind: 'tell', pose: 'idle', target: 'create-file-revision',
      prepare: { expediente: true, clickTab: 'detail-tab-folder' },
      chapter: { en: 'Folder', es: 'Carpeta' },
      title: { en: 'Quick file revisions', es: 'Revisiones rápidas de archivos' },
      body: {
        en: <>No more <i>"quote_final_FINAL_v3"</i>. Select any <B>file</B> in your linked folder and click <G>Create revision</G>: the app copies the file, suggests the next name (<i>Quote R2.xlsx</i>), and asks what changed — building a clean <B>revision history</B> you can review anytime with <B>Revision history</B>. Perfect for quotes that go back and forth with the client.</>,
        es: <>Se acabó el <i>"cotización_final_FINAL_v3"</i>. Selecciona cualquier <B>archivo</B> de tu carpeta ligada y haz clic en <G>Create revision</G>: la app copia el archivo, sugiere el siguiente nombre (<i>Quote R2.xlsx</i>) y te pregunta qué cambió — construyendo un <B>historial de revisiones</B> limpio que puedes consultar con <B>Revision history</B>. Perfecto para cotizaciones que van y vienen con el cliente.</>,
      },
    },
    {
      id: 'shortcuts', kind: 'tell', pose: 'cheer', prepare: { expediente: true, clickTab: 'detail-tab-folder' },
      chapter: { en: 'Keyboard shortcuts', es: 'Atajos de teclado' },
      title: { en: 'Two shortcuts to rule them all', es: 'Dos atajos para dominarlo todo' },
      body: {
        en: <>Now that your deal has a linked folder, learn the speed moves. <G>Ctrl + Alt + O</G> opens <B>OpportunityOS from anywhere in Windows</B> — even with the app closed (the installer wires it up). <G>Ctrl + Shift + E</G>, with an expediente open, jumps straight to its <B>linked folder in Explorer</B> — and in the Folder tab it opens the <B>file or subfolder you have selected</B>, so any document is two keys away. Try <B>Ctrl + Shift + E</B> right now!</>,
        es: <>Ahora que tu negocio tiene carpeta ligada, aprende los movimientos rápidos. <G>Ctrl + Alt + O</G> abre <B>OpportunityOS desde cualquier lugar de Windows</B> — incluso con la app cerrada (el instalador lo configura). <G>Ctrl + Shift + E</G>, con un expediente abierto, salta directo a su <B>carpeta ligada en el Explorador</B> — y en la pestaña Folder abre el <B>archivo o subcarpeta que tengas seleccionado</B>, así cualquier documento queda a dos teclas. ¡Prueba <B>Ctrl + Shift + E</B> ahora mismo!</>,
      },
      illustration: <IllusShortcuts
        openApp={cap({ en: 'Open OpportunityOS from anywhere', es: 'Abre OpportunityOS desde donde sea' })}
        openFolder={cap({ en: 'Open the deal folder / selected file', es: 'Abre la carpeta del negocio / archivo seleccionado' })}
      />,
    },
    {
      id: 'autofill', kind: 'tell', pose: 'cheer', target: 'autofill-button', prepare: { expediente: true },
      chapter: { en: 'Email magic', es: 'Magia con correos' },
      title: { en: 'Auto-fill, step by step', es: 'Auto-fill, paso a paso' },
      body: {
        en: <>See the highlighted button? When a bFO Support Request email arrives: <B>1)</B> click <G>Auto-fill from Email</G>, <B>2)</B> drag the <B>.msg / .eml</B> straight from Outlook onto the window (or paste the email text), <B>3)</B> I read the project, client, dates, links and references, <B>4)</B> review the preview and apply. The whole expediente fills itself in seconds — no retyping.</>,
        es: <>¿Ves el botón resaltado? Cuando llegue un correo de Support Request de bFO: <B>1)</B> haz clic en <G>Auto-fill from Email</G>, <B>2)</B> arrastra el <B>.msg / .eml</B> directo desde Outlook a la ventana (o pega el texto del correo), <B>3)</B> yo leo el proyecto, cliente, fechas, links y referencias, <B>4)</B> revisa la vista previa y aplica. El expediente completo se llena solo en segundos — sin volver a teclear.</>,
      },
      illustration: <IllusEmailMagic />,
    },
    {
      id: 'header-tools', kind: 'tell', pose: 'idle', prepare: { expediente: true },
      chapter: { en: 'Header tools', es: 'Herramientas del encabezado' },
      title: { en: 'Three more header superpowers', es: 'Tres superpoderes más del encabezado' },
      body: {
        en: <><B>Email</B> composes an executive email from dynamic blocks — it detects first contact vs. follow-up and logs the send to History. <B>Revisions</B> creates Rev. B, C… when the client asks for a new version, carrying over whatever you choose. And <B>Copy Summary / Export PDF</B> turn the expediente into a shareable status in one click.</>,
        es: <><B>Email</B> redacta un correo ejecutivo con bloques dinámicos — detecta si es primer contacto o seguimiento y registra el envío en History. <B>Revisions</B> crea la Rev. B, C… cuando el cliente pide nueva versión, arrastrando lo que tú elijas. Y <B>Copy Summary / Export PDF</B> convierten el expediente en un status compartible con un clic.</>,
      },
    },
    {
      id: 'templates', kind: 'tell', pose: 'idle',
      chapter: { en: 'Templates', es: 'Plantillas' },
      title: { en: 'Build once, reuse forever', es: 'Créalo una vez, úsalo siempre' },
      body: {
        en: <>Templates live in <B>Settings</B>: <B>Task Standards</B> (checklists that auto-load into new opportunities and revisions), <B>Note templates</B> (some can auto-create) and <B>Email templates</B> with variables. Tune them once and every new deal starts half-done.</>,
        es: <>Las plantillas viven en <B>Settings</B>: <B>Task Standards</B> (listas que se cargan solas en oportunidades y revisiones nuevas), <B>plantillas de notas</B> (algunas se crean automáticamente) y <B>plantillas de correo</B> con variables. Configúralas una vez y cada negocio nuevo empieza medio hecho.</>,
      },
    },
    {
      id: 'tasksview', kind: 'tell', pose: 'point', view: 'tasks-dashboard',
      chapter: { en: 'Daily agenda', es: 'Agenda diaria' },
      title: { en: 'Your daily agenda', es: 'Tu agenda diaria' },
      body: {
        en: <>I brought you to the <B>Tasks</B> view: every task from <B>every</B> opportunity in one agenda. Overdue items stand out, you can filter by owner or area, plan your week, and jump straight into any task's expediente. Start your mornings here.</>,
        es: <>Te traje a la vista <B>Tasks</B>: todas las tareas de <B>todas</B> las oportunidades en una sola agenda. Lo vencido resalta, puedes filtrar por responsable o área, planear tu semana y saltar directo al expediente de cualquier tarea. Empieza tus mañanas aquí.</>,
      },
    },
    {
      id: 'quicklinks', kind: 'do', pose: 'point', target: 'quicklinks-card', check: 'addQuickLink',
      prepare: { settings: true },
      chapter: { en: 'Quick links', es: 'Quick links' },
      title: { en: 'Pin your favorite page', es: 'Ten a la mano tu página favorita' },
      body: {
        en: <>I opened <B>Settings</B> for you — find the <G>Quick links</G> card in the <B>General</B> tab. Click <B>+ Add link</B> and add a page you use every day (bFO, CQA, your team's SharePoint…): give it a short name and paste the URL — a Windows folder path works too. Then hit <G>Save Settings</G>. Your link appears as a round bubble above Sticky Notes, always one click away.</>,
        es: <>Ya te abrí <B>Settings</B> — busca la tarjeta <G>Quick links</G> en la pestaña <B>General</B>. Haz clic en <B>+ Add link</B> y agrega una página que uses todos los días (bFO, CQA, el SharePoint de tu equipo…): ponle un nombre corto y pega la URL — también sirve una ruta de carpeta de Windows. Luego presiona <G>Save Settings</G>. Tu link aparecerá como una burbuja redonda arriba de las Sticky Notes, siempre a un clic.</>,
      },
    },
    {
      id: 'customize', kind: 'tell', pose: 'point', target: 'settings-button',
      chapter: { en: 'Make it yours', es: 'Hazla tuya' },
      title: { en: 'Set it up to your taste', es: 'Configúrala a tu gusto' },
      body: {
        en: <>Everything hideable lives in <B>Settings</B>. <B>General</B> tab: hide top views and pick your start view (at least one must stay visible). <B>Expediente</B> tab: hide detail tabs and header buttons you never use. Plus sounds, alarms, labels, the timer and your user name. Preferences save automatically on this computer.</>,
        es: <>Todo lo que se puede ocultar vive en <B>Settings</B>. Pestaña <B>General</B>: oculta vistas y elige tu vista inicial (al menos una debe quedar visible). Pestaña <B>Expediente</B>: oculta pestañas del expediente y botones del encabezado que no uses. Además sonidos, alarmas, etiquetas, el timer y tu nombre de usuario. Las preferencias se guardan solas en esta computadora.</>,
      },
      illustration: <IllusCustomize caption={cap({ en: "Hide anything you don't use — bring it back whenever you want", es: 'Oculta lo que no uses — recupéralo cuando quieras' })} />,
    },
    {
      id: 'extras', kind: 'tell', pose: 'idle',
      chapter: { en: 'Power-ups', es: 'Extras' },
      title: { en: 'Handy power-ups', es: 'Extras útiles' },
      body: {
        en: <>Worth knowing: the <B>Reminders</B> bell (enable it in Settings), the floating <B>Timer</B> to track time per task, the <B>Process Radial</B> widget, <B>Sticky Notes</B>, and the <B>Opportunity Folder</B> linking local files to each deal. Your data lives in a local database file — manage it with <B>Open DB / New DB</B> in the top bar.</>,
        es: <>Vale la pena conocer: la campana de <B>Reminders</B> (actívala en Settings), el <B>Timer</B> flotante para medir tiempo por tarea, el widget <B>Process Radial</B>, las <B>Sticky Notes</B> y el <B>Opportunity Folder</B> que vincula archivos locales a cada negocio. Tus datos viven en un archivo de base de datos local — adminístralo con <B>Open DB / New DB</B> en la barra superior.</>,
      },
      illustration: <IllusExtras />,
    },
    {
      id: 'done', kind: 'tell', pose: 'cheer',
      chapter: { en: 'You made it!', es: '¡Lo lograste!' },
      title: { en: "You're ready! 🏆", es: '¡Estás listo! 🏆' },
      body: {
        en: <>Look at what you built during this tour: a real opportunity with a title, a status, a task created <i>and</i> closed, a history entry and a note. Keep it or delete it — it's yours. This tour always waits at the bottom of <B>Settings</B> if you want a refresher. Now go win that tender!</>,
        es: <>Mira lo que construiste durante el tutorial: una oportunidad real con título, status, una tarea creada <i>y</i> cerrada, un evento en el historial y una nota. Consérvala o bórrala — es tuya. Este tutorial siempre te espera al final de <B>Settings</B> por si quieres repasar. ¡Ahora ve y gana esa licitación!</>,
      },
    },
  ];
};

/* --------------------------------- Component -------------------------------- */

const CARD_W = 440;
const DO_CARD_W = 360;

export const InteractiveTutorial: React.FC<Props> = ({ opportunities, onClose, onNavigate, onOpenLatestOpportunity, onOpenSettings, quickLinksCount = 0 }) => {
  const [lang, setLang] = useState<Lang | null>(null);
  const [index, setIndex] = useState(0);
  // rect is tagged with the step index it belongs to so a new step never paints
  // one frame with the previous step's position (that read as a corner→center jump).
  const [loc, setLoc] = useState<{ idx: number; rect: { top: number; left: number; width: number; height: number } | null }>({ idx: -1, rect: null });
  const [celebrating, setCelebrating] = useState(false);
  const [dockLeft, setDockLeft] = useState(false);
  const baselineRef = useRef<Baseline | null>(null);
  const celebratingRef = useRef(false);
  const advanceTimer = useRef<number | undefined>(undefined);

  const steps = useMemo(() => (lang ? buildSteps(lang) : []), [lang]);
  const step: TutorialStep | undefined = steps[index];
  const isLast = !!lang && index === steps.length - 1;
  const t = useCallback(<T,>(loc: Loc<T>): T => loc[lang || 'en'], [lang]);

  const goNext = useCallback(() => setIndex(i => Math.min(i + 1, Math.max(steps.length - 1, 0))), [steps.length]);
  const goBack = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  // Step activation: reset celebration, snapshot live data, then take the user
  // to the right place automatically — close any open overlays, open the
  // expediente and click the tab the step needs, so they never have to close
  // things or find their way back by hand.
  useEffect(() => {
    if (!lang || !step) return;
    celebratingRef.current = false;
    setCelebrating(false);
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    baselineRef.current = takeSnapshot(opportunities, quickLinksCount);
    window.dispatchEvent(new CustomEvent('oos-tutorial-prepare'));
    if (step.view && onNavigate) onNavigate(step.view);
    if (step.id === 'done') playSound('triad');

    const prep = step.prepare;
    if (!prep) return;
    if (prep.settings && onOpenSettings) onOpenSettings();
    if (prep.expediente && onOpenLatestOpportunity) {
      const expedienteVisible = () => {
        const el = document.querySelector('[data-tutorial="opp-title"]');
        return !!el && el.getBoundingClientRect().width > 0;
      };
      if (!expedienteVisible()) onOpenLatestOpportunity();
    }
    if (prep.clickTab) {
      let tries = 0;
      let clicked = false;
      const timer = window.setInterval(() => {
        tries += 1;
        if (!clicked) {
          const els = document.querySelectorAll(`[data-tutorial="${prep.clickTab}"]`);
          for (let i = els.length - 1; i >= 0; i--) {
            const el = els[i] as HTMLElement;
            if (el.getBoundingClientRect().width > 0) { el.click(); clicked = true; break; }
          }
        }
        if (clicked || tries > 20) window.clearInterval(timer);
      }, 150);
      return () => window.clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, lang]);

  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);

  // "Do" steps: watch the live data and auto-advance once the action is done.
  useEffect(() => {
    if (!lang || !step || step.kind !== 'do' || !step.check || !baselineRef.current) return;
    if (celebratingRef.current) return;
    if (checkDone(step.check, baselineRef.current, opportunities, quickLinksCount)) {
      celebratingRef.current = true;
      setCelebrating(true);
      playSound('chime');
      advanceTimer.current = window.setTimeout(() => goNext(), 1000);
    }
  }, [opportunities, quickLinksCount, index, lang, step, goNext]);

  // Locate + track the spotlight/halo target. useLayoutEffect + step-tagged
  // state means the very first painted frame of a step already has the right
  // position — no corner-to-center jump between slides.
  useLayoutEffect(() => {
    const measure = () => {
      if (!step?.target) return null;
      const els = document.querySelectorAll(`[data-tutorial="${step.target}"]`);
      for (let i = els.length - 1; i >= 0; i--) {
        const r = els[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
      }
      return null;
    };
    setLoc({ idx: index, rect: measure() });
    if (!step?.target) return;
    const track = () => {
      const r = measure();
      setLoc(prev => {
        if (prev.idx === index && ((prev.rect === null && r === null) || (prev.rect && r
          && Math.abs(prev.rect.top - r.top) < 1 && Math.abs(prev.rect.left - r.left) < 1
          && Math.abs(prev.rect.width - r.width) < 1 && Math.abs(prev.rect.height - r.height) < 1))) return prev;
        return { idx: index, rect: r };
      });
    };
    const timer = window.setInterval(track, 250);
    window.addEventListener('resize', track);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', track); };
  }, [index, step?.target, lang]);

  const rect = loc.idx === index ? loc.rect : null;

  // Keyboard: Esc always exits; arrows/Enter navigate "tell" steps only, and
  // never while the user is typing in a real input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape' && !typing) { onClose(); return; }
      if (!lang || !step || step.kind !== 'tell' || typing) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (isLast) onClose(); else goNext(); }
      else if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goBack, onClose, isLast, lang, step]);

  const minutesLeft = lang ? Math.max(1, Math.round((steps.length - index) * 0.75)) : 15;
  const progressPct = lang ? ((index + 1) / steps.length) * 100 : 0;

  /* ------------------------------ Language picker ------------------------------ */

  if (!lang) {
    return (
      <div className="fixed inset-0 z-[300]">
        <style>{TUTORIAL_CSS}</style>
        <div className="fixed inset-0" style={{ background: 'rgba(15,23,42,0.72)' }} onClick={() => { /* modal */ }} />
        <div className="tut-card-in fixed z-[310] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: CARD_W, maxWidth: 'calc(100vw - 32px)' }}>
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 px-6 pt-4 pb-6 text-center">
            <button onClick={onClose} title="Exit (Esc) / Salir (Esc)" className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex justify-center"><Mascot pose="wave" size={104} /></div>
            <h3 className="mt-1 text-lg font-bold text-gray-800">Choose your tutorial language</h3>
            <p className="text-sm text-gray-400 font-medium">Elige el idioma del tutorial</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => setLang('en')}
                className="group rounded-2xl border-2 border-gray-100 hover:border-[#3DCD58] bg-white p-4 transition-all hover:shadow-lg hover:shadow-emerald-500/10 active:scale-95"
              >
                <div className="text-2xl">🇺🇸</div>
                <div className="mt-1 text-sm font-bold text-gray-800 group-hover:text-[#2db64a]">English</div>
                <div className="text-[10px] text-gray-400 font-medium">Hands-on tour · ~15 min</div>
              </button>
              <button
                onClick={() => setLang('es')}
                className="group rounded-2xl border-2 border-gray-100 hover:border-[#3DCD58] bg-white p-4 transition-all hover:shadow-lg hover:shadow-emerald-500/10 active:scale-95"
              >
                <div className="text-2xl">🇲🇽</div>
                <div className="mt-1 text-sm font-bold text-gray-800 group-hover:text-[#2db64a]">Español</div>
                <div className="text-[10px] text-gray-400 font-medium">Tutorial práctico · ~15 min</div>
              </button>
            </div>
            <p className="mt-4 text-[10px] text-gray-300 font-medium">The app itself stays in English · La aplicación permanece en inglés</p>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  /* --------------------------------- "Do" steps -------------------------------- */

  if (step.kind === 'do') {
    return (
      <div className="fixed inset-0 z-[300] pointer-events-none">
        <style>{TUTORIAL_CSS}</style>

        {/* Halo around the element the user should interact with (never blocks clicks) */}
        {rect && (
          <div
            className="tut-halo fixed rounded-xl pointer-events-none"
            style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
          />
        )}

        {/* Docked instruction card */}
        <div
          key={step.id}
          className={`tut-card-in fixed bottom-5 ${dockLeft ? 'left-5' : 'right-5'} pointer-events-auto`}
          style={{ width: DO_CARD_W, maxWidth: 'calc(100vw - 32px)' }}
        >
          <div className={`relative bg-white rounded-2xl shadow-2xl border ${celebrating ? 'border-[#3DCD58]' : 'border-gray-100'} px-4 pt-3 pb-4 transition-colors`}>
            <div className="flex items-start gap-2">
              <div className="shrink-0 -mt-6"><Mascot pose={celebrating ? 'cheer' : step.pose} size={64} /></div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[#2db64a] bg-emerald-50 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" /> {t(UI_TEXT.yourTurn)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-medium text-gray-300">{index + 1}/{steps.length}</span>
                    <button onClick={() => setDockLeft(v => !v)} title={t(UI_TEXT.moveCard)} className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onClose} title={t(UI_TEXT.exit)} className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-1 text-sm font-bold text-gray-800 leading-tight">{t(step.title)}</h3>
              </div>
            </div>

            <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">{t(step.body)}</p>

            {/* Status row: waiting vs. success */}
            {celebrating ? (
              <div className="tut-pop mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#3DCD58]"><Check className="w-3.5 h-3.5 text-white" /></span>
                <span className="text-xs font-bold text-emerald-700">{t(UI_TEXT.wellDone)} 🎉</span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => <div key={i} className="tut-dot-flow w-1.5 h-1.5 rounded-full bg-[#3DCD58]" style={{ animationDelay: `${i * 0.25}s` }} />)}
                </div>
                <span className="text-[11px] font-medium text-gray-400">{t(UI_TEXT.waiting)}</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <button onClick={goBack} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-gray-400 hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" /> {t(UI_TEXT.back)}
              </button>
              <div className="flex-1 mx-3 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#3DCD58] to-emerald-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <button onClick={goNext} className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                {t(UI_TEXT.skipStep)}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- "Tell" steps ------------------------------- */

  const cardStyle: React.CSSProperties = rect
    ? {
      top: rect.top + rect.height + 18,
      left: Math.min(Math.max(rect.left + rect.width / 2 - CARD_W / 2, 16), window.innerWidth - CARD_W - 16),
    }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[300]">
      <style>{TUTORIAL_CSS}</style>

      {rect ? (
        <div
          className="tut-spot fixed rounded-xl border-2 border-[#3DCD58] pointer-events-none"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)' }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: 'rgba(15,23,42,0.72)' }} />
      )}
      {/* Click shield: "tell" steps are read-only */}
      <div className="fixed inset-0" onClick={() => { /* swallow clicks */ }} />

      {isLast && <Confetti />}

      <div key={step.id} className="tut-card-in fixed z-[310]" style={{ ...cardStyle, width: CARD_W, maxWidth: 'calc(100vw - 32px)' }}>
        <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100">
          <div className="absolute -top-12 -left-5">
            <Mascot pose={step.pose} />
          </div>

          <div className="pt-4 px-5 pb-5">
            <div className="flex items-center justify-between pl-20">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#2db64a] bg-emerald-50 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" /> {t(step.chapter)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-400">~{minutesLeft} {t(UI_TEXT.minLeft)}</span>
                <button onClick={onClose} title={t(UI_TEXT.exit)} className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <h3 className="mt-2 pl-20 text-lg font-bold text-gray-800 leading-tight">{t(step.title)}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{t(step.body)}</p>

            {step.illustration}

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={goBack}
                disabled={index === 0}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${index === 0 ? 'text-gray-300 cursor-default' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <ChevronLeft className="w-4 h-4" /> {t(UI_TEXT.back)}
              </button>

              <div className="flex-1 mx-3">
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#3DCD58] to-emerald-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-1 text-center text-[9px] font-bold text-gray-300">{index + 1} / {steps.length}</div>
              </div>

              {isLast ? (
                <button onClick={onClose} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#3DCD58] to-emerald-500 hover:from-[#2db64a] hover:to-emerald-600 shadow-lg shadow-emerald-500/25 transition-all active:scale-95">
                  <Trophy className="w-4 h-4" /> {t(UI_TEXT.finish)}
                </button>
              ) : (
                <button onClick={goNext} className="flex items-center gap-1 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#3DCD58] to-emerald-500 hover:from-[#2db64a] hover:to-emerald-600 shadow-lg shadow-emerald-500/25 transition-all active:scale-95">
                  {t(UI_TEXT.next)} <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {index === 0 && (
              <button onClick={onClose} className="mt-2 w-full text-center text-[10px] font-bold text-gray-300 hover:text-gray-500 transition-colors">
                {t(UI_TEXT.skipTour)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ----------------------------------- CSS ------------------------------------ */

const TUTORIAL_CSS = `
@keyframes tutBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes tutBobFast { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@keyframes tutBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes tutAntenna { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.25); } }
@keyframes tutWave { 0%, 100% { transform: rotate(-45deg); } 50% { transform: rotate(-85deg); } }
@keyframes tutCheerL { 0%, 100% { transform: rotate(-120deg); } 50% { transform: rotate(-100deg); } }
@keyframes tutCheerR { 0%, 100% { transform: rotate(-60deg); } 50% { transform: rotate(-80deg); } }
@keyframes tutPoint { 0%, 100% { transform: rotate(-15deg) translateX(0); } 50% { transform: rotate(-15deg) translateX(3px); } }
@keyframes tutCardIn { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes tutSpotPulse { 0%, 100% { border-color: #3DCD58; } 50% { border-color: #a7f3c0; } }
@keyframes tutHalo { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes tutPop { from { opacity: 0; transform: translateY(8px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes tutTabGlow { 0%, 12%, 100% { border-color: #e5e7eb; color: #4b5563; background: #ffffff; box-shadow: none; } 5% { border-color: #3DCD58; color: #15803d; background: #ecfdf5; box-shadow: 0 0 0 3px rgba(61, 205, 88, 0.18); } }
@keyframes tutDotFlow { 0% { opacity: 0.15; transform: translateX(-3px); } 50% { opacity: 1; } 100% { opacity: 0.15; transform: translateX(3px); } }
@keyframes tutFlashGreen { 0%, 100% { background: #f3f4f6; } 30%, 70% { background: #bbf7d0; } }
@keyframes tutSwitchOn { 0%, 40% { background: #d1d5db; } 60%, 100% { background: #3DCD58; } }
@keyframes tutSwitchOff { 0%, 40% { background: #3DCD58; } 60%, 100% { background: #d1d5db; } }
@keyframes tutKnobOn { 0%, 40% { transform: translateX(0); } 60%, 100% { transform: translateX(12px); } }
@keyframes tutKnobOff { 0%, 40% { transform: translateX(12px); } 60%, 100% { transform: translateX(0); } }
@keyframes tutBell { 0%, 76%, 100% { transform: rotate(0); } 80% { transform: rotate(14deg); } 84% { transform: rotate(-12deg); } 88% { transform: rotate(8deg); } 92% { transform: rotate(-5deg); } }
@keyframes tutKeyPress { 0%, 18%, 100% { transform: translateY(0); box-shadow: 0 1px 0 rgba(0,0,0,0.08); } 8% { transform: translateY(2px); box-shadow: none; background: #ecfdf5; border-color: #3DCD58; color: #15803d; } }
@keyframes tutSpinSlow { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes tutConfetti { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(105vh) rotate(560deg); opacity: 0.75; } }
@keyframes tutCardMove { 0%, 15% { opacity: 1; transform: translateX(0); } 45%, 100% { opacity: 0; transform: translateX(60px); } }

/* No CSS filter here on purpose: drop-shadow forces the whole SVG to re-rasterize
   every animation frame and makes the tutorial feel janky. The painted ellipse
   under the feet provides the shadow instead. */
.tut-mascot { position: relative; }
.tut-body { animation: tutBob 2.6s ease-in-out infinite; transform-origin: 60px 72px; will-change: transform; }
.tut-pose-cheer .tut-body { animation: tutBobFast 0.9s ease-in-out infinite; }
.tut-eyes { animation: tutBlink 4.2s infinite; transform-origin: 60px 62px; }
.tut-antenna { animation: tutAntenna 1.8s ease-in-out infinite; transform-origin: 60px 9px; }
/* Pivot at the shoulder joint: the arm group's bbox spans y −6.5..6.5, so the joint (0,0) sits 6.5px below the bbox top. */
.tut-arm { transform-box: fill-box; transform-origin: 0px 6.5px; }
.tut-arm-l { transform: rotate(120deg); }
.tut-arm-r { transform: rotate(60deg); }
.tut-pose-wave .tut-arm-r { animation: tutWave 0.9s ease-in-out infinite; }
.tut-pose-point .tut-arm-r { animation: tutPoint 1.4s ease-in-out infinite; }
.tut-pose-cheer .tut-arm-l { animation: tutCheerL 0.9s ease-in-out infinite; }
.tut-pose-cheer .tut-arm-r { animation: tutCheerR 0.9s ease-in-out infinite; }

.tut-card-in { animation: tutCardIn 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.tut-spot { animation: tutSpotPulse 1.6s ease-in-out infinite; transition: top 0.3s, left 0.3s, width 0.3s, height 0.3s; }
.tut-halo { box-shadow: 0 0 0 3px rgba(61, 205, 88, 0.6), 0 0 20px 5px rgba(61, 205, 88, 0.3); animation: tutHalo 1.3s ease-in-out infinite; transition: top 0.25s, left 0.25s, width 0.25s, height 0.25s; will-change: opacity; }
.tut-pop { animation: tutPop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
.tut-tab-glow { animation: tutTabGlow 5.6s ease-in-out infinite; }
.tut-dot-flow { animation: tutDotFlow 1.1s ease-in-out infinite; }
.tut-flash-green { animation: tutFlashGreen 2.6s ease-in-out infinite; }
.tut-switch-on-anim { animation: tutSwitchOn 3.2s ease-in-out infinite alternate; }
.tut-switch-off-anim { animation: tutSwitchOff 3.2s ease-in-out infinite alternate; }
.tut-switch-on-anim .tut-knob { animation: tutKnobOn 3.2s ease-in-out infinite alternate; }
.tut-switch-off-anim .tut-knob { animation: tutKnobOff 3.2s ease-in-out infinite alternate; }
.tut-bell { animation: tutBell 3.4s ease-in-out infinite; transform-origin: top center; }
.tut-keycap { animation: tutKeyPress 3.2s ease-in-out infinite; }
.tut-spin-slow { animation: tutSpinSlow 7s linear infinite; }
.tut-bob-slow { animation: tutBob 2.4s ease-in-out infinite; }
.tut-confetti { animation-name: tutConfetti; animation-timing-function: ease-in; animation-iteration-count: 1; animation-fill-mode: forwards; }
.tut-card-move { animation: tutCardMove 3s ease-in-out infinite; }
`;

export default InteractiveTutorial;
