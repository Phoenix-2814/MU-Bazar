import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AdminUsers from './AdminUsers';

jest.mock('axios');

const userRecord = {
  _id: 'user-1',
  name: 'Campus Seller',
  email: 'seller@marwadiuniversity.ac.in',
  phone: '9876543210',
  residencyType: 'hosteler',
  hostelName: 'MU Hostel',
  hostelBlock: 'B',
  roomNumber: '204',
  emailVerified: true,
  isSuspended: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  listingCount: 3,
};

const userDetails = {
  user: userRecord,
  listings: [{
    _id: 'listing-1',
    title: 'Physics textbook',
    description: 'Useful book for students.',
    price: 250,
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: [],
    isSold: false,
    isHidden: false,
    createdAt: '2026-10-02T00:00:00.000Z',
  }],
  pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
};

const userListResponse = {
  users: [userRecord],
  pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1 },
  counts: { all: 1, new: 1, suspended: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('filters the user directory and ranks most active sellers', async () => {
  axios.get.mockResolvedValue({ data: userListResponse });

  render(<AdminUsers token="admin-token" />);
  expect(await screen.findByText('Campus Seller')).toBeInTheDocument();
  expect(screen.getByText('3 listings')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'New (30 days) 1' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/users$/),
    expect.objectContaining({
      params: { page: 1, status: 'new', search: '' },
    })
  ));

  fireEvent.click(screen.getByRole('button', { name: 'Most listings' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/users$/),
    expect.objectContaining({
      params: { page: 1, status: 'high-posted', search: '' },
    })
  ));
});

test('reviews a user profile and temporarily hides one of their listings', async () => {
  axios.get.mockImplementation((url) => {
    return url.endsWith('/user-1')
      ? Promise.resolve({ data: userDetails })
      : Promise.resolve({ data: userListResponse });
  });
  axios.patch.mockResolvedValue({ data: { message: 'Listing hidden.' } });

  render(<AdminUsers token="admin-token" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review profile' }));

  expect(await screen.findByText('MU Hostel · Block B · Room 204')).toBeInTheDocument();
  expect(screen.getByText('seller@marwadiuniversity.ac.in')).toBeInTheDocument();
  expect(screen.getByText('Physics textbook')).toBeInTheDocument();
  expect(screen.getByText('Total listings').nextElementSibling).toHaveTextContent('1');

  fireEvent.click(screen.getByRole('switch', { name: 'Listing visibility: visible' }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/listings\/listing-1\/visibility$/),
    { isHidden: true },
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
});

test('requires a suspension reason before suspending a user', async () => {
  axios.get.mockImplementation((url) => (
    url.endsWith('/user-1')
      ? Promise.resolve({ data: userDetails })
      : Promise.resolve({ data: userListResponse })
  ));
  axios.patch.mockResolvedValue({ data: { user: { ...userRecord, isSuspended: true } } });

  render(<AdminUsers token="admin-token" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review profile' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));

  const confirmButton = screen.getByRole('button', { name: 'Confirm suspension' });
  expect(confirmButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for suspension (required)'), {
    target: { value: 'Repeated fraudulent listings.' },
  });
  expect(confirmButton).toBeEnabled();
  fireEvent.click(confirmButton);

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/users\/user-1\/status$/),
    { isSuspended: true, reason: 'Repeated fraudulent listings.' },
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
});

test('confirms before permanently deleting a user listing', async () => {
  axios.get.mockImplementation((url) => (
    url.endsWith('/user-1')
      ? Promise.resolve({ data: userDetails })
      : Promise.resolve({ data: userListResponse })
  ));
  axios.delete.mockResolvedValue({ data: { message: 'Listing deleted.' } });
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  render(<AdminUsers token="admin-token" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review profile' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(
    'Permanently delete “Physics textbook”? This cannot be undone.'
  ));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/listings\/listing-1$/),
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
  confirmSpy.mockRestore();
});
