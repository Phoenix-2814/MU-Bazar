import React, { useState } from 'react';
import { Copy, Check, Share2, MessageCircle, X } from 'lucide-react';

export default function ShareModal({ item, onClose, isNewPost = false }) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const itemUrl = `${window.location.origin}/item/${item._id || item.id}`;
  const shareText = `Check out "${item.title}" for ₹${item.price} on HostelBazar! ${itemUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(itemUrl);
      } else {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = itemUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator?.share) {
      try {
        await navigator.share({
          title: item.title,
          text: `Check out "${item.title}" for ₹${item.price} on HostelBazar!`,
          url: itemUrl,
        });
      } catch (err) {
        // User aborted share or share failed
        if (err.name !== 'AbortError') {
          console.error('Native share failed:', err);
        }
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content share-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-btn"
          onClick={onClose}
          aria-label="Close share popup"
        >
          <X size={18} />
        </button>

        <div className="share-modal-header">
          <div className="share-icon-badge">
            <Share2 size={24} />
          </div>
          <h2>{isNewPost ? 'Your Product is Live! 🎉' : 'Share this Product'}</h2>
          <p className="share-modal-subtitle">
            {isNewPost
              ? 'Your product has been posted. Share the link with friends or university groups so buyers can find it quickly:'
              : 'Share this product with anyone on campus:'}
          </p>
        </div>

        <div className="share-item-preview">
          {item.images?.[0] ? (
            <img src={item.images[0]} alt={item.title} className="share-preview-thumb" />
          ) : (
            <div className="share-preview-placeholder">📦</div>
          )}
          <div className="share-preview-info">
            <h4 className="share-preview-title">{item.title}</h4>
            <span className="share-preview-price">₹{item.price}</span>
          </div>
        </div>

        <div className="share-link-box">
          <input
            type="text"
            readOnly
            value={itemUrl}
            className="share-link-input"
            onFocus={(e) => e.target.select()}
            aria-label="Product shareable link"
          />
          <button
            type="button"
            className={`btn-copy-link ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            aria-label={copied ? 'Link copied' : 'Copy link'}
          >
            {copied ? (
              <>
                <Check size={16} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="share-actions-grid">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-share-whatsapp"
            aria-label="Share on WhatsApp"
          >
            <MessageCircle size={18} />
            <span>Share on WhatsApp</span>
          </a>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              className="btn-share-native"
              onClick={handleNativeShare}
              aria-label="More share options"
            >
              <Share2 size={18} />
              <span>More Options</span>
            </button>
          )}
        </div>

        <div className="share-modal-footer">
          <button
            type="button"
            className="btn-share-done"
            onClick={onClose}
          >
            {isNewPost ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
