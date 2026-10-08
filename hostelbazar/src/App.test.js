import { render, screen } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

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
