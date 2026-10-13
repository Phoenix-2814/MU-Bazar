import React from 'react';
import { X, Share2, MessageCircle, MapPin, Tag, ShieldCheck } from 'lucide-react';
import ListingImage from './ListingImage';

export default function ItemDetailModal({
  item,
  onClose,
  handleMessageSeller,
  handleShareListing,
  handleReportListing,
}) {
  if (!item) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content item-detail-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-btn"
          onClick={onClose}
          aria-label="Close product details"
        >
          <X size={18} />
        </button>

        <div className="detail-image-wrapper">
          <ListingImage images={item.images} title={item.title} />
          <span className="price-tag detail-price-tag">₹{item.price}</span>
          {item.isSold && <span className="public-sold-badge">SOLD</span>}
        </div>

        <div className="detail-body">
          <div className="detail-header-row">
            <div>
              <span className="badge">{(item.condition || '').replace('_', ' ')}</span>
              <span className="badge category-badge">{(item.category || '').replace('_', ' ')}</span>
            </div>
            <button
              type="button"
              className="btn-card-share"
              onClick={() => handleShareListing(item)}
              aria-label="Share this listing"
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>
          </div>

          <h2 className="detail-title">{item.title}</h2>
          <p className="detail-description">{item.description}</p>

          <div className="detail-seller-card">
            <div className="detail-seller-header">
              {item.seller?.profilePic ? (
                <div
                  className="seller-avatar-img secure-bg-avatar"
                  style={{ backgroundImage: `url(${item.seller.profilePic})` }}
                />
              ) : (
                <div className="seller-avatar-small">
                  {item.seller?.name ? item.seller.name.charAt(0).toUpperCase() : 'S'}
                </div>
              )}
              <div className="detail-seller-meta">
                <span className="seller-name">{item.seller?.name || 'MU Student'}</span>
                <span className="seller-info">
                  {item.seller?.residencyType === 'outsider'
                    ? 'Day Scholar / Outsider'
                    : (item.seller?.hostelName || 'Hosteler')}
                </span>
              </div>
            </div>
          </div>

          <div className="detail-actions-row">
            {item.isSold ? (
              <span className="sold-badge detail-sold-notice">This item has been marked as sold</span>
            ) : (
              <button
                type="button"
                className="btn-chat-seller detail-chat-btn"
                onClick={() => {
                  onClose();
                  handleMessageSeller(item);
                }}
              >
                <MessageCircle size={16} />
                <span>Message Seller</span>
              </button>
            )}
            <button
              type="button"
              className="btn-report-listing"
              onClick={() => {
                onClose();
                handleReportListing(item);
              }}
            >
              Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

