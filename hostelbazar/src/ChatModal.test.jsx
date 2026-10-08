import { render, screen } from '@testing-library/react';
import axios from 'axios';
import ChatModal from './ChatModal';

jest.mock('axios');
jest.mock('socket.io-client', () => ({
  io: () => ({
    connected: false,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
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
          itemId: { title: 'Physics Textbook', price: 500 },
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
  expect(screen.getByText('About: Physics Textbook')).toBeInTheDocument();
});
