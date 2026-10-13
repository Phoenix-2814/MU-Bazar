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
              ? 'Manage your active listings.'
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
                      style={{ background: '#4f46e5', color: '#fff' }}
                      onClick={() => handleShareListing(item)}
                    >
                      Share
                    </button>
                  )}
                  <button className="btn-modify" onClick={() => openEditModal(item)}>
                    Modify
                  </button>
                  <button
                    className="btn-sold"
                    disabled={isUpdatingListingStatus}
                    onClick={() => handleToggleSold(item._id, true)}
                  >
                    {isUpdatingListingStatus ? 'Updating...' : 'Mark as Sold'}
                  </button>
                  <button className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
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
                  <span className="sold-badge">SOLD</span>
                  <strong>{item.title}</strong>
                  <small>₹{item.price} · Sold {new Date(item.updatedAt).toLocaleDateString()}</small>
                </span>
              </div>
              <div className="action-buttons">
                <button
                  className="btn-relist"
                  disabled={isUpdatingListingStatus}
                  onClick={() => handleToggleSold(item._id, false)}
                >
                  {isUpdatingListingStatus ? 'Updating...' : 'Mark Active'}
                </button>
                <button className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
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
