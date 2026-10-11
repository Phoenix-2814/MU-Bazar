import { MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../config';

export default function EditListingModal({
  editItemForm,
  handleModifySubmit,
  isModifyingItem,
  setEditItemForm,
  setEditItemModal,
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-btn" onClick={() => setEditItemModal(null)}>
          &times;
        </button>
        <h2>Modify Product</h2>
        <form onSubmit={handleModifySubmit}>
          <input
            type="text"
            placeholder="Title"
            maxLength={MAX_LISTING_TITLE_LENGTH}
            value={editItemForm.title}
            onChange={(e) => setEditItemForm({ ...editItemForm, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Description"
            maxLength={MAX_LISTING_DESCRIPTION_LENGTH}
            value={editItemForm.description}
            onChange={(e) =>
              setEditItemForm({ ...editItemForm, description: e.target.value })
            }
            required
          />
          <input
            type="number"
            placeholder="Price (₹)"
            min="1"
            max="500000"
            step="1"
            value={editItemForm.price}
            onChange={(e) => setEditItemForm({ ...editItemForm, price: e.target.value })}
            required
          />
          <select
            value={editItemForm.category}
            onChange={(e) => setEditItemForm({ ...editItemForm, category: e.target.value })}
          >
            <option value="BOOKS">Books & Notes</option>
            <option value="ELECTRONICS">Electronics</option>
            <option value="CLOTHING">Clothing</option>
            <option value="HOSTEL_ESSENTIALS">Hostel Essentials</option>
            <option value="OTHER">Others</option>
          </select>
          <select
            value={editItemForm.condition}
            onChange={(e) => setEditItemForm({ ...editItemForm, condition: e.target.value })}
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
            onChange={(e) => setEditItemForm({ ...editItemForm, images: e.target.files })}
          />
          <button type="submit" className="btn-submit" disabled={isModifyingItem}>
            {isModifyingItem ? 'Saving product...' : 'Save Modifications'}
          </button>
        </form>
      </div>
    </div>
  );
}
