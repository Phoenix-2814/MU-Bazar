import mongoose, { Schema, Document } from 'mongoose';

export interface IListing extends Document {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  isSold: boolean;
  isHidden: boolean;
  isHiddenBySuspension: boolean;
  seller: mongoose.Types.ObjectId;
}

const ListingSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    price: { type: Number, required: true },
    category: { type: String, default: 'OTHER' },
    condition: { type: String, default: 'USED_GOOD' },
    images: [{ type: String }],
    isSold: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false, required: true },
    isHiddenBySuspension: { type: Boolean, default: false, required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ListingSchema.index({ isHidden: 1, isSold: 1, createdAt: -1 });
ListingSchema.index({ seller: 1, updatedAt: -1 });
ListingSchema.index({ category: 1, price: 1, createdAt: -1 });

export default mongoose.model<IListing>('Listing', ListingSchema);
