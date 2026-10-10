import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';
import compressImage from './utils/compressImage';

const mockSocketHandlers = {};

jest.mock('axios');
jest.mock('./utils/compressImage', () => jest.fn((file) => Promise.resolve(file)));
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

test('loads the marketplace when saved user data is malformed', async () => {
  localStorage.setItem('user', '{invalid json');
  axios.get.mockResolvedValue({ data: [] });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);

  expect(screen.getByRole('heading', { name: /mu bazar/i })).toBeInTheDocument();
  expect(await screen.findByText(/no listings match your search/i)).toBeInTheDocument();
  expect(errorSpy).toHaveBeenCalledWith('Failed to load saved session:', expect.any(SyntaxError));
});

test('loads the marketplace if browser storage is unavailable', async () => {
  const originalGetItem = Storage.prototype.getItem;
  const storageSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === 'token') throw new Error('Storage is unavailable');
    return originalGetItem.call(this, key);
  });
  axios.get.mockResolvedValue({ data: [] });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  storageSpy.mockRestore();

  expect(screen.getByRole('heading', { name: /mu bazar/i })).toBeInTheDocument();
  expect(await screen.findByText(/no listings match your search/i)).toBeInTheDocument();
  expect(errorSpy).toHaveBeenCalledWith('Failed to load saved session:', expect.any(Error));
});

test('keeps a successful login when browser storage rejects session writes', async () => {
  axios.get.mockResolvedValue({ data: [] });
  axios.post.mockResolvedValue({
    data: {
      user: { _id: 'signed-in-user', name: 'Signed In Student' },
      token: 'valid-token',
    },
  });
  const originalSetItem = Storage.prototype.setItem;
  const storageSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
    if (key === 'user' || key === 'token') throw new Error('Storage quota exceeded');
    return originalSetItem.call(this, key, value);
  });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /login \/ register/i }));
  fireEvent.change(screen.getByPlaceholderText('Email'), {
    target: { value: 'student@marwadiuniversity.ac.in' },
  });
  fireEvent.change(screen.getByPlaceholderText('Password'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByRole('button', { name: /\+ sell item/i })).toBeInTheDocument();
  expect(screen.queryByText(/authentication failed/i)).not.toBeInTheDocument();
  expect(errorSpy).toHaveBeenCalledWith(
    'Failed to save session to browser storage:',
    expect.any(Error)
  );
  storageSpy.mockRestore();
});

test('announces listing loading accessibly and shows responsive loading placeholders', () => {
  axios.get.mockReturnValue(new Promise(() => {}));

  render(<App />);

  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Loading listings...')).toBeInTheDocument();
  expect(document.querySelectorAll('.listing-skeleton-card')).toHaveLength(6);
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
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/items$/),
    { timeout: 15000 }
  );
  expect(localStorage.getItem('token')).toBeNull();
});

test('renders every listing when the feed contains more than six items', async () => {
  const listings = Array.from({ length: 8 }, (_, index) => ({
    _id: `listing-${index + 1}`,
    title: `Listing ${index + 1}`,
    description: 'Available to all visitors',
    price: 100 + index,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    seller: { name: 'Seller', residencyType: 'outsider' },
  }));
  axios.get.mockResolvedValue({ data: listings });

  render(<App />);

  expect(await screen.findByText('Listing 8')).toBeInTheDocument();
  expect(document.querySelectorAll('.items-grid .item-card')).toHaveLength(8);
});

