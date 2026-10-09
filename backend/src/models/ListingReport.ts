import mongoose, { Document, Schema } from 'mongoose';

export const REPORT_REASONS = ['scam', 'prohibited', 'misleading', 'other'] as const;
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;

export interface IListingReport extends Document {
  listing: mongoose.Types.ObjectId;
  reporter: mongoose.Types.ObjectId;
  reason: typeof REPORT_REASONS[number];
  details: string;
  status: typeof REPORT_STATUSES[number];
  adminNote: string;
  reviewedBy?: mongoose.Types.ObjectId;
}

const ListingReportSchema: Schema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: REPORT_STATUSES, default: 'open', required: true },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ListingReportSchema.index({ listing: 1, reporter: 1 }, { unique: true });
ListingReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IListingReport>('ListingReport', ListingReportSchema);
