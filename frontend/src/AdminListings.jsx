import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ArchiveRestore, PackageCheck, Search } from 'lucide-react';
import AdminChatHistory from './components/AdminChatHistory';

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const formatPrice = (price) => `₹${Number(price || 0).toLocaleString('en-IN')}`;

export default function AdminListings({ token, status }) {
  const [listings, setListings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isHiddenPage = status === 'hidden';
  const title = isHiddenPage ? 'Hidden products' : 'Sold products';

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin/listings`, {
        params: { status, page, search },
        headers: { Authorization: `Bearer ${token}` },
      });
      setListings(response.data.listings || []);
      setPagination(response.data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || `Could not load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, title, token]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const restoreListing = async (listing) => {
    setRestoringId(listing._id);
    setError('');
    setNotice('');
    try {
      await axios.patch(`${API_BASE_URL}/api/reports/admin/listings/${listing._id}/visibility`,
        { isHidden: false }, { headers: { Authorization: `Bearer ${token}` } });
      setNotice(`“${listing.title}” is visible in the marketplace again.`);
      await loadListings();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not restore this product.');
    } finally {
      setRestoringId('');
    }
  };

  return (
    <section className="products-page admin-archive-page">
      <div className="products-page-heading admin-archive-heading">
        <div>
          <span className="admin-archive-eyebrow">PRODUCT MANAGEMENT</span>
          <h2>{title}</h2>
          <p>
            {isHiddenPage
              ? 'Review products hidden from the marketplace and restore them when appropriate.'
              : 'Review sold product details, sellers, and conversations connected to each sale.'}
          </p>
        </div>
        <span className="admin-archive-total">{pagination.total} {pagination.total === 1 ? 'product' : 'products'}</span>
      </div>

      <form className="admin-archive-search" onSubmit={submitSearch}>
        <label htmlFor="admin-archive-search">Search by product title</label>
        <div>
          <Search size={18} aria-hidden="true" />
          <input
            id="admin-archive-search"
            type="search"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search products"
          />
          <button type="submit" className="btn-submit">Search</button>
        </div>
      </form>

      {error && <p className="report-error" role="alert">{error}</p>}
      {notice && <p className="admin-archive-notice" role="status">{notice}</p>}
      {loading ? (
        <p className="loading-text">Loading products…</p>
      ) : listings.length === 0 ? (
        <div className="admin-archive-empty">
          {isHiddenPage ? <ArchiveRestore size={28} aria-hidden="true" /> : <PackageCheck size={28} aria-hidden="true" />}
          <h3>No {title.toLowerCase()} found</h3>
          <p>{search ? 'Try another title.' : 'Products in this section will appear here.'}</p>
        </div>
      ) : (
        <div className="admin-archive-list">
          {listings.map((listing) => (
            <article className="admin-archive-card" key={listing._id}>
              <div className="admin-archive-product">
                {listing.images?.[0] ? <img src={listing.images[0]} alt={listing.title} /> : <div className="admin-archive-image-placeholder">No image</div>}
                <div className="admin-archive-product-copy">
                  <div className="admin-archive-title-line">
                    <h3>{listing.title}</h3>
                    <span className={`admin-archive-badge ${isHiddenPage ? 'is-hidden' : 'is-sold'}`}>
                      {isHiddenPage ? 'Hidden' : 'Sold'}
                    </span>
                  </div>
                  <strong>{formatPrice(listing.price)}</strong>
                  <p>{listing.category?.replace(/_/g, ' ')} · {listing.condition?.replace(/_/g, ' ')}</p>
                  <p>{listing.description}</p>
                  <div className="admin-archive-seller">
                    <span className="admin-archive-avatar">{listing.seller?.name?.charAt(0).toUpperCase() || '?'}</span>
                    <span><b>{listing.seller?.name || 'Seller unavailable'}</b><small>{listing.seller?.email || ''}</small></span>
                    {listing.seller?.isSuspended && <em>Suspended account</em>}
                  </div>
                  <small className="admin-archive-date">
                    {isHiddenPage ? 'Updated' : 'Marked sold'} {new Date(listing.updatedAt || listing.createdAt).toLocaleString()}
                  </small>
                </div>
                {isHiddenPage && (
                  <button
                    type="button"
                    className="admin-archive-restore"
                    disabled={restoringId === listing._id || listing.seller?.isSuspended}
                    title={listing.seller?.isSuspended ? 'Reactivate the seller before restoring this product.' : undefined}
                    onClick={() => restoreListing(listing)}
                  >
                    <ArchiveRestore size={17} aria-hidden="true" />
                    {restoringId === listing._id ? 'Restoring…' : 'Restore product'}
                  </button>
                )}
              </div>
              <AdminChatHistory
                listingId={listing._id}
                listingTitle={listing.title}
                sellerId={listing.seller?._id}
                token={token}
              />
            </article>
          ))}
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <nav className="admin-report-pagination" aria-label={`${title} pages`}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {pagination.totalPages} · {pagination.total} products</span>
          <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
