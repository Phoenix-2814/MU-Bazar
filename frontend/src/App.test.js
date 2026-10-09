import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';

const mockSocketHandlers = {};

jest.mock('axios');
jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: () => ({
    on: (event, handler) => {
      mockSocketHandlers[event] = handler;
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connected: false,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  Object.keys(mockSocketHandlers).forEach((event) => delete mockSocketHandlers[event]);
});

test('renders the HostelBazar marketplace', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(<App />);
  expect(screen.getByRole('heading', { name: /mu bazar/i })).toBeInTheDocument();
  expect(await screen.findByText(/no listings match your search/i)).toBeInTheDocument();
});

test('shows public listings without requiring a login', async () => {
  axios.get.mockResolvedValue({
    data: [
      {
        _id: 'public-listing',
        title: 'Public listing',
        description: 'Available to all visitors',
        price: 100,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
    ],
  });

  render(<App />);

  expect(await screen.findByText('Public listing')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/api\/items$/));
  expect(localStorage.getItem('token')).toBeNull();
});

test('search matches multiple terms across listing details and seller, ignoring case and extra spaces', async () => {
  axios.get.mockResolvedValue({
    data: [
      {
        _id: 'chemistry-book',
        title: 'Organic Chemistry Textbook',
        description: 'Used for first year studies',
        price: 150,
        category: 'BOOKS',
        condition: 'USED_LIKE_NEW',
        images: [],
        isSold: false,
        seller: { name: 'Krishna Bhaskar', residencyType: 'outsider' },
      },
      {
        _id: 'calculator',
        title: 'Scientific Calculator',
        description: 'Great condition',
        price: 300,
        category: 'ELECTRONICS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Riya Shah', residencyType: 'hosteler' },
      },
    ],
  });

  render(<App />);
  const search = screen.getByRole('textbox', { name: 'Search listings' });
  fireEvent.change(search, { target: { value: '  CHEMISTRY   krishna  ' } });

  expect(await screen.findByText('Organic Chemistry Textbook')).toBeInTheDocument();
  expect(screen.queryByText('Scientific Calculator')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Search Results' })).toBeInTheDocument();
});

test('category filters expose their selected state and can be cleared when no listings match', async () => {
  axios.get.mockResolvedValue({
    data: [{
      _id: 'book-listing',
      title: 'Organic Chemistry Textbook',
      description: 'First year book',
      price: 150,
      category: 'BOOKS',
      condition: 'USED_GOOD',
      images: [],
      isSold: false,
      seller: { name: 'Seller', residencyType: 'outsider' },
    }],
  });

  render(<App />);
  const booksButton = screen.getByRole('button', { name: 'Books & Notes' });
  fireEvent.click(booksButton);
  expect(booksButton).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'Books & Notes Listings' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Electronics' }));
  expect(await screen.findByText(/no listings match your search/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and category filters' }));

  expect(await screen.findByText('Organic Chemistry Textbook')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All Items' })).toHaveAttribute('aria-pressed', 'true');
});

test('sorts matching listings by newest and price in either direction', async () => {
  axios.get.mockResolvedValue({
    data: [
      {
        _id: 'middle-listing',
        title: 'Middle price',
        description: 'Listing',
        price: 200,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        createdAt: '2026-10-08T12:00:00.000Z',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
      {
        _id: 'cheap-listing',
        title: 'Lowest price',
        description: 'Listing',
        price: 100,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        createdAt: '2026-10-07T12:00:00.000Z',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
      {
        _id: 'new-listing',
        title: 'Newest listing',
        description: 'Listing',
        price: 300,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        createdAt: '2026-10-09T12:00:00.000Z',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
    ],
  });

  render(<App />);
  await screen.findByText('Newest listing');
  const listingTitles = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  const sortSelect = screen.getByRole('combobox', { name: 'Sort by' });

  expect(listingTitles()).toEqual(['Newest listing', 'Middle price', 'Lowest price']);
  fireEvent.change(sortSelect, { target: { value: 'price-low' } });
  expect(listingTitles()).toEqual(['Lowest price', 'Middle price', 'Newest listing']);
  fireEvent.change(sortSelect, { target: { value: 'price-high' } });
  expect(listingTitles()).toEqual(['Newest listing', 'Middle price', 'Lowest price']);
});

test('shows and saves a notification when an incoming chat message increases unread count', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'buyer-id', name: 'Buyer' }));
  localStorage.setItem('token', 'buyer-token');
  axios.post.mockResolvedValue({ data: { unreadCount: 0 } });
  axios.patch.mockResolvedValue({ data: { unreadCount: 0 } });
  let unreadRequests = 0;
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/chat/unread-count')) {
      unreadRequests += 1;
      return Promise.resolve({ data: { unreadCount: unreadRequests === 1 ? 0 : 1 } });
    }
    if (url.endsWith('/api/reports/admin/access')) {
      return Promise.resolve({ data: { isAdmin: false } });
    }
    return Promise.resolve({ data: [] });
  });

  render(<App />);
  await waitFor(() => expect(mockSocketHandlers.user_message).toEqual(expect.any(Function)));
  act(() => {
    mockSocketHandlers.user_message({
      conversationId: 'conversation-id',
      messageId: 'message-id',
    });
  });

  const notificationButton = await screen.findByRole('button', {
    name: 'Notifications, 1 unread',
  });
  fireEvent.click(notificationButton);
  const messageNotification = await screen.findByRole('button', {
    name: /new message you received a new message/i,
  });
  fireEvent.click(messageNotification);

  await waitFor(() => expect(localStorage.getItem('mubazar-notifications')).toContain('conversation-id'));
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-expanded', 'false');
});

