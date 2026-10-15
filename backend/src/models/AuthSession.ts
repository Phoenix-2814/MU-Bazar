import mongoose, { Document, Schema } from 'mongoose';

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionLogoutReason = 'manual' | 'tab_closed' | 'idle_timeout' | 'max_lifetime';

export interface IAuthSession extends Document<string> {
  _id: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  loginAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  loggedOutAt?: Date;
  logoutReason?: SessionLogoutReason;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true, lowercase: true },
    loginAt: { type: Date, required: true, default: Date.now },
    lastActivityAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    loggedOutAt: { type: Date },
    logoutReason: {
      type: String,
      enum: ['manual', 'tab_closed', 'idle_timeout', 'max_lifetime'],
    },
  },
  { timestamps: true }
);

AuthSessionSchema.index({ userId: 1, loginAt: -1 });
AuthSessionSchema.index({ loginAt: -1 });
AuthSessionSchema.index({ loggedOutAt: 1, lastActivityAt: 1, expiresAt: 1 });

export default mongoose.model<IAuthSession>('AuthSession', AuthSessionSchema);
