import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const REPORT_FILTERS = [
  { value: 'all', label: 'All reports' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function AdminReports({ token }) {
  const [reports, setReports] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [reportCounts, setReportCounts] = useState({ all: 0, open: 0, resolved: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReportId, setSavingReportId] = useState('');
  const [savingListingId, setSavingListingId] = useState('');
  const [adminNotes, setAdminNotes] = useState({});
  const reportsRequestIdRef = useRef(0);

  const loadReports = useCallback(async () => {
    const requestId = ++reportsRequestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin`, {
        params: { page, status: selectedFilter },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestId !== reportsRequestIdRef.current) return;
      const responseReports = Array.isArray(response.data) ? response.data : response.data.reports;
      if (Array.isArray(response.data)) {
        const visibleReports = selectedFilter === 'all'
          ? responseReports
          : responseReports.filter((report) => report.status === selectedFilter);
        setReports(visibleReports);
        setPagination({ page: 1, total: visibleReports.length, totalPages: 1 });
        setReportCounts({
          all: responseReports.length,
          open: responseReports.filter((report) => report.status === 'open').length,
          resolved: responseReports.filter((report) => report.status === 'resolved').length,
          dismissed: responseReports.filter((report) => report.status === 'dismissed').length,
        });
      } else {
        setReports(responseReports);
        setPagination(response.data.pagination);
        setReportCounts(response.data.counts);
      }
      setAdminNotes(Object.fromEntries(
        responseReports.map((report) => [report._id, report.adminNote || ''])
      ));
    } catch (err) {
      if (requestId !== reportsRequestIdRef.current) return;
      setError(err.response?.data?.message || 'Could not load listing reports.');
    } finally {
      if (requestId === reportsRequestIdRef.current) setLoading(false);
    }
  }, [page, selectedFilter, token]);

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
      setReportCounts((previous) => ({
        ...previous,
        [report.status]: Math.max(0, previous[report.status] - 1),
        [status]: previous[status] + 1,
      }));
      if (selectedFilter === report.status) {
        setReports((previous) => previous.filter((item) => item.status === selectedFilter));
        setPagination((previous) => ({
          ...previous,
          total: Math.max(0, previous.total - 1),
          totalPages: Math.max(1, Math.ceil((previous.total - 1) / 50)),
        }));
        if (page > 1 && reports.length === 1) setPage(1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update this report.');
    } finally {
      setSavingReportId('');
    }
  };

  const setListingVisibility = async (report, isHidden) => {
    const listingId = report.listing?._id;
    if (!listingId) {
      setError('This report no longer has an associated listing.');
      return;
    }

    setSavingListingId(listingId);
    setError('');
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/api/reports/admin/listings/${listingId}/visibility`,
        { isHidden },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReports((previous) => previous.map((item) => (
        item.listing?._id === listingId
          ? { ...item, listing: response.data.listing }
          : item
      )));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change listing visibility.');
    } finally {
      setSavingListingId('');
    }
  };

  const filteredReports = reports;

  return (
    <section className="products-page admin-reports-page">
      <div className="products-page-heading">
        <div>
          <h2>Listing Reports</h2>
          <p>Review user reports and record the outcome.</p>
        </div>
        <span className="report-open-count">{reportCounts.open} open</span>
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}
      <div className="admin-report-filters" role="group" aria-label="Filter reports by status">
        {REPORT_FILTERS.map((filter) => {
          const count = reportCounts[filter.value];
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selectedFilter === filter.value}
              onClick={() => {
                setPage(1);
                setSelectedFilter(filter.value);
              }}
            >
              {filter.label} <span>{count}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <p className="loading-text">Loading reports...</p>
      ) : pagination.total === 0 && reportCounts.all === 0 ? (
        <p className="no-items">There are no listing reports to review.</p>
      ) : filteredReports.length === 0 ? (
        <p className="no-items">There are no {selectedFilter} reports.</p>
      ) : (
        <div className="admin-report-list">
          {filteredReports.map((report) => {
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
                {report.listing && (
                  <div className="admin-listing-moderation">
                    <span className="admin-listing-moderation-label">Marketplace visibility</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!report.listing.isHidden}
                      aria-label={`Listing visibility: ${report.listing.isHidden ? 'hidden' : 'visible'}`}
                      className={`listing-visibility-switch ${report.listing.isHidden ? 'is-hidden' : 'is-visible'}`}
                      disabled={savingListingId === report.listing._id}
                      onClick={() => setListingVisibility(report, !report.listing.isHidden)}
                    >
                      <span className="listing-visibility-track" aria-hidden="true">
                        <span className="listing-visibility-thumb" />
                      </span>
                      <span>
                        {savingListingId === report.listing._id
                          ? 'Updating...'
                          : report.listing.isHidden
                            ? 'Hidden'
                            : 'Visible'}
                      </span>
                    </button>
                  </div>
                )}
                {!loading && pagination.totalPages > 1 && (
                  <nav className="admin-report-pagination" aria-label="Report pages">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                    >
                      Previous
                    </button>
                    <span>Page {page} of {pagination.totalPages} · {pagination.total} reports</span>
                    <button
                      type="button"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((currentPage) => Math.min(pagination.totalPages, currentPage + 1))}
                    >
                      Next
                    </button>
                  </nav>
                )}
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
