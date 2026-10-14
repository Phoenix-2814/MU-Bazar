import { vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ChatModal from './ChatModal';

const mockSocketHandlers = {};
let mockSocket;

vi.mock('axios');
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      connected: true,
      on: vi.fn((event, handler) => {
        mockSocketHandlers[event] = handler;
      }),
      off: vi.fn(),
      emit: vi.fn(),
      timeout: vi.fn(() => socket),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    mockSocket = socket;
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(await screen.findByLabelText('Sent, not seen yet')).toBeInTheDocument();
  act(() => {
    mockSocketHandlers.messages_read({ conversationId: 'conversation-1', readerId: 'buyer-1' });
  });
  expect(await screen.findByLabelText('Seen by recipient')).toBeInTheDocument();
});

test('keeps realtime messages received while message history is loading', async () => {
  Object.keys(mockSocketHandlers).forEach((key) => delete mockSocketHandlers[key]);
  let resolveMessageHistory;
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
      return new Promise((resolve) => {
        resolveMessageHistory = resolve;
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );

  await waitFor(() => expect(mockSocketHandlers.receive_message).toBeDefined());
  act(() => {
    mockSocketHandlers.receive_message({
      _id: 'live-message',
      conversationId: 'conversation-1',
      sender: 'buyer-1',
      text: 'A new realtime message',
      readBy: [],
      createdAt: '2026-10-09T00:00:02.000Z',
    });
  });

  await act(async () => {
    resolveMessageHistory({
      data: [{
        _id: 'history-message',
        conversationId: 'conversation-1',
        sender: 'buyer-1',
        text: 'An older message from history',
        readBy: [],
        createdAt: '2026-10-09T00:00:01.000Z',
      }],
    });
  });

  expect(await screen.findByText('An older message from history')).toBeInTheDocument();
  expect(screen.getByText('A new realtime message')).toBeInTheDocument();
});

test('orders realtime messages by creation time when socket events arrive out of order', async () => {
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );
  await screen.findByRole('textbox', { name: 'Message' });

  act(() => {
    mockSocketHandlers.receive_message({
      _id: 'later-message',
      conversationId: 'conversation-1',
      sender: 'buyer-1',
      text: 'Later message',
      readBy: [],
      createdAt: '2026-10-09T00:00:02.000Z',
    });
    mockSocketHandlers.receive_message({
      _id: 'earlier-message',
      conversationId: 'conversation-1',
      sender: 'buyer-1',
      text: 'Earlier message',
      readBy: [],
      createdAt: '2026-10-09T00:00:01.000Z',
    });
  });

  const messageTexts = screen.getAllByText(/^(Earlier|Later) message$/).map((node) => node.textContent);
  expect(messageTexts).toEqual(['Earlier message', 'Later message']);
});

test('keeps the message draft and reports a failed send acknowledgement', async () => {
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );

  const messageInput = await screen.findByRole('textbox', { name: 'Message' });
  fireEvent.change(messageInput, { target: { value: 'Is this still available?' } });
  mockSocket.emit.mockImplementation((event, _payload, acknowledge) => {
    if (event === 'send_message') acknowledge(null, { error: 'Failed to send message.' });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to send message.');
  expect(messageInput).toHaveValue('Is this still available?');
});

test('clears a transient connection error after the socket reconnects', async () => {
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
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );

  await screen.findByRole('textbox', { name: 'Message' });
  act(() => mockSocketHandlers.connect_error());
  expect(await screen.findByRole('alert')).toHaveTextContent(/chat connection failed/i);

  act(() => mockSocketHandlers.connect());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('labels conversations whose listing was deleted', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/chat/conversations')) {
      return Promise.resolve({
        data: [{
          _id: 'conversation-removed',
          members: [
            { _id: 'buyer-1', name: 'Buyer' },
            { _id: 'seller-1', name: 'Seller' },
          ],
          itemId: null,
          lastMessage: 'Still available?',
        }],
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(
    <ChatModal
      currentUser={{ _id: 'seller-1' }}
      token="test-token"
      onUnreadCountChange={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(await screen.findByText('Listing removed')).toBeInTheDocument();
});
