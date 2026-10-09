import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');

const formatReason = (reason) => ({
  scam: 'Suspected scam or fraud',
  prohibited: 'Prohibited or unsafe item',
  misleading: 'Misleading description or price',
  other: 'Something else',
}[reason] || reason);

const getSellerResidency = (seller) => {
  if (!seller) return 'Seller details unavailable';
  if (seller.residencyType === 'outsider') return 'Outsider';
  return [
    seller.hostelName,
    seller.hostelBlock && `Block ${seller.hostelBlock}`,
    seller.roomNumber && `Room ${seller.roomNumber}`,
  ].filter(Boolean).join(' · ') || 'Hosteler';
};

export default function AdminReports({ token }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReportId, setSavingReportId] = useState('');
  const [adminNotes, setAdminNotes] = useState({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports(response.data);
      setAdminNotes(Object.fromEntries(
        response.data.map((report) => [report._id, report.adminNote || ''])
      ));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load listing reports.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const updateReport = async (report, status) => {
    setSavingReportId(report._id);
    setError('');
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/api/reports/admin/${report._id}`,
        { status, adminNote: adminNotes[report._id] || '' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReports((previous) => previous.map((item) => (
        item._id === report._id ? response.data : item
      )));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update this report.');
    } finally {
      setSavingReportId('');
    }
  };

  const openReports = reports.filter((report) => report.status === 'open');

  return (
    <section className="products-page admin-reports-page">
      <div className="products-page-heading">
        <div>
          <h2>Listing Reports</h2>
          <p>Review user reports and record the outcome.</p>
        </div>
        <span className="report-open-count">{openReports.length} open</span>
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}
      {loading ? (
        <p className="loading-text">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="no-items">There are no listing reports to review.</p>
      ) : (
        <div className="admin-report-list">
          {reports.map((report) => {
            const seller = report.listing?.seller;
            return (
              <article className="admin-report-card" key={report._id}>
                <div className="admin-report-listing">
                  {report.listing?.images?.[0] && (
                    <img src={report.listing.images[0]} alt="" />
                  )}
                  <div>
                    <h3>{report.listing?.title || 'Listing no longer available'}</h3>
                    {report.listing?.price != null && <strong>₹{report.listing.price}</strong>}
                  </div>
                  <span className={`report-status report-status-${report.status}`}>{report.status}</span>
                </div>
                <dl className="admin-report-meta">
                  <div>
                    <dt>Seller</dt>
                    <dd>{seller?.name || 'Seller details unavailable'}</dd>
                  </div>
                  <div><dt>Seller email</dt><dd>{seller?.email || 'Unavailable'}</dd></div>
                  <div><dt>Seller phone</dt><dd>{seller?.phone || 'Not provided'}</dd></div>
                  <div><dt>Seller residency</dt><dd>{getSellerResidency(seller)}</dd></div>
                  <div><dt>Reason</dt><dd>{formatReason(report.reason)}</dd></div>
                  <div>
                    <dt>Reported by</dt>
                    <dd>{report.reporter?.name || 'Unknown'} · {report.reporter?.email || 'Email unavailable'}</dd>
                  </div>
                  <div><dt>Submitted</dt><dd>{new Date(report.createdAt).toLocaleString()}</dd></div>
                  {report.details && <div><dt>Details</dt><dd>{report.details}</dd></div>}
                </dl>
                <label htmlFor={`admin-note-${report._id}`}>Admin review note</label>
                <textarea
                  id={`admin-note-${report._id}`}
                  value={adminNotes[report._id] || ''}
                  maxLength={1000}
                  onChange={(event) => setAdminNotes({
                    ...adminNotes,
                    [report._id]: event.target.value,
                  })}
                  placeholder="Optional note about your decision"
                  disabled={report.status !== 'open' || savingReportId === report._id}
                />
                {report.status === 'open' ? (
                  <div className="admin-report-actions">
                    <button
                      type="button"
                      className="btn-report-resolve"
                      disabled={savingReportId === report._id}
                      onClick={() => updateReport(report, 'resolved')}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className="btn-report-dismiss"
                      disabled={savingReportId === report._id}
                      onClick={() => updateReport(report, 'dismissed')}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <p className="report-reviewed-note">
                    {report.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                    {report.reviewedBy?.name ? ` by ${report.reviewedBy.name}` : ''}
                    {report.adminNote ? `: ${report.adminNote}` : ''}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
