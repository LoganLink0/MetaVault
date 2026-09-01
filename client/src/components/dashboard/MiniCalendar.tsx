import { useState, useMemo } from "react";

const DOW_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const TYPE_DOT_COLORS: Record<string, string> = {
  physical: "#3B6B8A",
  digital: "#9B8EC4",
  subscription: "#D4A843",
};

interface CalendarEvent {
  date: string;
  type: string;
}

interface MiniCalendarProps {
  events?: CalendarEvent[];
  onDateSelect?: (date: string) => void;
}

function MiniCalendar({ events = [], onDateSelect }: MiniCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const initYear = new Date().getFullYear();
  const initMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);

  // Jump mode: "day" = normal calendar view, "jump" = year/month picker
  const [showJump, setShowJump] = useState(false);
  const [jumpYear, setJumpYear] = useState(initYear);
  const [jumpMonth, setJumpMonth] = useState(initMonth);

  // Build event map: date → type
  const eventMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, new Set());
      m.get(e.date)!.add(e.type);
    }
    return m;
  }, [events]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDow, daysInMonth]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  function navigateMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  }

  function handleJump() {
    setYear(jumpYear);
    setMonth(jumpMonth);
    setShowJump(false);
  }

  function handleDateClick(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onDateSelect?.(dateStr);
  }

  function isToday(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dateStr === today;
  }

  function getEventTypes(day: number): Set<string> | undefined {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return eventMap.get(dateStr);
  }

  return (
    <div className="cal-card relative bg-pg border-[1.5px] border-ink3 rounded-lg p-3.5">
      {/* Inset label */}
      <span className="absolute -top-2 left-3.5 font-mono text-[8px] tracking-[2px] text-ink2 bg-pg px-1.5">
        INSET — {MONTH_NAMES[month - 1].toUpperCase()} {year}
      </span>

      {/* Jump controls — shown when showJump is true */}
      {showJump ? (
        <div className="flex items-center gap-1.5 mb-2">
          <select
            className="font-mono text-[11px] bg-transparent border border-ink3 rounded px-1 py-0.5 text-ink2 focus:outline-none"
            value={jumpYear}
            onChange={e => setJumpYear(Number(e.target.value))}
          >
            {Array.from({ length: 20 }, (_, i) => initYear - 10 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className="font-mono text-[11px] bg-transparent border border-ink3 rounded px-1 py-0.5 text-ink2 focus:outline-none"
            value={jumpMonth}
            onChange={e => setJumpMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <button
            className="font-mono text-[10px] text-today hover:underline px-1"
            onClick={handleJump}
          >
            跳转
          </button>
          <div className="flex-1" />
          <button
            className="font-mono text-[9px] text-ink3 hover:text-ink2 px-0.5"
            onClick={() => setShowJump(false)}
          >
            日历
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end mb-2">
          <button
            className="font-mono text-[9px] text-ink3 hover:text-ink2 px-0.5"
            onClick={() => { setJumpYear(year); setJumpMonth(month); setShowJump(true); }}
          >
            跳转
          </button>
        </div>
      )}

      {/* Month title + nav */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <button
          className="text-ink3 hover:text-ink text-[14px] font-bold leading-none"
          onClick={() => navigateMonth(-1)}
        >
          ‹
        </button>
        <span className="font-display text-[13px] font-semibold tracking-[1px] text-ink">
          {monthLabel}
        </span>
        <button
          className="text-ink3 hover:text-ink text-[14px] font-bold leading-none"
          onClick={() => navigateMonth(1)}
        >
          ›
        </button>
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-[2px] text-center">
        {DOW_LABELS.map(d => (
          <div key={d} className="font-mono text-[9px] text-ink3 font-semibold tracking-[1px] py-0.5">
            {d}
          </div>
        ))}
        {calendarDays.map((day, i) => {
          if (day === null) {
            return <div key={i} className="font-mono text-[11px] py-1.5 invisible" />;
          }
          const isT = isToday(day);
          const evtTypes = getEventTypes(day);
          const dotColors = evtTypes ? Array.from(evtTypes).map(t => TYPE_DOT_COLORS[t]).filter(Boolean) : [];
          return (
            <button
              key={i}
              onClick={() => handleDateClick(day)}
              className={`
                font-mono text-[11px] py-1.5 rounded-full relative transition-[.2s]
                hover:bg-[rgba(44,36,24,.06)]
                ${isT ? "bg-today text-white font-semibold" : ""}
              `}
            >
              {day}
              {dotColors.length > 0 && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-[2px]">
                  {dotColors.map((c, ci) => (
                    <span key={ci} className="w-1 h-1 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MiniCalendar;