test('shows a clear timeout message and retry option when listings take too long', async () => {
  axios.get.mockRejectedValueOnce({
    code: 'ECONNABORTED',
    message: 'timeout of 15000ms exceeded',
  });

  render(<App />);

  expect(await screen.findByText(
    'Loading listings took too long. Please check your connection and try again.'
  )).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

test('shows an accessible fallback if a listing image fails to load', async () => {
  axios.get.mockResolvedValue({
    data: [{
      _id: 'broken-image-listing',
      title: 'Listing with missing image',
      description: 'Image URL is no longer available',
      price: 100,
      category: 'BOOKS',
      condition: 'USED_GOOD',
      images: ['https://images.example/missing-book.jpg'],
      isSold: false,
      seller: { name: 'Seller', residencyType: 'outsider' },
    }],
  });

  render(<App />);
  const listingImage = await screen.findByRole('img', { name: 'Listing with missing image (1 of 1)' });
  fireEvent.error(listingImage);

  expect(screen.getByRole('img', { name: 'Listing with missing image: image unavailable' }))
    .toHaveTextContent('Image unavailable');
});

test('allows buyers to browse all listing photos with accessible controls', async () => {
  axios.get.mockResolvedValue({
    data: [{
      _id: 'gallery-listing',
      title: 'Listing photo gallery',
      description: 'Several photos show the item clearly',
      price: 100,
      category: 'BOOKS',
      condition: 'USED_GOOD',
      images: [
        'https://images.example/front.jpg',
        'https://images.example/back.jpg',
        'https://images.example/inside.jpg',
      ],
      isSold: false,
      seller: { name: 'Seller', residencyType: 'outsider' },
    }],
  });

  render(<App />);
  const firstPhoto = await screen.findByRole('img', {
    name: 'Listing photo gallery (1 of 3)',
  });
  expect(firstPhoto).toHaveAttribute('src', 'https://images.example/front.jpg');

  fireEvent.click(screen.getByRole('button', { name: 'Next photo of Listing photo gallery' }));
  expect(screen.getByRole('img', { name: 'Listing photo gallery (2 of 3)' }))
    .toHaveAttribute('src', 'https://images.example/back.jpg');

  fireEvent.click(screen.getByRole('button', { name: 'Previous photo of Listing photo gallery' }));
  const firstPhotoAgain = screen.getByRole('img', { name: 'Listing photo gallery (1 of 3)' });
  expect(firstPhotoAgain).toHaveAttribute('src', 'https://images.example/front.jpg');
  fireEvent.error(firstPhotoAgain);

  expect(screen.getByRole('img', { name: 'Listing photo gallery: image unavailable' }))
    .toHaveTextContent('Image unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Next photo of Listing photo gallery' }));
  expect(screen.getByRole('img', { name: 'Listing photo gallery (2 of 3)' }))
    .toHaveAttribute('src', 'https://images.example/back.jpg');
});

test('resets the photo carousel when a listing image set changes after refresh', async () => {
  const listing = {
    _id: 'refreshed-gallery-listing',
    title: 'Refreshed photo gallery',
    description: 'The image set can change after a listing is edited',
    price: 100,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: ['https://images.example/front.jpg', 'https://images.example/back.jpg'],
    isSold: false,
    seller: { name: 'Seller', residencyType: 'outsider' },
  };
  axios.get
    .mockResolvedValueOnce({ data: [listing] })
    .mockResolvedValueOnce({
      data: [{
        ...listing,
        images: ['https://images.example/updated.jpg'],
      }],
    });

  render(<App />);
  expect(await screen.findByRole('img', {
    name: 'Refreshed photo gallery (1 of 2)',
  })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next photo of Refreshed photo gallery' }));
  expect(screen.getByRole('img', {
    name: 'Refreshed photo gallery (2 of 2)',
  })).toBeInTheDocument();

  fireEvent.focus(window);

  expect(await screen.findByRole('img', {
    name: 'Refreshed photo gallery (1 of 1)',
  })).toHaveAttribute('src', 'https://images.example/updated.jpg');
});

test('expands and collapses long listing descriptions on request', async () => {
  const fullDescription = 'This listing has a detailed description with condition, included accessories, and pickup details. '.repeat(2);
  axios.get.mockResolvedValue({
    data: [{
      _id: 'long-description-listing',
      title: 'Detailed listing',
      description: fullDescription,
      price: 100,
      category: 'BOOKS',
      condition: 'USED_GOOD',
      images: [],
      isSold: false,
      seller: { name: 'Seller', residencyType: 'outsider' },
    }],
  });

  render(<App />);
  const toggle = await screen.findByRole('button', { name: 'Read full description' });
  const description = toggle.parentElement.querySelector('.description');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(description).toHaveTextContent(fullDescription.trim());

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(description).toHaveClass('description-expanded');

  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.getByRole('button', { name: 'Read full description' }))
    .toHaveAttribute('aria-expanded', 'false');
});

test('keeps loaded listings visible when a background refresh fails and allows retry', async () => {
  const listing = {
    _id: 'cached-listing',
    title: 'Cached listing',
    description: 'Still available while refresh runs',
    price: 100,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    seller: { name: 'Seller', residencyType: 'outsider' },
  };
  axios.get
    .mockResolvedValueOnce({ data: [listing] })
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ data: [listing] });

  render(<App />);
  expect(await screen.findByText('Cached listing')).toBeInTheDocument();

  fireEvent.focus(window);
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not load listings/i);
  expect(screen.getByText('Cached listing')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('Cached listing')).toBeInTheDocument();
});

