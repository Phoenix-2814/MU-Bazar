import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');

const USER_FILTERS = [
  { value: 'all', label: 'All users' },
  { value: 'new', label: 'New (30 days)' },
  { value: 'high-posted', label: 'Most listings' },
  { value: 'suspended', label: 'Suspended' },
];

const getResidency = (user) => (
  user.residencyType === 'outsider'
    ? 'Outsider'
    : [user.hostelName, user.hostelBlock && `Block ${user.hostelBlock}`, user.roomNumber && `Room ${user.roomNumber}`]
      .filter(Boolean).join(' · ') || 'Hosteler'
);

export default function AdminUsers({ token }) {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [counts, setCounts] = useState({ all: 0, new: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDetails, setUserDetails] = useState(null);
  const [listingsPage, setListingsPage] = useState(1);
  const [savingUser, setSavingUser] = useState(false);
  const [savingListingId, setSavingListingId] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspensionConfirmation, setSuspensionConfirmation] = useState(false);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const loadUsers = useCallback(async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin/users`, {
        params: { page, status: filter, search },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestId !== listRequestId.current) return;
      setUsers(response.data.users);
      setPagination(response.data.pagination);
      setCounts(response.data.counts);
    } catch (err) {
      if (requestId === listRequestId.current) {
        setError(err.response?.data?.message || 'Could not load users.');
      }
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [filter, page, search, token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadUserDetails = useCallback(async (userId, selectedPage = 1) => {
    const requestId = ++detailRequestId.current;
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin/users/${userId}`, {
        params: { page: selectedPage },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestId !== detailRequestId.current) return;
      setUserDetails(response.data);
      setListingsPage(response.data.pagination.page);
      setSuspensionReason(response.data.user.suspensionReason || '');
      setSuspensionConfirmation(false);
    } catch (err) {
      if (requestId === detailRequestId.current) {
        setError(err.response?.data?.message || 'Could not load this user profile.');
      }
    }
  }, [token]);

  useEffect(() => {
    if (selectedUserId) loadUserDetails(selectedUserId, listingsPage);
  }, [selectedUserId, listingsPage, loadUserDetails]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const setUserStatus = async (isSuspended) => {
    if (!selectedUserId) return;
    setSavingUser(true);
    setError('');
    try {
      await axios.patch(
        `${API_BASE_URL}/api/reports/admin/users/${selectedUserId}/status`,
        { isSuspended, reason: suspensionReason.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuspensionConfirmation(false);
      await Promise.all([loadUserDetails(selectedUserId, listingsPage), loadUsers()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update this user.');
    } finally {
      setSavingUser(false);
    }
  };

  const setListingVisibility = async (listing, isHidden) => {
    setSavingListingId(listing._id);
    setError('');
    try {
      await axios.patch(
        `${API_BASE_URL}/api/reports/admin/listings/${listing._id}/visibility`,
        { isHidden },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await Promise.all([loadUserDetails(selectedUserId, listingsPage), loadUsers()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update listing visibility.');
    } finally {
      setSavingListingId('');
    }
  };

  const deleteListing = async (listing) => {
    if (!window.confirm(`Permanently delete “${listing.title}”? This cannot be undone.`)) return;
    setSavingListingId(listing._id);
    setError('');
    try {
      await axios.delete(`${API_BASE_URL}/api/reports/admin/listings/${listing._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await Promise.all([loadUserDetails(selectedUserId, listingsPage), loadUsers()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete this listing.');
    } finally {
      setSavingListingId('');
    }
  };

  const user = userDetails?.user;

  return (
    <section className="products-page admin-users-page">
      <div className="products-page-heading">
        <div>
          <h2>User management</h2>
          <p>Review campus accounts, activity, and marketplace listings.</p>
        </div>
        {user && (
          <button type="button" className="btn-cancel" onClick={() => {
            setUserDetails(null);
            setSelectedUserId('');
          }}>
            Back to users
          </button>
        )}
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}

      {!user ? (
        <>
          <form className="admin-user-search" onSubmit={submitSearch}>
            <label htmlFor="admin-user-search">Search by name or university email</label>
            <div>
              <input
                id="admin-user-search"
                type="search"
                maxLength={100}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search users"
              />
              <button type="submit" className="btn-submit">Search</button>
            </div>
          </form>
          <div className="admin-report-filters" role="group" aria-label="Filter users">
            {USER_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => {
                  setPage(1);
                  setFilter(option.value);
                }}
              >
                {option.label}
                {option.value === 'all' && <span>{counts.all}</span>}
                {option.value === 'new' && <span>{counts.new}</span>}
                {option.value === 'suspended' && <span>{counts.suspended}</span>}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="loading-text">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="no-items">No users match this filter.</p>
          ) : (
            <div className="admin-user-list">
              {users.map((listedUser) => (
                <article className="admin-user-card" key={listedUser._id}>
                  <div className="admin-user-summary">
                    <div className="admin-user-avatar">{listedUser.name?.charAt(0).toUpperCase() || '?'}</div>
                    <div className="admin-user-identity">
                      <h3>{listedUser.name}</h3>
                      <p>{listedUser.email}</p>
                      <small>Joined {new Date(listedUser.createdAt).toLocaleDateString()}</small>
                    </div>
                    <span className="admin-user-listing-count">
                      {listedUser.listingCount} {listedUser.listingCount === 1 ? 'listing' : 'listings'}
                    </span>
                    {listedUser.isSuspended && <span className="admin-user-suspended-badge">Suspended</span>}
                    <button
                      type="button"
                      className="btn-resend-verification"
                      onClick={() => {
                        setUserDetails(null);
                        setSelectedUserId(listedUser._id);
                      }}
                    >
                      Review profile
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!loading && pagination.totalPages > 1 && (
            <nav className="admin-report-pagination" aria-label="User pages">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </button>
              <span>Page {page} of {pagination.totalPages} · {pagination.total} users</span>
              <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="admin-user-detail">
          <section className="admin-user-card admin-user-profile">
            <div className="admin-user-profile-heading">
              <div className="admin-user-avatar admin-user-avatar-large">{user.name?.charAt(0).toUpperCase() || '?'}</div>
              <div>
                <h3>{user.name}</h3>
                <p>{user.email}</p>
                <span className={user.isSuspended ? 'admin-user-suspended-badge' : 'admin-user-active-badge'}>
                  {user.isSuspended ? 'Suspended' : 'Active'}
                </span>
              </div>
            </div>
            <dl className="admin-report-meta">
              <div><dt>Phone</dt><dd>{user.phone || 'Not provided'}</dd></div>
              <div><dt>Residency</dt><dd>{getResidency(user)}</dd></div>
              <div><dt>Email status</dt><dd>{user.emailVerified ? 'Verified' : 'Unverified'}</dd></div>
              <div><dt>Joined</dt><dd>{new Date(user.createdAt).toLocaleString()}</dd></div>
              <div><dt>Total listings</dt><dd>{pagination.total}</dd></div>
              <div><dt>Account access</dt><dd>Suspension remains active until an admin reactivates the account.</dd></div>
              {user.isSuspended && (
                <>
                  <div><dt>Suspended on</dt><dd>{user.suspendedAt ? new Date(user.suspendedAt).toLocaleString() : 'Unknown'}</dd></div>
                  <div><dt>Suspended by</dt><dd>{user.suspendedBy?.name || user.suspendedBy?.email || 'Administrator'}</dd></div>
                  <div><dt>Reason</dt><dd>{user.suspensionReason || 'No reason recorded'}</dd></div>
                </>
              )}
            </dl>
            {user.isSuspended ? (
              <button type="button" className="btn-report-resolve" disabled={savingUser} onClick={() => setUserStatus(false)}>
                {savingUser ? 'Updating...' : 'Reactivate account'}
              </button>
            ) : suspensionConfirmation ? (
              <div className="admin-user-suspend-form">
                <label htmlFor="suspension-reason">Reason for suspension (required)</label>
                <textarea
                  id="suspension-reason"
                  value={suspensionReason}
                  maxLength={1000}
                  onChange={(event) => setSuspensionReason(event.target.value)}
                  placeholder="Explain why this account is being suspended"
                />
                <div>
                  <button
                    type="button"
                    className="btn-delete"
                    disabled={savingUser || !suspensionReason.trim()}
                    onClick={() => setUserStatus(true)}
                  >
                    {savingUser ? 'Suspending...' : 'Confirm suspension'}
                  </button>
                  <button type="button" className="btn-cancel" onClick={() => setSuspensionConfirmation(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-delete" onClick={() => setSuspensionConfirmation(true)}>
                Suspend account
              </button>
            )}
          </section>

          <div className="products-page-heading admin-user-listings-heading">
            <div>
              <h3>Listings by {user.name}</h3>
              <p>Hide a listing temporarily or permanently delete it.</p>
            </div>
          </div>
          {userDetails.listings.length === 0 ? (
            <p className="no-items">This user has no listings.</p>
          ) : (
            <div className="admin-user-listings">
              {userDetails.listings.map((listing) => (
                <article className="admin-user-listing" key={listing._id}>
                  {listing.images?.[0] && <img src={listing.images[0]} alt="" />}
                  <div className="admin-user-listing-info">
                    <h4>{listing.title}</h4>
                    <p>₹{listing.price} · {listing.category.replace(/_/g, ' ')} · {listing.isSold ? 'Sold' : 'Available'}</p>
                    <span>
                      {user.isSuspended
                        ? 'Hidden while seller is suspended'
                        : listing.isHidden ? 'Temporarily hidden' : 'Visible in marketplace'}
                    </span>
                  </div>
                  <div className="admin-user-listing-actions">
                    <button
                      type="button"
                      className="listing-visibility-switch"
                      role="switch"
                      aria-checked={!listing.isHidden}
                      aria-label={`Listing visibility: ${listing.isHidden ? 'hidden' : 'visible'}`}
                      disabled={savingListingId === listing._id || user.isSuspended}
                      title={user.isSuspended ? 'Reactivate the seller to manage listing visibility.' : undefined}
                      onClick={() => setListingVisibility(listing, !listing.isHidden)}
                    >
                      {savingListingId === listing._id
                        ? 'Updating...'
                        : user.isSuspended
                          ? 'Hidden while suspended'
                          : listing.isHidden ? 'Restore' : 'Hide'}
                    </button>
                    <button
                      type="button"
                      className="btn-delete"
                      disabled={savingListingId === listing._id}
                      onClick={() => deleteListing(listing)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {userDetails.pagination.totalPages > 1 && (
            <nav className="admin-report-pagination" aria-label="User listing pages">
              <button type="button" disabled={listingsPage <= 1} onClick={() => setListingsPage((current) => current - 1)}>
                Previous
              </button>
              <span>Page {listingsPage} of {userDetails.pagination.totalPages}</span>
              <button
                type="button"
                disabled={listingsPage >= userDetails.pagination.totalPages}
                onClick={() => setListingsPage((current) => current + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
