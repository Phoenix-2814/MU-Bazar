import { fireEvent, render, screen } from '@testing-library/react';
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