test('ignores stale listing responses when refresh requests finish out of order', async () => {
  const makeListing = (id, title) => ({
    _id: id,
    title,
    description: 'This listing response should remain consistent',
    price: 100,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    seller: { name: 'Seller', residencyType: 'outsider' },
  });
  const pendingRequests = [];
  axios.get.mockImplementation(() => new Promise((resolve) => pendingRequests.push(resolve)));

  render(<App />);
  await waitFor(() => expect(pendingRequests).toHaveLength(1));
  fireEvent.focus(window);
  await waitFor(() => expect(pendingRequests).toHaveLength(2));

  await act(async () => {
    pendingRequests[1]({ data: [makeListing('latest', 'Latest listing')] });
  });
  expect(await screen.findByText('Latest listing')).toBeInTheDocument();

  await act(async () => {
    pendingRequests[0]({ data: [makeListing('stale', 'Stale listing')] });
  });
  expect(screen.getByText('Latest listing')).toBeInTheDocument();
  expect(screen.queryByText('Stale listing')).not.toBeInTheDocument();
});

test('clears initial loading when a newer background refresh completes first', async () => {
  const pendingRequests = [];
  axios.get.mockImplementation(() => new Promise((resolve) => pendingRequests.push(resolve)));

  render(<App />);
  await waitFor(() => expect(pendingRequests).toHaveLength(1));
  fireEvent.focus(window);
  await waitFor(() => expect(pendingRequests).toHaveLength(2));

  await act(async () => {
    pendingRequests[1]({ data: [] });
  });

  expect(screen.queryByText('Loading listings...')).not.toBeInTheDocument();
  expect(screen.getByText(/no listings match your search/i)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Clear marketplace filters' }));

  expect(await screen.findByText('Organic Chemistry Textbook')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All Items' })).toHaveAttribute('aria-pressed', 'true');
});

test('dark mode toggle applies the saved theme and persists changes', async () => {
  localStorage.setItem('mubazar-theme', 'dark');
  axios.get.mockResolvedValue({ data: [] });

  render(<App />);

  const themeToggle = screen.getByRole('switch', { name: 'Dark mode' });
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
  expect(themeToggle).toHaveAttribute('aria-checked', 'true');
  expect(localStorage.getItem('mubazar-theme')).toBe('dark');

  fireEvent.click(themeToggle);

  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
  expect(themeToggle).toHaveAttribute('aria-checked', 'false');
  expect(localStorage.getItem('mubazar-theme')).toBe('light');
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

test('filters marketplace listings by minimum and maximum price and clears those filters', async () => {
  axios.get.mockResolvedValue({
    data: [
      {
        _id: 'low-item',
        title: 'Low priced book',
        description: 'Affordable book',
        price: 100,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
      {
        _id: 'mid-item',
        title: 'Mid priced book',
        description: 'Average book',
        price: 300,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
      {
        _id: 'high-item',
        title: 'High priced book',
        description: 'Premium book',
        price: 700,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Seller', residencyType: 'outsider' },
      },
    ],
  });

  render(<App />);
  await screen.findByText('Mid priced book');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), {
    target: { value: '600' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum price' }), {
    target: { value: '200' },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Minimum price cannot be greater than maximum price.'
  );
  expect(screen.queryByText('Mid priced book')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), {
    target: { value: '200' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum price' }), {
    target: { value: '500' },
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Mid priced book')).toBeInTheDocument();
  expect(screen.queryByText('Low priced book')).not.toBeInTheDocument();
  expect(screen.queryByText('High priced book')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear marketplace filters' }));
  expect(await screen.findByText('Low priced book')).toBeInTheDocument();
  expect(screen.getByText('High priced book')).toBeInTheDocument();
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

test('closes the notifications panel with Escape and restores focus to its trigger', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(<App />);

  const notificationButton = screen.getByRole('button', { name: 'Notifications' });
  fireEvent.click(notificationButton);
  expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  expect(notificationButton).toHaveAttribute('aria-expanded', 'false');
  expect(notificationButton).toHaveFocus();
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

test('shows product links and profile details in a dropdown from the profile control', async () => {
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
  const profileMenuButton = await screen.findByRole('button', {
    name: 'Profile menu for Profile Student',
  });
  expect(screen.queryByRole('button', { name: /my products/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /history/i })).not.toBeInTheDocument();
  fireEvent.click(profileMenuButton);

  expect(profileMenuButton).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('region', { name: 'Profile menu' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /my products/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'My Profile' })).toBeInTheDocument();
  expect(screen.queryByText('student@marwadiuniversity.ac.in')).not.toBeInTheDocument();
  expect(screen.queryByText('9876543210')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'My Profile' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'My Profile' }));
  expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
  expect(screen.getByText('student@marwadiuniversity.ac.in')).toBeInTheDocument();
  expect(screen.getByText('9876543210')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Profile menu for Profile Student' }));
  fireEvent.click(screen.getByRole('button', { name: /history/i }));
  expect(await screen.findByRole('heading', { name: 'Product History' })).toBeInTheDocument();
});

test('closes the profile dropdown with Escape and restores focus to the profile control', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'profile-user', name: 'Profile Student' }));
  localStorage.setItem('token', 'profile-token');
  axios.get.mockResolvedValue({ data: [] });

  render(<App />);
  const profileMenuButton = await screen.findByRole('button', {
    name: 'Profile menu for Profile Student',
  });
  fireEvent.click(profileMenuButton);
  expect(screen.getByRole('region', { name: 'Profile menu' })).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('region', { name: 'Profile menu' })).not.toBeInTheDocument();
  expect(profileMenuButton).toHaveAttribute('aria-expanded', 'false');
  expect(profileMenuButton).toHaveFocus();
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

  const statusMessage = await screen.findByText(/check your mu email/i);
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

  const statusMessage = await screen.findByText(/wait one minute/i);
  expect(statusMessage).toHaveTextContent(/wait one minute/i);
  await waitFor(() => expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument());
});

test('blocks invalid listing submissions before they reach the API', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'seller-1', name: 'Seller' }));
  localStorage.setItem('token', 'seller-token');
  axios.get.mockResolvedValue({ data: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /\+ sell item/i }));
  fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Bad' } });
  fireEvent.change(screen.getByPlaceholderText('Price (₹)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post Item' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Title must be at least 3 characters long.');
  expect(axios.post).not.toHaveBeenCalled();
});

test('enforces listing title and description length limits', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'seller-1', name: 'Seller' }));
  localStorage.setItem('token', 'seller-token');
  axios.get.mockResolvedValue({ data: [] });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /\+ sell item/i }));
  const titleInput = screen.getByPlaceholderText('Title');
  const descriptionInput = screen.getByPlaceholderText('Description');
  expect(titleInput).toHaveAttribute('maxLength', '120');
  expect(descriptionInput).toHaveAttribute('maxLength', '5000');

  fireEvent.change(titleInput, { target: { value: 'T'.repeat(121) } });
  fireEvent.change(descriptionInput, { target: { value: 'A valid description for an item.' } });
  fireEvent.change(screen.getByPlaceholderText('Price (₹)'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post Item' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Title must be 120 characters or fewer.');
  expect(axios.post).not.toHaveBeenCalled();
});

