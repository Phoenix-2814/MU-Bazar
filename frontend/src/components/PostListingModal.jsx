import { useEffect, useState } from 'react';
import { MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../config';

export default function PostListingModal({
  handlePostSubmit,
  isPostingItem,
  postForm,
  setPostForm,
  setShowPostModal,
}) {
  const [imagePreviews, setImagePreviews] = useState([]);

  useEffect(() => {
    const previewUrls = Array.from(postForm.images || []).map((file) => URL.createObjectURL(file));
    setImagePreviews(previewUrls);
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [postForm.images]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="post-product-heading">
      <div className="modal-content product-form-modal">
        <button type="button" className="close-btn" onClick={() => setShowPostModal(false)} aria-label="Close form">
          &times;
        </button>
        <header className="product-form-heading">
          <p>SELL ON CAMPUS</p>
          <h2 id="post-product-heading">Sell a product</h2>
          <span>Add a few details so students know what you’re offering.</span>
        </header>
        <form onSubmit={handlePostSubmit}>
          <label className="product-form-field">
            <span>Product title</span>
            <input
            type="text"
            placeholder="Title"
            maxLength={MAX_LISTING_TITLE_LENGTH}
            value={postForm.title}
            onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
            required
            />
          </label>
          <label className="product-form-field">
            <span>Description</span>
            <textarea
            placeholder="Description"
            maxLength={MAX_LISTING_DESCRIPTION_LENGTH}
            value={postForm.description}
            onChange={(e) => setPostForm({ ...postForm, description: e.target.value })}
            required
            />
          </label>
          <label className="product-form-field">
            <span>Price</span>
            <input
            type="number"
            placeholder="Price (₹)"
            min="1"
            max="500000"
            step="1"
            value={postForm.price}
            onChange={(e) => setPostForm({ ...postForm, price: e.target.value })}
            required
            />
          </label>
          <div className="product-form-selects">
          <label className="product-form-field">
            <span>Category</span>
            <select
            value={postForm.category}
            onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}
          >
            <option value="BOOKS">Books & Notes</option>
            <option value="ELECTRONICS">Electronics</option>
            <option value="CLOTHING">Clothing</option>
            <option value="HOSTEL_ESSENTIALS">Hostel Essentials</option>
            <option value="OTHER">Others</option>
            </select>
          </label>
          <label className="product-form-field">
            <span>Condition</span>
            <select
            value={postForm.condition}
            onChange={(e) => setPostForm({ ...postForm, condition: e.target.value })}
          >
            <option value="NEW">Brand New</option>
            <option value="USED_LIKE_NEW">Used - Like New</option>
            <option value="USED_GOOD">Used - Good</option>
            <option value="USED_FAIR">Used - Fair</option>
            </select>
          </label>
          </div>
          <label className="product-form-field product-image-field">
            <span>Product photos <small>Optional</small></span>
            <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setPostForm({ ...postForm, images: e.target.files })}
            />
            <small>
              {imagePreviews.length
                ? `${imagePreviews.length} photo${imagePreviews.length === 1 ? '' : 's'} selected. Choose again to replace them.`
                : 'Select up to 5 photos. Clear photos help buyers assess the product condition.'}
            </small>
            {imagePreviews.length > 0 && (
              <div className="product-upload-previews" aria-label="Selected product photo previews">
                {imagePreviews.map((preview, index) => (
                  <img src={preview} alt={`Selected product photo ${index + 1}`} key={preview} />
                ))}
              </div>
            )}
          </label>
          <button type="submit" className="btn-submit" disabled={isPostingItem}>
            {isPostingItem ? 'Preparing product...' : 'Publish product'}
          </button>
        </form>
      </div>
    </div>
  );
}
