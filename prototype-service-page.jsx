import { useState, useMemo } from 'react';
import {
  Search,
  Clock,
  Users,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Grid3X3,
  QrCode,
  Settings,
  Plus,
  Utensils,
  CheckCircle2,
} from 'lucide-react';

// ─── Mock Data ──────────────────────────────────────────────
const ZONES = [
  { id: 'z1', name: 'Main Room', color: 'bg-emerald-400' },
  { id: 'z2', name: 'Patio', color: 'bg-blue-400' },
  { id: 'z3', name: 'Terrace', color: 'bg-rose-400' },
];

const TABLES = [
  { id: 't1', zone: 'z1', number: 'T1', capacity: 2, status: 'occupied', person: 'John Doe' },
  { id: 't12', zone: 'z1', number: 'T12', capacity: 2, status: 'vacant', person: null },
  { id: 't-big', zone: 'z1', number: '', capacity: 6, status: 'vacant', person: null },
  {
    id: 't9',
    zone: 'z3',
    number: 'T9',
    capacity: 4,
    status: 'reserved',
    person: 'Sarah K.',
    time: '8:15',
  },
  { id: 't2', zone: 'z1', number: 'T2', capacity: 2, status: 'occupied', person: 'Emma Clark' },
  { id: 't6', zone: 'z2', number: 'T6', capacity: 4, status: 'occupied', person: 'David Joh...' },
  { id: 't10', zone: 'z3', number: 'T10', capacity: 2, status: 'occupied', person: 'Emma Watson' },
  {
    id: 't5',
    zone: 'z2',
    number: 'T5',
    capacity: 4,
    status: 'reserved',
    person: 'Cathy',
    time: '8:30',
  },
  { id: 't7', zone: 'z2', number: 'T7', capacity: 2, status: 'vacant', person: null },
  { id: 't3', zone: 'z1', number: 'T3', capacity: 4, status: 'occupied', person: 'Maria' },
  { id: 't8', zone: 'z2', number: 'T8', capacity: 2, status: 'vacant', person: null },
  { id: 't11', zone: 'z3', number: 'T11', capacity: 2, status: 'occupied', person: 'John Davis' },
];

const SEATED = [
  {
    time: '6:00',
    ampm: 'PM',
    name: 'John Doe',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T1',
    color: 'occupied',
  },
  {
    time: '6:10',
    ampm: 'PM',
    name: 'Emma Clark',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T2',
    color: 'occupied',
    icon: 'star',
  },
  {
    time: '6:20',
    ampm: '',
    name: 'David Johnson',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T11',
    color: 'occupied',
  },
  {
    time: '7:00',
    ampm: 'PM',
    name: 'John Davis',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T11',
    color: 'occupied',
  },
  {
    time: '7:05',
    ampm: '',
    name: 'Maria',
    phone: '',
    guests: 3,
    room: 'Main Room',
    table: 'T10',
    color: 'occupied',
    icon: 'check',
  },
  {
    time: '7:37',
    ampm: '',
    name: 'Emma Watson',
    phone: '',
    guests: 3,
    room: 'Main Room',
    table: 'T10',
    color: 'occupied',
    icon: 'check',
  },
];

const UPCOMING = [
  {
    time: '8:15',
    ampm: 'PM',
    name: 'Sarah K.',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T9',
    color: 'reserved',
  },
  {
    time: '8:30',
    ampm: '',
    name: 'Cathy Clark',
    phone: '06254989796',
    guests: 3,
    room: 'Main Room',
    table: 'T6',
    color: 'reserved',
  },
];

// ─── Chair Layout ───────────────────────────────────────────
function getChairLayout(capacity) {
  const c = Math.min(capacity, 12);
  if (c <= 1) return { top: 1, right: 0, bottom: 0, left: 0 };
  if (c === 2) return { top: 1, right: 0, bottom: 1, left: 0 };
  if (c === 3) return { top: 1, right: 1, bottom: 1, left: 0 };
  if (c === 4) return { top: 1, right: 1, bottom: 1, left: 1 };
  if (c === 5) return { top: 2, right: 1, bottom: 1, left: 1 };
  if (c === 6) return { top: 2, right: 1, bottom: 2, left: 1 };
  if (c === 7) return { top: 2, right: 2, bottom: 2, left: 1 };
  if (c === 8) return { top: 2, right: 2, bottom: 2, left: 2 };
  return { top: 3, right: 3, bottom: 3, left: 3 };
}