test('reports image processing failures and re-enables the post action', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'seller-1', name: 'Seller' }));
  localStorage.setItem('token', 'seller-token');
  axios.get.mockResolvedValue({ data: [] });
  compressImage.mockRejectedValue(new Error('Could not compress selected image.'));
  const image = new File(['image data'], 'book.png', { type: 'image/png' });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /\+ sell item/i }));
  fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'A good book' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'A useful book for study.' } });
  fireEvent.change(screen.getByPlaceholderText('Price (₹)'), { target: { value: '100' } });
  fireEvent.change(document.querySelector('input[type="file"][multiple]'), {
    target: { files: [image] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Post Item' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to post item: Could not compress selected image.'
  );
  expect(axios.post).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Post Item' })).toBeEnabled();
});

test('marks an owned product sold with an explicit desired status', async () => {
  localStorage.setItem('user', JSON.stringify({ _id: 'seller-1', name: 'Seller' }));
  localStorage.setItem('token', 'seller-token');
  const ownListing = {
    _id: 'owned-listing',
    title: 'Owned textbook',
    description: 'Still available to campus buyers',
    price: 200,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    seller: { _id: 'seller-1', name: 'Seller', residencyType: 'outsider' },
  };
  axios.get.mockImplementation((url) => (
    url.endsWith('/api/items/mine')
      ? Promise.resolve({ data: [ownListing] })
      : url.endsWith('/api/items')
        ? Promise.resolve({ data: [] })
        : Promise.resolve({ data: { unreadCount: 0 } })
  ));
  axios.patch.mockResolvedValue({ data: { isSold: true } });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu for Seller' }));
  fireEvent.click(screen.getByRole('button', { name: /My Products/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as Sold' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/items\/owned-listing\/sold$/),
    { isSold: true },
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: expect.stringMatching(/^Bearer /),
      }),
    })
  ));
});
