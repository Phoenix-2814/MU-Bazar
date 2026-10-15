import { MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../config';

export default function EditListingModal({
  editItemForm,
  handleModifySubmit,
  isModifyingItem,
  setEditItemForm,
  setEditItemModal,
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-product-heading">
      <div className="modal-content product-form-modal">
        <button type="button" className="close-btn" onClick={() => setEditItemModal(null)} aria-label="Close form">
          &times;
        </button>
        <header className="product-form-heading">
          <p>YOUR PRODUCT</p>
          <h2 id="edit-product-heading">Edit product</h2>
          <span>Update the details buyers see in the marketplace.</span>
        </header>
        <form onSubmit={handleModifySubmit}>
          <label className="product-form-field">
            <span>Product title</span>
            <input
            type="text"
            aria-label="Product title"
            placeholder="Title"
            maxLength={MAX_LISTING_TITLE_LENGTH}
            value={editItemForm.title}
            onChange={(e) => setEditItemForm({ ...editItemForm, title: e.target.value })}
            required
            />
          </label>
          <label className="product-form-field">
            <span>Description</span>
            <textarea
            aria-label="Product description"
            placeholder="Description"
            maxLength={MAX_LISTING_DESCRIPTION_LENGTH}
            value={editItemForm.description}
            onChange={(e) =>
              setEditItemForm({ ...editItemForm, description: e.target.value })
            }
            required
            />
          </label>
          <label className="product-form-field">
            <span>Price</span>
            <input
            type="number"
            aria-label="Product price"
            placeholder="Price (₹)"
            min="1"
            max="500000"
            step="1"
            value={editItemForm.price}
            onChange={(e) => setEditItemForm({ ...editItemForm, price: e.target.value })}
            required
            />
          </label>
          <div className="product-form-selects">
          <label className="product-form-field">
            <span>Category</span>
            <select
            aria-label="Product category"
            value={editItemForm.category}
            onChange={(e) => setEditItemForm({ ...editItemForm, category: e.target.value })}
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
            aria-label="Product condition"
            value={editItemForm.condition}
            onChange={(e) => setEditItemForm({ ...editItemForm, condition: e.target.value })}
          >
            <option value="NEW">Brand New</option>
            <option value="USED_LIKE_NEW">Used - Like New</option>
            <option value="USED_GOOD">Used - Good</option>
            <option value="USED_FAIR">Used - Fair</option>
            </select>
          </label>
          </div>
          <label className="product-form-field product-image-field">
            <span>Replace photos <small>Optional</small></span>
            <input
            type="file"
            aria-label="Replace product photos"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setEditItemForm({ ...editItemForm, images: e.target.files })}
            />
            <small>Choose photos only if you want to update the current ones.</small>
          </label>
          <button type="submit" className="btn-submit" disabled={isModifyingItem}>
            {isModifyingItem ? 'Saving product...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
