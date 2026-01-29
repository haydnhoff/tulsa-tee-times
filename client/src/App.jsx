import React, { useState, useEffect, useMemo } from 'react';

const COURSES = [
  { key: 'lafortune', name: 'LaFortune Park' },
  { key: 'battlecreek', name: 'Battle Creek' },
  { key: 'stonecreek', name: 'Page Belcher - Stone Creek' },
  { key: 'oldepage', name: 'Page Belcher - Olde Page' },
  { key: 'cherokeehills', name: 'Cherokee Hills' },
  { key: 'southlakes', name: 'South Lakes' },
];

function todayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0]; // YYYY-MM-DD for input[type=date]
}

function toAPIDate(isoDate) {
  // Convert YYYY-MM-DD to MM-DD-YYYY
  const [y, m, d] = isoDate.split('-');
  return `${m}-${d}-${y}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  if (isNaN(d)) return timeStr;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getHour(timeStr) {
  if (!timeStr) return 12;
  const d = new Date(timeStr);
  if (isNaN(d)) return 12;
  return d.getHours();
}

function formatPrice(cents) {
  if (cents == null) return '--';
  return '$' + (parseFloat(cents) || 0).toFixed(2);
}

const TIME_FILTERS = [
  { key: 'all', label: 'All Day' },
  { key: 'morning', label: 'Morning', desc: 'Before 12pm' },
  { key: 'afternoon', label: 'Afternoon', desc: '12pm - 5pm' },
  { key: 'evening', label: 'Evening', desc: 'After 5pm' },
];

export default function App() {
  const [date, setDate] = useState(todayStr());
  const [players, setPlayers] = useState(2);
  const [timeFilter, setTimeFilter] = useState('all');
  const [selectedCourses, setSelectedCourses] = useState(new Set(COURSES.map(c => c.key)));
  const [teetimes, setTeetimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState('time'); // 'time' or 'course'

  async function fetchTimes() {
    setLoading(true);
    setError(null);
    try {
      const apiDate = toAPIDate(date);
      const courseParam = Array.from(selectedCourses).join(',');
      const resp = await fetch(`/api/teetimes?date=${apiDate}&players=${players}&courses=${courseParam}`);
      if (!resp.ok) throw new Error('Failed to fetch');
      const data = await resp.json();
      setTeetimes(data.teetimes || []);
    } catch (e) {
      setError('Failed to load tee times. Please try again.');
      setTeetimes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCourses.size > 0) fetchTimes();
    else setTeetimes([]);
  }, [date, players, selectedCourses]);

  const filtered = useMemo(() => {
    return teetimes.filter(t => {
      if (timeFilter === 'all') return true;
      const h = getHour(t.time);
      if (timeFilter === 'morning') return h < 12;
      if (timeFilter === 'afternoon') return h >= 12 && h < 17;
      if (timeFilter === 'evening') return h >= 17;
      return true;
    });
  }, [teetimes, timeFilter]);

  const grouped = useMemo(() => {
    if (groupBy === 'course') {
      const map = {};
      filtered.forEach(t => {
        const key = t.course;
        if (!map[key]) map[key] = [];
        map[key].push(t);
      });
      return map;
    }
    return null;
  }, [filtered, groupBy]);

  function toggleCourse(key) {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Tulsa Tee Times</h1>
        <p style={styles.subtitle}>Find available tee times across Tulsa golf courses</p>
      </header>

      <div style={styles.filters}>
        <div style={styles.filterRow}>
          <label style={styles.label}>
            Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={todayStr()} style={styles.input} />
          </label>
          <label style={styles.label}>
            Players
            <select value={players} onChange={e => setPlayers(Number(e.target.value))} style={styles.input}>
              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={styles.label}>
            View
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={styles.input}>
              <option value="time">By Time</option>
              <option value="course">By Course</option>
            </select>
          </label>
        </div>

        <div style={styles.chipRow}>
          {TIME_FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setTimeFilter(f.key)}
              style={{
                ...styles.chip,
                ...(timeFilter === f.key ? styles.chipActive : {}),
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.chipRow}>
          {COURSES.map(c => (
            <button key={c.key}
              onClick={() => toggleCourse(c.key)}
              style={{
                ...styles.chip,
                ...(selectedCourses.has(c.key) ? styles.chipCourseActive : styles.chipCourse),
              }}>
              {selectedCourses.has(c.key) ? '✓ ' : ''}{c.name}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Loading tee times...</p>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {!loading && !error && filtered.length === 0 && teetimes.length > 0 && (
        <div style={styles.empty}>No tee times match your filters.</div>
      )}

      {!loading && !error && teetimes.length === 0 && selectedCourses.size > 0 && (
        <div style={styles.empty}>No tee times available for this date.</div>
      )}

      {!loading && grouped && Object.entries(grouped).map(([course, times]) => (
        <div key={course}>
          <h2 style={styles.groupHeader}>{course}</h2>
          <div style={styles.grid}>
            {times.map((t, i) => <TeeTimeCard key={i} t={t} />)}
          </div>
        </div>
      ))}

      {!loading && !grouped && filtered.length > 0 && (
        <div style={styles.grid}>
          {filtered.map((t, i) => <TeeTimeCard key={i} t={t} />)}
        </div>
      )}

      <footer style={styles.footer}>
        Data sourced from ForeUp Software. Click "Book" to reserve on the course website.
      </footer>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f0; color: #1a1a1a; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function TeeTimeCard({ t }) {
  const totalFee = (parseFloat(t.green_fee) || 0) + (parseFloat(t.cart_fee) || 0);
  return (
    <div style={styles.card}>
      <div style={styles.cardTime}>{formatTime(t.time)}</div>
      <div style={styles.cardCourse}>{t.course}</div>
      {t.scheduleLabel && t.scheduleLabel !== t.course && (
        <div style={styles.cardSchedule}>{t.scheduleLabel}</div>
      )}
      <div style={styles.cardDetails}>
        <span style={styles.cardPrice}>
          {formatPrice(t.green_fee)}
          {t.cart_fee > 0 && <span style={styles.cartFee}> + {formatPrice(t.cart_fee)} cart</span>}
        </span>
        <span style={styles.cardSpots}>
          {t.available_spots} spot{t.available_spots !== 1 ? 's' : ''}
        </span>
      </div>
      <a href={t.bookingUrl} target="_blank" rel="noopener noreferrer" style={styles.bookBtn}>
        Book
      </a>
    </div>
  );
}

const styles = {
  container: { maxWidth: 900, margin: '0 auto', padding: '16px' },
  header: { textAlign: 'center', padding: '24px 0 16px' },
  title: { fontSize: '2rem', color: '#1b5e20', fontWeight: 800 },
  subtitle: { color: '#666', marginTop: 4, fontSize: '0.95rem' },
  filters: { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  filterRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  label: { display: 'flex', flexDirection: 'column', fontSize: '0.8rem', fontWeight: 600, color: '#555', gap: 4, flex: '1 1 120px' },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', fontSize: '0.95rem' },
  chipRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  chip: { padding: '6px 14px', borderRadius: 20, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.15s' },
  chipActive: { background: '#1b5e20', color: '#fff', borderColor: '#1b5e20' },
  chipCourse: { background: '#f5f5f5', color: '#333', borderColor: '#ccc' },
  chipCourseActive: { background: '#e8f5e9', color: '#1b5e20', borderColor: '#4caf50' },
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  spinner: { width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: '#1b5e20', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' },
  error: { background: '#ffebee', color: '#c62828', padding: 16, borderRadius: 8, textAlign: 'center', marginBottom: 16 },
  empty: { textAlign: 'center', padding: 40, color: '#999' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 16 },
  groupHeader: { fontSize: '1.1rem', fontWeight: 700, color: '#1b5e20', margin: '16px 0 8px', borderBottom: '2px solid #c8e6c9', paddingBottom: 4 },
  card: { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 4 },
  cardTime: { fontSize: '1.25rem', fontWeight: 700, color: '#1b5e20' },
  cardCourse: { fontSize: '0.85rem', fontWeight: 600, color: '#444' },
  cardSchedule: { fontSize: '0.75rem', color: '#888' },
  cardDetails: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: '0.9rem' },
  cardPrice: { fontWeight: 600, color: '#333' },
  cartFee: { fontWeight: 400, color: '#888', fontSize: '0.8rem' },
  cardSpots: { color: '#666', fontSize: '0.85rem' },
  bookBtn: { display: 'block', textAlign: 'center', marginTop: 8, padding: '8px 0', background: '#1b5e20', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' },
  footer: { textAlign: 'center', padding: '24px 0', color: '#999', fontSize: '0.8rem' },
};