// ─── Status Colors ──────────────────────────────────────────
function getStatusStyles(status) {
  switch (status) {
    case 'occupied':
      return {
        chair: 'bg-emerald-400',
        border: 'border-l-emerald-400',
        text: 'text-emerald-400',
        label: 'Occupied',
      };
    case 'reserved':
      return {
        chair: 'bg-amber-400',
        border: 'border-l-amber-400',
        text: 'text-amber-400',
        label: 'Reserved',
      };
    default:
      return {
        chair: 'bg-gray-500/40',
        border: 'border-l-transparent',
        text: 'text-gray-500',
        label: 'Vacant',
      };
  }
}

function getBadgeStyles(color) {
  if (color === 'occupied') return 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30';
  if (color === 'reserved') return 'bg-amber-400/20 text-amber-400 border-amber-400/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

// ─── Chair Row Component ────────────────────────────────────
// Chaises = petites barres arrondies, vues de dessus (plan de table)
// Forme: rectangle compact aux coins bien arrondis, ratio ~3:1
// Collees au bord de la carte (2px gap)
function ChairRow({ count, direction, color }) {
  if (count === 0) return null;
  const isH = direction === 'horizontal';
  return (
    <div
      className={`flex items-center justify-center ${isH ? 'flex-row' : 'flex-col'}`}
      style={{ gap: isH ? 5 : 4 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${color}`}
          style={
            isH
              ? { width: 24, height: 8, borderRadius: 4 }
              : { width: 8, height: 24, borderRadius: 4 }
          }
        />
      ))}
    </div>
  );
}

// ─── Visual Table Card ──────────────────────────────────────
function TableCard({ table }) {
  const chairs = getChairLayout(table.capacity);
  const s = getStatusStyles(table.status);

  return (
    <div className="flex flex-col items-center">
      {/* Chairs top — quasi collees a la carte (2px gap) */}
      <div className="flex items-end justify-center" style={{ marginBottom: 2 }}>
        <ChairRow count={chairs.top} direction="horizontal" color={s.chair} />
      </div>

      {/* Middle row: left chairs + card + right chairs */}
      <div className="flex items-stretch w-full" style={{ gap: 2 }}>
        {/* Left chairs */}
        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.left} direction="vertical" color={s.chair} />
        </div>

        {/* Table surface */}
        <div
          className={`flex-1 border-l-[3px] ${s.border} flex flex-col`}
          style={{
            backgroundColor: 'rgba(38, 42, 56, 0.9)',
            borderRadius: 8,
            minHeight: 120,
          }}
        >
          {/* Table number */}
          <div className="px-3 pt-3">
            <span className="text-sm font-bold text-gray-200">{table.number}</span>
          </div>

          {/* Content */}
          <div className="mt-auto px-3 pb-3">
            {table.person && (
              <p className="text-xs font-semibold text-gray-200 leading-tight">{table.person}</p>
            )}
            <p className={`text-[11px] font-bold mt-0.5 ${s.text}`}>{s.label}</p>
            {table.status === 'reserved' && table.time && (
              <p className={`text-[10px] ${s.text} mt-0.5`}>{table.time}</p>
            )}
          </div>
        </div>

        {/* Right chairs */}
        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.right} direction="vertical" color={s.chair} />
        </div>
      </div>

      {/* Chairs bottom — quasi collees a la carte (2px gap) */}
      <div className="flex items-start justify-center" style={{ marginTop: 2 }}>
        <ChairRow count={chairs.bottom} direction="horizontal" color={s.chair} />
      </div>
    </div>
  );
}

// ─── Sidebar Entry ──────────────────────────────────────────
function SidebarEntry({ entry }) {
  const badgeClass = getBadgeStyles(entry.color);
  const barColor = entry.color === 'occupied' ? 'border-l-emerald-400' : 'border-l-amber-400';

  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 px-2 border-l-[3px] ${barColor} rounded-r-md`}
      style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      {/* Time */}
      <div className="shrink-0 text-center" style={{ minWidth: 42 }}>
        <p className="text-xs font-bold text-gray-300 leading-tight">{entry.time}</p>
        {entry.ampm && <p className="text-[9px] text-gray-500 leading-tight">{entry.ampm}</p>}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-gray-200 truncate">{entry.name}</p>
          {entry.icon === 'star' && <span className="text-amber-400 text-[10px]">&#9733;</span>}
          {entry.icon === 'check' && <span className="text-emerald-400 text-[10px]">&#10003;</span>}
        </div>
        {entry.phone && <p className="text-[10px] text-gray-500 leading-tight">{entry.phone}</p>}
        <p className="text-[10px] text-gray-500 leading-tight">
          {entry.guests} Guests / {entry.room}
        </p>
      </div>

      {/* Table badge */}
      <div className="shrink-0">
        <span
          className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-lg text-[10px] font-bold px-1.5 border ${badgeClass}`}
        >
          {entry.table}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────
export default function ServicePagePrototype() {
  const [activeZone, setActiveZone] = useState(null);

  const filteredTables = useMemo(() => {
    if (!activeZone) return TABLES;
    return TABLES.filter((t) => t.zone === activeZone);
  }, [activeZone]);

  const zoneStats = useMemo(() => {
    const map = {};
    ZONES.forEach((z) => {
      const tables = TABLES.filter((t) => t.zone === z.id);
      const occupied = tables.filter((t) => t.status !== 'vacant').length;
      map[z.id] = { occupied, total: tables.length };
    });
    return map;
  }, []);

  const totalOccupied = TABLES.filter((t) => t.status !== 'vacant').length;
  const totalTables = TABLES.length;
  const pct = Math.round((totalOccupied / totalTables) * 100);

  return (
    <div
      className="h-screen w-full flex flex-col"
      style={{
        backgroundColor: '#0d1017',
        color: '#e0e0e0',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ═══ TOP BAR ════════════════════════════════════════════ */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {/* Left: Reservation / Waiting toggle */}
        <div
          className="flex rounded-lg overflow-hidden border"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <button
            className="px-4 py-2 text-xs font-semibold text-gray-400"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            RESERVATION
          </button>
          <button
            className="px-4 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          >
            WAITING
          </button>
        </div>

        {/* Center: Date picker */}
        <div className="flex items-center gap-2 mx-auto">
          <ChevronLeft className="w-4 h-4 text-gray-500 cursor-pointer" />
          <span className="text-sm font-medium text-gray-300">Thu, Jan 19</span>
          <ChevronRight className="w-4 h-4 text-gray-500 cursor-pointer" />
          <div className="flex items-center gap-1 ml-2 text-sm text-gray-400">
            Dinner <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Right: Icons + New Reservation */}
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <Grid3X3 className="w-4 h-4 text-gray-400" />
          </button>
          <button className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <QrCode className="w-4 h-4 text-gray-400" />
          </button>
          <button className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> New Reservation
          </button>
        </div>
      </div>

      {/* ═══ CONTENT: Sidebar + Main ════════════════════════════ */}
      <div className="flex-1 flex min-h-0">
        {/* ─── SIDEBAR ──────────────────────────────────────── */}
        <aside
          className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            backgroundColor: 'rgba(13, 16, 23, 0.95)',
          }}
        >
          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search Guest"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border-none outline-none text-gray-300 placeholder-gray-600"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'none' }}>
            {/* SEATED section */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                  SEATED
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-400" />
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-400/20 text-rose-400 text-[9px] font-bold px-1.5">
                    18
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {SEATED.map((entry, i) => (
                  <SidebarEntry key={i} entry={entry} />
                ))}
              </div>
            </div>

            {/* UPCOMING section */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                  UPCOMING
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-400" />
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-400/20 text-rose-400 text-[9px] font-bold px-1.5">
                    7
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {UPCOMING.map((entry, i) => (
                  <SidebarEntry key={i} entry={entry} />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── MAIN CONTENT ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Zone tabs + Stats row */}
          <div
            className="shrink-0 flex items-center gap-4 px-5 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            {/* Zone tabs */}
            <div className="flex items-center gap-1">
              {ZONES.map((zone) => {
                const zs = zoneStats[zone.id];
                const isActive = activeZone === zone.id;
                return (
                  <button
                    key={zone.id}
                    onClick={() => setActiveZone(isActive ? null : zone.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {zone.name}
                    <span className={`w-3 h-3 rounded-sm ${zone.color}`} />
                  </button>
                );
              })}
            </div>

            {/* Stats */}
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium">
                  <span className="text-gray-500">Avg. Time</span> 30 min
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">
                  <span className="text-gray-500">Current Capacity</span> {pct}% Full
                </span>
              </div>
            </div>
          </div>

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'none' }}>
            <div className="grid grid-cols-4 gap-5">
              {filteredTables.map((table) => (
                <TableCard key={table.id} table={table} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
