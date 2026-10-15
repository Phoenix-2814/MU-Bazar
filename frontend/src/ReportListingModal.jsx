import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const REPORT_REASONS = [
  { value: 'scam', label: 'Suspected scam or fraud' },
  { value: 'prohibited', label: 'Prohibited or unsafe item' },
  { value: 'misleading', label: 'Misleading description or price' },
  { value: 'other', label: 'Something else' },
];

export default function ReportListingModal({ listing, token, onClose, onSubmitted }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/reports`,
        { listingId: listing._id, reason, details },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSubmitted(response.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit the report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay report-modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-content report-modal" role="dialog" aria-modal="true" aria-labelledby="report-heading">
        <button className="close-btn" type="button" onClick={onClose} aria-label="Close report form">
          &times;
        </button>
        <h2 id="report-heading">Report product</h2>
        <p className="report-listing-name">{listing.title}</p>
        {error && <p className="report-error" role="alert">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label htmlFor="report-reason">Why are you reporting this product?</label>
          <select
            id="report-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          >
            <option value="">Select a reason</option>
            {REPORT_REASONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <label htmlFor="report-details">Additional details (optional)</label>
          <textarea
            id="report-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={1000}
            placeholder="Share details that could help us review this report."
            rows={4}
          />
          <button type="submit" className="btn-submit" disabled={submitting || !reason}>
            {submitting ? 'Submitting report...' : 'Submit report'}
          </button>
        </form>
      </section>
    </div>
  );
}
