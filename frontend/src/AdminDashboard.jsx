import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const metricCards = [
  { key: 'openReports', label: 'Reports to review', tone: 'warning', page: 'admin-reports', action: 'Review reports' },
  { key: 'totalUsers', label: 'Campus accounts', tone: 'teal', page: 'admin-users', action: 'Manage users' },
  { key: 'newUsers', label: 'Joined this week', tone: 'blue', page: 'admin-users', action: 'View users' },
  { key: 'activeListings', label: 'Products for sale', tone: 'teal', page: 'marketplace', action: 'View marketplace' },
  { key: 'hiddenListings', label: 'Hidden products', tone: 'neutral', page: 'admin-reports', action: 'Review visibility' },
  { key: 'soldListings', label: 'Sold products', tone: 'blue', page: 'marketplace', action: 'View marketplace' },
];

const reportReason = {
  scam: 'Suspected scam or fraud',
  prohibited: 'Prohibited or unsafe item',
  misleading: 'Misleading description or price',
  other: 'Something else',
};

export default function AdminDashboard({ token, setActivePage }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async (isRefresh = false) => {
    setError('');
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOverview(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the admin overview.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const metrics = overview?.metrics;

  return (
    <section className="products-page admin-dashboard-page">
      <div className="admin-dashboard-hero">
        <div>
          <span className="admin-dashboard-eyebrow">MU BAZAR · ADMINISTRATION</span>
          <h2>Admin overview</h2>
          <p>Keep an eye on campus activity, product moderation, and new reports.</p>
        </div>
        <button
          className="admin-dashboard-refresh"
          type="button"
          onClick={() => loadOverview(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh overview'}
        </button>
      </div>

      {error && <p className="report-error" role="alert">{error}</p>}

      <div className="admin-dashboard-metrics" aria-label="Marketplace overview metrics" aria-busy={loading}>
        {metricCards.map((card) => (
          <article className={`admin-dashboard-metric tone-${card.tone}`} key={card.key}>
            <span>{card.label}</span>
            <strong>{loading ? '—' : (metrics?.[card.key] ?? 0).toLocaleString()}</strong>
            <button type="button" onClick={() => setActivePage(card.page)}>{card.action} <span aria-hidden="true">→</span></button>
          </article>
        ))}
      </div>

      <section className="admin-dashboard-recent" aria-labelledby="admin-recent-reports-title">
        <div className="admin-dashboard-section-heading">
          <div>
            <h3 id="admin-recent-reports-title">Recent product reports</h3>
            <p>Latest reports submitted by marketplace users.</p>
          </div>
          <button type="button" onClick={() => setActivePage('admin-reports')}>Open report queue</button>
        </div>
        {loading ? (
          <p className="admin-dashboard-empty">Loading recent reports…</p>
        ) : overview?.recentReports?.length ? (
          <ul className="admin-dashboard-report-list">
            {overview.recentReports.map((report) => (
              <li key={report._id}>
                <div>
                  <strong>{report.listing?.title || 'Product removed'}</strong>
                  <span>{reportReason[report.reason] || report.reason}</span>
                </div>
                <div className="admin-dashboard-report-meta">
                  <span className={`admin-dashboard-report-status status-${report.status}`}>{report.status}</span>
                  <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString()}</time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-dashboard-empty">No product reports have been submitted yet.</p>
        )}
      </section>
      {overview?.generatedAt && (
        <p className="admin-dashboard-updated">Updated {new Date(overview.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      )}
    </section>
  );
}
