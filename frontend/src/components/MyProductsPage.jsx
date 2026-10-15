export default function MyProductsPage({
  activePage,
  handleDeleteProduct,
  handleShareListing,
  handleToggleSold,
  isUpdatingListingStatus,
  myActiveListings,
  myProductsLoading,
  mySoldHistoryListings,
  openEditModal,
}) {
  return (
    <section className="products-page">
      <div className="products-page-heading">
        <div>
          <h2>{activePage === 'my-products' ? 'My Products' : 'Product History'}</h2>
          <p>
            {activePage === 'my-products'
              ? 'Manage your active products.'
              : 'Products you have marked as sold.'}
          </p>
        </div>
      </div>
      {myProductsLoading ? (
        <p className="loading-text">Loading your products...</p>
      ) : activePage === 'my-products' ? (
        myActiveListings.length === 0 ? (
          <p className="no-items">You don’t have any active products yet.</p>
        ) : (
          <ul className="my-items-list products-page-list">
            {myActiveListings.map((item) => (
              <li key={item._id} className="my-item-row">
                <div className="item-info">
                  {item.images?.[0] && <img src={item.images[0]} alt="" />}
                  <span>
                    <small className={`product-status-badge ${item.isHidden ? 'is-review' : ''}`}>
                      {item.isHidden ? 'Under review' : 'Active'}
                    </small>
                    <strong>{item.title}</strong>
                    <small>₹{item.price} · {item.category.replace('_', ' ')}</small>
                    {item.isHidden && (
                      <small className="listing-hidden-notice">
                        Hidden from the marketplace pending admin review.
                      </small>
                    )}
                  </span>
                </div>
                <div className="action-buttons">
                  {handleShareListing && (
                    <button
                      className="btn-modify"
                      type="button"
                      onClick={() => handleShareListing(item)}
                    >
                      Share
                    </button>
                  )}
                  <button type="button" className="btn-modify" onClick={() => openEditModal(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-sold"
                    disabled={isUpdatingListingStatus}
                    onClick={() => handleToggleSold(item._id, true)}
                  >
                    {isUpdatingListingStatus ? 'Updating...' : 'Mark as Sold'}
                  </button>
                  <button type="button" className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : mySoldHistoryListings.length === 0 ? (
        <p className="no-items">Your sold products will appear here.</p>
      ) : (
        <ul className="my-items-list products-page-list">
          {mySoldHistoryListings.map((item) => (
            <li key={item._id} className="my-item-row sold-item-row">
              <div className="item-info">
                {item.images?.[0] && <img src={item.images[0]} alt="" />}
                <span>
                  <small className="product-status-badge is-sold">Sold</small>
                  <strong>{item.title}</strong>
                  <small>₹{item.price} · Sold {new Date(item.updatedAt).toLocaleDateString()}</small>
                </span>
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  className="btn-relist"
                  disabled={isUpdatingListingStatus}
                  onClick={() => handleToggleSold(item._id, false)}
                >
                  {isUpdatingListingStatus ? 'Updating...' : 'Mark Active'}
                </button>
                <button type="button" className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
