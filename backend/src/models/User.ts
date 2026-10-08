import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  emailVerified: boolean;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;
  emailVerificationSentAt?: Date;
  password?: string;
  phone?: string;
  residencyType: 'hosteler' | 'outsider';
  hostelName?: string;
  hostelBlock?: string;
  roomNumber?: string;
  profilePic?: string;
}

const UserSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
    emailVerificationSentAt: {
      type: Date,
      select: false,
    },
    password: {
      type: String,
      required: false,
      select: false,
    },
    phone: {
      type: String,
      default: '',
    },
    residencyType: {
      type: String,
      enum: ['hosteler', 'outsider'],
      default: 'hosteler',
      required: true,
    },
    hostelName: {
      type: String,
      default: '',
      trim: true,
    },
    hostelBlock: {
      type: String,
      default: '',
      trim: true,
    },
    roomNumber: {
      type: String,
      default: '',
      trim: true,
    },
    profilePic: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);