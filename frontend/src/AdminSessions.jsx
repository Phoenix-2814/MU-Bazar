import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Search } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const SESSION_FILTERS = [
  { value: 'all', label: 'All sessions' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Logged out' },
];

const logoutLabels = {
  manual: 'Logged out by user',
  tab_closed: 'Tab closed',
  idle_timeout: '30 minutes inactive',
  max_lifetime: 'Session lifetime ended',
};

const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : '—');

export default function AdminSessions({ token }) {
  const [sessions, setSessions] = useState([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, closed: 0 });
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [filter, setFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const loadSessions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/admin/sessions`, {
        params: { page, status: filter, search },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestId !== requestIdRef.current) return;
      setSessions(response.data.sessions || []);
      setCounts(response.data.counts || { all: 0, active: 0, closed: 0 });
      setPagination(response.data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.response?.data?.message || 'Could not load login activity.');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filter, page, search, token]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <section className="products-page admin-sessions-page">
      <div className="products-page-heading admin-sessions-heading">
        <div>
          <span className="admin-sessions-eyebrow">ACCOUNT SECURITY</span>
          <h2>User login activity</h2>
          <p>Review when users signed in, when sessions ended, and why.</p>
        </div>
        <button className="admin-sessions-refresh" type="button" onClick={loadSessions} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && <p className="report-error" role="alert">{error}</p>}

      <div className="admin-session-summary" aria-label="Session counts">
        <div><span>All sessions</span><strong>{counts.all.toLocaleString()}</strong></div>
        <div><span>Active now</span><strong>{counts.active.toLocaleString()}</strong></div>
        <div><span>Logged out</span><strong>{counts.closed.toLocaleString()}</strong></div>
      </div>

      <div className="admin-session-toolbar">
        <div className="admin-report-filters" role="group" aria-label="Filter sessions by status">
          {SESSION_FILTERS.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={filter === option.value}
              onClick={() => {
                setPage(1);
                setFilter(option.value);
              }}
            >
              {option.label} <span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <form className="admin-session-search" onSubmit={submitSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search sessions by user name or email"
            placeholder="Search name or university email"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      {loading ? (
        <p className="loading-text" role="status">Loading login activity…</p>
      ) : sessions.length === 0 ? (
        <div className="admin-sessions-empty">
          <h3>No sessions found</h3>
          <p>{search ? 'Try another name or email address.' : 'New user login activity will appear here.'}</p>
        </div>
      ) : (
        <div className="admin-session-list">
          {sessions.map((session) => (
            <article className="admin-session-card" key={session._id}>
              <div className="admin-session-user">
                <div className="admin-session-avatar" aria-hidden="true">
                  {session.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <strong>{session.userName}</strong>
                  <span>{session.userEmail}</span>
                </div>
                <span className={`admin-session-status ${session.loggedOutAt ? 'is-closed' : 'is-active'}`}>
                  {session.loggedOutAt ? 'Logged out' : 'Active'}
                </span>
              </div>
              <dl className="admin-session-times">
                <div><dt>Logged in</dt><dd>{formatDateTime(session.loginAt)}</dd></div>
                <div><dt>Last activity</dt><dd>{formatDateTime(session.lastActivityAt)}</dd></div>
                <div><dt>Logged out</dt><dd>{formatDateTime(session.loggedOutAt)}</dd></div>
                <div><dt>Reason</dt><dd>{session.loggedOutAt ? logoutLabels[session.logoutReason] || 'Session ended' : 'Currently active'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <nav className="admin-report-pagination" aria-label="Login activity pages">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} sessions</span>
          <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
