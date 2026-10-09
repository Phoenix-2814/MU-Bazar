import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AdminReports from './AdminReports';

jest.mock('axios');

test('lets an admin resolve a report with a review note', async () => {
  axios.get.mockResolvedValue({
    data: [{
      _id: 'report-1',
      listing: {
        title: 'Suspicious listing',
        price: 300,
        seller: { name: 'Seller', email: 'seller@example.com' },
      },
      reporter: { name: 'Buyer', email: 'buyer@example.com' },
      reason: 'scam',
      details: 'Seller requested payment outside the app.',
      status: 'open',
      adminNote: '',
      createdAt: '2026-10-09T00:00:00.000Z',
    }],
  });
  axios.patch.mockResolvedValue({
    data: {
      _id: 'report-1',
      listing: { title: 'Suspicious listing', price: 300 },
      reporter: { name: 'Buyer', email: 'buyer@example.com' },
      reason: 'scam',
      status: 'resolved',
      adminNote: 'Listing reviewed.',
      reviewedBy: { name: 'Admin' },
    },
  });

  render(<AdminReports token="admin-token" />);

  expect(await screen.findByText('Suspicious listing')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Admin review note'), {
    target: { value: 'Listing reviewed.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/report-1$/),
    { status: 'resolved', adminNote: 'Listing reviewed.' },
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
  expect(await screen.findByText('Resolved by Admin: Listing reviewed.')).toBeInTheDocument();
});
