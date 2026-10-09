import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');
jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: () => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test('renders the HostelBazar marketplace', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(<App />);
  expect(screen.getByRole('heading', { name: /mu bazar/i })).toBeInTheDocument();
  expect(await screen.findByText(/no items found/i)).toBeInTheDocument();
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
    return Promise.resolve({
      data: [{
        _id: 'still-visible-listing',
        title: 'Marketplace remains visible',
        description: 'The current page should remain underneath the profile.',
        price: 100,
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: [],
        isSold: false,
        seller: { name: 'Another Seller', residencyType: 'outsider' },
      }],
    });
  });

  render(<App />);
  fireEvent.click(await screen.findByText('Profile Student'));

  expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
  expect(screen.getByText('student@marwadiuniversity.ac.in')).toBeInTheDocument();
  expect(screen.getByText('9876543210')).toBeInTheDocument();
  expect(screen.getByText('Marketplace remains visible')).toBeInTheDocument();
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
