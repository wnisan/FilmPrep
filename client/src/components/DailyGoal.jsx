import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useGoalStore } from '../store/goalStore.js';
import { plural } from '../utils/format.js';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const REMINDER_SHOWN_KEY = 'filmprep:reminder-shown';

function Ring({ value, max, size = 30, stroke = 3.5, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <span className="goal-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="goal-ring__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`goal-ring__bar${pct >= 1 ? ' goal-ring__bar--done' : ''}`}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="goal-ring__inner">{children}</span>
    </span>
  );
}

export function Flame({ active }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={`flame${active ? ' flame--on' : ''}`}>
      <path d="M12 2c1 3.5 4.5 5.5 4.5 10a4.5 4.5 0 01-9 0c0-2 1-3.5 2-4.5.2 1.6 1 2.6 2 3 0-3.2-.5-5.8.5-8.5z" />
    </svg>
  );
}

/** The single "Прогресс" nav item: streak (days in a row) + today's words ring. */
export function ProgressNav() {
  const goal = useGoalStore((s) => s.goal);
  const refresh = useGoalStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const days = (n) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
  const title = !goal
    ? 'Прогресс'
    : goal.completed
      ? `Цель на сегодня выполнена · ударный режим ${days(goal.streak)}`
      : `Сегодня ${goal.today} из ${goal.goal} слов · ударный режим ${days(goal.streak)}`;

  return (
    <NavLink
      to="/progress"
      title={title}
      className={({ isActive }) =>
        `progress-nav${isActive ? ' is-active' : ''}${goal?.streakAtRisk ? ' progress-nav--risk' : ''}`
      }
    >
      <span>Прогресс</span>
      {goal ? (
        <span className={`progress-nav__streak${goal.completed ? ' is-done' : ''}`}>
          <Flame active={goal.completed} />
          {goal.streak}
        </span>
      ) : null}
    </NavLink>
  );
}

/** Big card: progress, streak, week, settings and reminders. */
export function GoalCard() {
  const goal = useGoalStore((s) => s.goal);
  const refresh = useGoalStore((s) => s.refresh);
  const save = useGoalStore((s) => s.save);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!goal) return null;

  async function apply(payload) {
    setError('');
    try {
      await save(payload);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    }
  }

  async function toggleReminder(enabled) {
    if (enabled && permission === 'default') {
      setPermission(await Notification.requestPermission());
    }
    apply({ reminderEnabled: enabled });
  }

  const message = goal.completed
    ? 'Цель на сегодня выполнена — так держать!'
    : goal.streakAtRisk
      ? `Ещё ${goal.remaining} ${plural(goal.remaining, ['слово', 'слова', 'слов'])}, чтобы не потерять серию`
      : `Осталось ${goal.remaining} ${plural(goal.remaining, ['слово', 'слова', 'слов'])} до цели`;

  return (
    <section className="goal-card">
      <div className="goal-card__main">
        <Ring value={goal.today} max={goal.goal} size={96} stroke={9}>
          <strong>{goal.today}</strong>
          <small>из {goal.goal}</small>
        </Ring>
        <div className="goal-card__text">
          <p className="goal-card__eyebrow">Цель на сегодня</p>
          <h2 className="goal-card__title">{message}</h2>
          <p className="muted goal-card__hint">
            Слова засчитываются, когда вы отмечаете их выученными в словаре фильма или добавляете в{' '}
            <Link to="/dictionary">личный словарь</Link> — например, кликом по слову в субтитрах.
          </p>
        </div>
        <div className={`goal-streak${goal.completed ? ' goal-streak--on' : ''}`}>
          <Flame active={goal.completed || goal.streak > 0} />
          <strong>{goal.streak}</strong>
          <span>{plural(goal.streak, ['день', 'дня', 'дней'])} подряд</span>
          <small className="muted">рекорд: {goal.bestStreak}</small>
        </div>
      </div>

      <div className="goal-week">
        {goal.week.map((d) => {
          const date = new Date(`${d.day}T12:00:00`);
          const isToday = d.day === goal.date;
          return (
            <div
              key={d.day}
              className={`goal-week__day${d.met ? ' goal-week__day--met' : ''}${isToday ? ' goal-week__day--today' : ''}`}
              title={`${date.toLocaleDateString('ru-RU')}: ${d.words} ${plural(d.words, ['слово', 'слова', 'слов'])}`}
            >
              <span className="goal-week__dot">{d.met ? '✓' : d.words || ''}</span>
              <span className="goal-week__label">{WEEKDAYS[date.getDay()]}</span>
            </div>
          );
        })}
      </div>

      <div className="goal-settings">
        <div className="goal-settings__group">
          <span className="goal-settings__label">Слов в день</span>
          <div className="goal-settings__presets">
            {goal.presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`goal-preset${goal.goal === p ? ' goal-preset--active' : ''}`}
                onClick={() => apply({ dailyGoal: p })}
              >
                {p}
              </button>
            ))}
            <form
              className="goal-settings__custom"
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(custom) > 0) apply({ dailyGoal: Number(custom) });
                setCustom('');
              }}
            >
              <input
                type="number"
                min="1"
                max="200"
                placeholder="своё"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </form>
          </div>
        </div>

        <div className="goal-settings__group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={goal.reminder.enabled}
              onChange={(e) => toggleReminder(e.target.checked)}
            />
            <span className="toggle__track" aria-hidden="true" />
            Напоминать, если цель не выполнена, в
          </label>
          <input
            type="time"
            className="goal-settings__time"
            value={goal.reminder.time}
            disabled={!goal.reminder.enabled}
            onChange={(e) => e.target.value && apply({ reminderTime: e.target.value })}
          />
        </div>
        {goal.reminder.enabled && permission === 'denied' ? (
          <p className="muted goal-settings__note">
            Уведомления браузера запрещены — напоминание будет показываться на сайте.
          </p>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    </section>
  );
}

