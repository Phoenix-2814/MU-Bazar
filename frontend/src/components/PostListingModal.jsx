import { MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../config';

export default function PostListingModal({
  handlePostSubmit,
  isPostingItem,
  postForm,
  setPostForm,
  setShowPostModal,
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-btn" onClick={() => setShowPostModal(false)}>
          &times;
        </button>
        <h2>Post Item</h2>
        <form onSubmit={handlePostSubmit}>
          <input
            type="text"
            placeholder="Title"
            maxLength={MAX_LISTING_TITLE_LENGTH}
            value={postForm.title}
            onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Description"
            maxLength={MAX_LISTING_DESCRIPTION_LENGTH}
            value={postForm.description}
            onChange={(e) => setPostForm({ ...postForm, description: e.target.value })}
            required
          />
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
          <select
            value={postForm.condition}
            onChange={(e) => setPostForm({ ...postForm, condition: e.target.value })}
          >
            <option value="NEW">Brand New</option>
            <option value="USED_LIKE_NEW">Used - Like New</option>
            <option value="USED_GOOD">Used - Good</option>
            <option value="USED_FAIR">Used - Fair</option>
          </select>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setPostForm({ ...postForm, images: e.target.files })}
          />
          <button type="submit" className="btn-submit" disabled={isPostingItem}>
            {isPostingItem ? 'Preparing item...' : 'Post Item'}
          </button>
        </form>
      </div>
    </div>
  );
}
