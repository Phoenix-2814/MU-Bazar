import mongoose, { Schema, Document } from 'mongoose';

export interface IListing extends Document {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  isSold: boolean;
  seller: mongoose.Types.ObjectId;
}

const ListingSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, default: 'OTHER' },
    condition: { type: String, default: 'USED_GOOD' },
    images: [{ type: String }],
    isSold: { type: Boolean, default: false },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IListing>('Listing', ListingSchema);