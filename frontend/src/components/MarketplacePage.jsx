import { Share2, Flag, MessageCircle } from 'lucide-react';
import ListingImage from './ListingImage';
import { CATEGORY_OPTIONS } from '../config';

export default function MarketplacePage({
  expandedDescriptions,
  fetchItems,
  filteredItems,
  handleMessageSeller,
  handleReportListing,
  handleShareListing,
  hasMoreItems,
  items,
  itemsLoadError,
  listingSort,
  loading,
  loadingMoreItems,
  maximumPrice,
  minimumPrice,
  preventContextMenu,
  priceRangeError,
  searchQuery,
  selectedCategory,
  setExpandedDescriptions,
  setListingSort,
  setMaximumPrice,
  setMinimumPrice,
  setSearchQuery,
  setSelectedCategory,
  sortedItems,
  totalItems,
}) {
  return (
      <>
    <h2>
      {searchQuery.trim()
        ? 'Search Results'
        : selectedCategory === 'ALL'
          ? 'Recent Listings'
          : `${CATEGORY_OPTIONS.find((category) => category.key === selectedCategory)?.label || 'Other'} Listings`}
    </h2>

    <div className="listing-controls">
      <fieldset className="listing-price-filter">
        <legend>Price range (₹)</legend>
        <label>
          <span>Min</span>
          <input
            type="number"
            aria-label="Minimum price"
            min="0"
            max="500000"
            step="1"
            inputMode="numeric"
            placeholder="Any"
            value={minimumPrice}
            onChange={(event) => setMinimumPrice(event.target.value)}
          />
        </label>
        <label>
          <span>Max</span>
          <input
            type="number"
            aria-label="Maximum price"
            min="0"
            max="500000"
            step="1"
            inputMode="numeric"
            placeholder="Any"
            value={maximumPrice}
            onChange={(event) => setMaximumPrice(event.target.value)}
          />
        </label>
      </fieldset>
      <div className="listing-sort-control">
        <label htmlFor="listing-sort">Sort by</label>
        <select
          id="listing-sort"
          value={listingSort}
          onChange={(event) => setListingSort(event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </select>
      </div>
      {(searchQuery || selectedCategory !== 'ALL' || minimumPrice || maximumPrice) && (
        <button
          type="button"
          className="clear-filters-button"
          onClick={() => {
            setSearchQuery('');
            setSelectedCategory('ALL');
            setMinimumPrice('');
            setMaximumPrice('');
          }}
          aria-label="Clear marketplace filters"
        >
          Clear filters
        </button>
      )}
    </div>

    {priceRangeError && <p className="price-filter-error" role="alert">{priceRangeError}</p>}

    {loading && items.length === 0 ? (
      <section className="listing-loading" role="status" aria-live="polite" aria-busy="true">
        <p className="loading-text">Loading listings...</p>
        <div className="items-grid listing-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="listing-skeleton-card" key={index}>
              <div className="listing-skeleton-image" />
              <div className="listing-skeleton-body">
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      </section>
    ) : itemsLoadError && items.length === 0 ? (
      <div className="no-items" role="alert">
        <p>{itemsLoadError}</p>
        <button type="button" className="btn-resend-verification" onClick={fetchItems}>
          Retry
        </button>
      </div>
    ) : (
      <>
      {loading && (
        <p className="listing-refresh-status" role="status" aria-live="polite">
          Refreshing listings…
        </p>
      )}
      {itemsLoadError && (
        <div className="listing-refresh-error" role="alert">
          <span>{itemsLoadError}</span>
          <button type="button" onClick={fetchItems}>Retry</button>
        </div>
      )}
      {priceRangeError ? null : filteredItems.length === 0 ? (
      <div className="no-items">
        <p>No listings match your search or filters.</p>
      </div>
    ) : (
      <div className="items-grid">
        {sortedItems.map((item) => (
          <div className="item-card" key={item._id}>
            <div className="image-container">
              <ListingImage images={item.images} title={item.title} />
              <button
                type="button"
                className="btn-card-floating-share"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShareListing(item);
                }}
                title="Share this listing"
                aria-label={`Share ${item.title}`}
              >
                <Share2 size={15} />
              </button>
              <span className="price-tag">₹{item.price}</span>
              {item.isSold && <span className="public-sold-badge">SOLD</span>}
            </div>

            <div className="card-body">
              <h3>{item.title}</h3>
              <p className={`description ${expandedDescriptions[item._id] ? 'description-expanded' : ''}`}>
                {item.description}
              </p>
              {String(item.description || '').length > 120 && (
                <button
                  type="button"
                  className="description-toggle"
                  aria-expanded={Boolean(expandedDescriptions[item._id])}
                  onClick={() => setExpandedDescriptions((current) => ({
                    ...current,
                    [item._id]: !current[item._id],
                  }))}
                >
                  {expandedDescriptions[item._id] ? 'Show less' : 'Read full description'}
                </button>
              )}

              <div className="seller-profile-row">
                {item.seller?.profilePic ? (
                  <div
                    className="seller-avatar-img secure-bg-avatar"
                    style={{ backgroundImage: `url(${item.seller.profilePic})` }}
                    onContextMenu={preventContextMenu}
                  />
                ) : (
                  <div className="seller-avatar-small">
                    {item.seller?.name ? item.seller.name.charAt(0).toUpperCase() : 'S'}
                  </div>
                )}
                <div className="seller-text-details">
                  <span className="seller-name">{item.seller?.name || 'MU Student'}</span>
                  <span className="seller-info">
                    {item.seller?.residencyType === 'outsider'
                      ? 'Outsider'
                      : (item.seller?.hostelName || 'Hosteler')}
                  </span>
                </div>
              </div>

              <div className="card-footer">
                <span className="badge">{(item.condition || '').replace('_', ' ')}</span>
                <div className="card-footer-actions">
                  {item.isSold ? (
                    <span className="sold-badge">Sold</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-chat-seller"
                      onClick={() => handleMessageSeller(item)}
                    >
                      <MessageCircle size={13} />
                      <span>Message seller</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-report-listing-icon"
                    onClick={() => handleReportListing(item)}
                    title="Report this listing"
                    aria-label={`Report ${item.title}`}
                  >
                    <Flag size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
      {!priceRangeError && hasMoreItems && (
        <div className="load-more-row">
          <button
            type="button"
            className="clear-filters-button load-more-button"
            onClick={() => fetchItems({ append: true })}
            disabled={loadingMoreItems}
          >
            {loadingMoreItems ? 'Loading…' : 'Load more listings'}
          </button>
          <p className="load-more-count">Showing {items.length} of {totalItems} listings</p>
        </div>
      )}
      </>
    )}
      </>
  );
}