test('detects new listings on return to the page and offers browser notification permission', async () => {
  const initialListing = {
    _id: 'existing-listing',
    title: 'Existing book',
    description: 'Old listing',
    price: 100,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    seller: { name: 'Seller', residencyType: 'outsider' },
  };
  const newListing = {
    ...initialListing,
    _id: 'new-listing',
    title: 'New calculator',
    description: 'Just posted',
    price: 250,
    category: 'ELECTRONICS',
  };
  let listingsRequests = 0;
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/items')) {
      listingsRequests += 1;
      return Promise.resolve({ data: listingsRequests === 1 ? [initialListing] : [newListing, initialListing] });
    }
    return Promise.resolve({ data: [] });
  });
  const requestPermission = jest.fn().mockResolvedValue('granted');
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: class MockNotification {
      static permission = 'default';
      static requestPermission = requestPermission;
    },
  });

  render(<App />);
  await screen.findByText('Existing book');
  fireEvent.focus(window);

  const notificationButton = await screen.findByRole('button', {
    name: 'Notifications, 1 unread',
  });
  fireEvent.click(notificationButton);
  expect(await screen.findByText('New calculator · ₹250')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable browser alerts' }));
  await waitFor(() => expect(requestPermission).toHaveBeenCalled());
});

test('shows the messages dot when the signed-in user has unread messages', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'seller-id', name: 'Seller' }));
  localStorage.setItem('token', 'seller-token');
  axios.get.mockImplementation((url) => (
    url.endsWith('/api/chat/unread-count')
      ? Promise.resolve({ data: { unreadCount: 1 } })
      : Promise.resolve({ data: [] })
  ));

  render(<App />);

  expect(await screen.findByLabelText('You have unread messages')).toBeInTheDocument();
});

test('opens profile details in the page instead of a popup', async () => {
  localStorage.setItem('user', JSON.stringify({
    _id: 'profile-user',
    name: 'Profile Student',
    email: 'student@marwadiuniversity.ac.in',
    phone: '9876543210',
    residencyType: 'outsider',
  }));
  localStorage.setItem('token', 'profile-token');
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/reports/admin/access')) {
      return Promise.resolve({ data: { isAdmin: false } });
    }
    return Promise.resolve({ data: [] });
  });

  render(<App />);
  const profileName = await screen.findByText('Profile Student');
  expect(profileName.closest('.nav-actions')).not.toBeInTheDocument();
  fireEvent.click(profileName);

  expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
  expect(screen.getByText('student@marwadiuniversity.ac.in')).toBeInTheDocument();
  expect(screen.getByText('9876543210')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('closes registration and prominently confirms verification email was sent', async () => {
  axios.get.mockResolvedValue({ data: [] });
  axios.post.mockResolvedValue({
    data: { message: 'Account created. Check your MU email for a verification link before logging in.' },
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /login \/ register/i }));
  fireEvent.click(screen.getByText('Register here'));

  fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'Test Student' } });
  fireEvent.change(screen.getByPlaceholderText('Phone'), { target: { value: '1234567890' } });
  fireEvent.change(screen.getByPlaceholderText('Hostel Name'), { target: { value: 'Test Hostel' } });
  fireEvent.change(screen.getByPlaceholderText('Hostel Block'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Room Number'), { target: { value: '101' } });
  fireEvent.change(screen.getByPlaceholderText('MU email (@marwadiuniversity.ac.in)'), {
    target: { value: 'student@marwadiuniversity.ac.in' },
  });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));

  const statusMessage = await screen.findByRole('status');
  expect(statusMessage).toHaveTextContent(/check your mu email/i);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Register' })).not.toBeInTheDocument());
});

test('closes registration and shows the resend cooldown outside the modal', async () => {
  axios.get.mockResolvedValue({ data: [] });
  axios.post.mockRejectedValue({
    response: {
      status: 429,
      data: { message: 'A verification email was sent recently. Please wait one minute before requesting another.' },
    },
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /login \/ register/i }));
  fireEvent.click(screen.getByText('Register here'));

  fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'Test Student' } });
  fireEvent.change(screen.getByPlaceholderText('Phone'), { target: { value: '1234567890' } });
  fireEvent.change(screen.getByPlaceholderText('Hostel Name'), { target: { value: 'Test Hostel' } });
  fireEvent.change(screen.getByPlaceholderText('Hostel Block'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Room Number'), { target: { value: '101' } });
  fireEvent.change(screen.getByPlaceholderText('MU email (@marwadiuniversity.ac.in)'), {
    target: { value: 'student@marwadiuniversity.ac.in' },
  });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));

  const statusMessage = await screen.findByRole('status');
  expect(statusMessage).toHaveTextContent(/wait one minute/i);
  await waitFor(() => expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument());
});
