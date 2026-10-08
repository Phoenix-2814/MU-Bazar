import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  text: string;
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);

export interface IConversation extends Document {
  members: mongoose.Types.ObjectId[];
  itemId?: mongoose.Types.ObjectId;
  lastMessage?: string;
  updatedAt: Date;
}

const ConversationSchema: Schema = new Schema(
  {
    members: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (members: mongoose.Types.ObjectId[]) => members.length === 2,
        message: 'A conversation must have exactly two members.',
      },
    },
    itemId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    lastMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

ConversationSchema.index({ members: 1, itemId: 1 });
MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);