function todayKey() {
  return new Date().toLocaleDateString('sv-SE');
}

/**
 * Reminder: after the chosen time, if today's goal is not met, shows a browser
 * notification (when allowed) and an in-app banner — once per day.
 */
export function GoalReminder() {
  const goal = useGoalStore((s) => s.goal);
  const refresh = useGoalStore((s) => s.refresh);
  const celebrate = useGoalStore((s) => s.celebrate);
  const dismissCelebrate = useGoalStore((s) => s.dismissCelebrate);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    if (!goal?.reminder.enabled) return undefined;
    const check = () => {
      if (!goal || goal.completed) return;
      const now = new Date();
      const [h, m] = goal.reminder.time.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
      if (localStorage.getItem(REMINDER_SHOWN_KEY) === todayKey()) return;
      localStorage.setItem(REMINDER_SHOWN_KEY, todayKey());
      setBanner(true);
      const body = goal.streak
        ? `Серия ${goal.streak} ${plural(goal.streak, ['день', 'дня', 'дней'])} под угрозой — осталось ${goal.remaining} ${plural(goal.remaining, ['слово', 'слова', 'слов'])}.`
        : `Сегодня осталось ${goal.remaining} ${plural(goal.remaining, ['слово', 'слова', 'слов'])} до цели.`;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification('FilmPrep: пора позаниматься', { body, tag: 'filmprep-goal' });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    };
    check();
    const timer = setInterval(() => {
      refresh();
      check();
    }, 60_000);
    return () => clearInterval(timer);
  }, [goal, refresh]);

  useEffect(() => {
    if (!celebrate) return undefined;
    const timer = setTimeout(dismissCelebrate, 6000);
    return () => clearTimeout(timer);
  }, [celebrate, dismissCelebrate]);

  if (celebrate && goal) {
    return (
      <div className="goal-toast goal-toast--done" role="status">
        <Flame active />
        <span>
          Цель выполнена! Серия — {goal.streak} {plural(goal.streak, ['день', 'дня', 'дней'])}
        </span>
        <button type="button" onClick={dismissCelebrate} aria-label="Закрыть">
          ×
        </button>
      </div>
    );
  }

  if (!banner || !goal || goal.completed) return null;
  return (
    <div className="goal-toast" role="status">
      <Flame active={false} />
      <span>
        {goal.streak ? `Серия ${goal.streak} ${plural(goal.streak, ['день', 'дня', 'дней'])} под угрозой. ` : ''}
        Осталось {goal.remaining} {plural(goal.remaining, ['слово', 'слова', 'слов'])} до цели.
      </span>
      <Link to="/dictionary" onClick={() => setBanner(false)}>
        К словам
      </Link>
      <button type="button" onClick={() => setBanner(false)} aria-label="Закрыть">
        ×
      </button>
    </div>
  );
}
