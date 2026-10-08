import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import ChatModal from './ChatModal';

const mockSocketHandlers = {};

jest.mock('axios');
jest.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      connected: false,
      on: jest.fn((event, handler) => {
        mockSocketHandlers[event] = handler;
      }),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    return socket;
  },
}));

test('shows the product the buyer contacted the seller about', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/chat/conversations')) {
      return Promise.resolve({
        data: [{
          _id: 'conversation-1',
          members: [
            { _id: 'buyer-1', name: 'Buyer' },
            { _id: 'seller-1', name: 'Seller' },
          ],
          itemId: {
            title: 'Physics Textbook',
            price: 500,
            images: ['https://images.example/physics-textbook.jpg'],
          },
        }],
      });
    }

    if (url.endsWith('/api/chat/messages/conversation-1')) {
      return Promise.resolve({ data: [] });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  axios.patch.mockResolvedValue({ data: { unreadCount: 0 } });

  render(
    <ChatModal
      conversationId="conversation-1"
      currentUser={{ _id: 'seller-1' }}
      token="test-token"
      onUnreadCountChange={jest.fn()}
      onClose={jest.fn()}
    />
  );

  expect(await screen.findByText('Chat with Buyer')).toBeInTheDocument();
  expect(screen.getByText('Physics Textbook')).toBeInTheDocument();
  expect(screen.getByText('₹500')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Physics Textbook' })).toHaveAttribute(
    'src',
    'https://images.example/physics-textbook.jpg'
  );
  expect(screen.getByRole('button', { name: 'Hi' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'What is the final price?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Can you lower the price?' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Can you lower the price?' }));
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Can you lower the price?');
});

test('updates a sent message to seen when the other user reads the conversation', async () => {
  Object.keys(mockSocketHandlers).forEach((key) => delete mockSocketHandlers[key]);
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/chat/conversations')) {
      return Promise.resolve({
        data: [{
          _id: 'conversation-1',
          members: [
            { _id: 'buyer-1', name: 'Buyer' },
            { _id: 'seller-1', name: 'Seller' },
          ],
          itemId: { title: 'Physics Textbook', price: 500 },
        }],
      });
    }

    if (url.endsWith('/api/chat/messages/conversation-1')) {
      return Promise.resolve({
        data: [{
          _id: 'message-1',
          conversationId: 'conversation-1',
          sender: 'seller-1',
          text: 'Is this available?',
          readBy: [],
          createdAt: '2026-10-09T00:00:00.000Z',
        }],
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  axios.patch.mockResolvedValue({ data: { unreadCount: 0 } });

  render(
    <ChatModal
      conversationId="conversation-1"
      currentUser={{ _id: 'seller-1' }}
      token="test-token"
      onUnreadCountChange={jest.fn()}
      onClose={jest.fn()}
    />
  );

  expect(await screen.findByLabelText('Sent, not seen yet')).toBeInTheDocument();
  act(() => {
    mockSocketHandlers.messages_read({ conversationId: 'conversation-1', readerId: 'buyer-1' });
  });
  expect(await screen.findByLabelText('Seen by recipient')).toBeInTheDocument();
});
