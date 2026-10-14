import { vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AdminReports from './AdminReports';

vi.mock('axios');

test('lets an admin resolve a report with a review note', async () => {
  axios.get.mockResolvedValue({
    data: [{
      _id: 'report-1',
      listing: {
        _id: 'listing-1',
        title: 'Suspicious listing',
        price: 300,
        isHidden: false,
        seller: {
          name: 'Seller',
          email: 'seller@example.com',
          phone: '9876543210',
          residencyType: 'hosteler',
          hostelName: 'MU Hostel',
          hostelBlock: 'B',
          roomNumber: '204',
        },
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
      listing: { _id: 'listing-1', title: 'Suspicious listing', price: 300, isHidden: false },
      reporter: { name: 'Buyer', email: 'buyer@example.com' },
      reason: 'scam',
      status: 'resolved',
      adminNote: 'Listing reviewed.',
      reviewedBy: { name: 'Admin' },
    },
  });

  render(<AdminReports token="admin-token" />);

  expect(await screen.findByText('Suspicious listing')).toBeInTheDocument();
  expect(screen.getByText('Seller email')).toBeInTheDocument();
  expect(screen.getByText('seller@example.com')).toBeInTheDocument();
  expect(screen.getByText('9876543210')).toBeInTheDocument();
  expect(screen.getByText('MU Hostel · Block B · Room 204')).toBeInTheDocument();
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

test('lets an admin hide and restore a reported listing', async () => {
  const listing = { _id: 'listing-1', title: 'Reported book', price: 200, isHidden: false };
  axios.get.mockResolvedValue({
    data: [{
      _id: 'report-2',
      listing,
      reporter: { name: 'Buyer', email: 'buyer@example.com' },
      reason: 'misleading',
      status: 'open',
      adminNote: '',
      createdAt: '2026-10-09T00:00:00.000Z',
    }],
  });
  axios.patch.mockResolvedValueOnce({
    data: { listing: { ...listing, isHidden: true } },
  }).mockResolvedValueOnce({
    data: { listing: { ...listing, isHidden: false } },
  });

  render(<AdminReports token="admin-token" />);

  expect(await screen.findByRole('switch', { name: 'Listing visibility: visible' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Listing visibility: visible' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/listings\/listing-1\/visibility$/),
    { isHidden: true },
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
  expect(await screen.findByRole('switch', { name: 'Listing visibility: hidden' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('switch', { name: 'Listing visibility: hidden' }));
  await waitFor(() => expect(axios.patch).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/reports\/admin\/listings\/listing-1\/visibility$/),
    { isHidden: false },
    { headers: { Authorization: 'Bearer admin-token' } }
  ));
  expect(await screen.findByRole('switch', { name: 'Listing visibility: visible' })).toBeInTheDocument();
});

test('filters the moderation queue by report status and shows status counts', async () => {
  axios.get.mockResolvedValue({
    data: [
      {
        _id: 'open-report',
        listing: { _id: 'open-listing', title: 'Open report item', price: 100, isHidden: false },
        reporter: { name: 'Buyer' },
        reason: 'other',
        status: 'open',
        createdAt: '2026-10-09T00:00:00.000Z',
      },
      {
        _id: 'resolved-report',
        listing: { _id: 'resolved-listing', title: 'Resolved report item', price: 200, isHidden: false },
        reporter: { name: 'Buyer' },
        reason: 'misleading',
        status: 'resolved',
        createdAt: '2026-10-08T00:00:00.000Z',
      },
    ],
  });

  render(<AdminReports token="admin-token" />);

  expect(await screen.findByText('Open report item')).toBeInTheDocument();
  expect(await screen.findByText('Resolved report item')).toBeInTheDocument();
  const resolvedFilter = screen.getByRole('button', { name: 'Resolved 1' });
  fireEvent.click(resolvedFilter);

  expect(resolvedFilter).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('Resolved report item')).toBeInTheDocument();
  expect(screen.queryByText('Open report item')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Dismissed 0' }));
  expect(await screen.findByText('There are no dismissed reports.')).toBeInTheDocument();
});

test('paginates report results while using server-wide status counts', async () => {
  const makeReport = (id, title) => ({
    _id: id,
    listing: { _id: `${id}-listing`, title, price: 100, isHidden: false },
    reporter: { name: 'Buyer' },
    reason: 'other',
    status: 'open',
    createdAt: '2026-10-09T00:00:00.000Z',
  });
  const pagination = { pageSize: 50, total: 51, totalPages: 2 };
  const counts = { all: 51, open: 40, resolved: 8, dismissed: 3 };
  axios.get
    .mockResolvedValueOnce({
      data: { reports: [makeReport('report-1', 'First page report')], pagination: { ...pagination, page: 1 }, counts },
    })
    .mockResolvedValueOnce({
      data: { reports: [makeReport('report-51', 'Second page report')], pagination: { ...pagination, page: 2 }, counts },
    });

  render(<AdminReports token="admin-token" />);

  expect(await screen.findByText('First page report')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open 40' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  expect(await screen.findByText('Second page report')).toBeInTheDocument();
  expect(screen.queryByText('First page report')).not.toBeInTheDocument();
  expect(screen.getByText('Page 2 of 2 · 51 reports')).toBeInTheDocument();
  expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/reports\/admin$/),
    expect.objectContaining({
      params: { page: 2, status: 'all' },
    })
  );
});

test('ignores stale report responses when admins change filters quickly', async () => {
  const makeReport = (id, title, status) => ({
    _id: id,
    listing: { _id: `${id}-listing`, title, price: 100, isHidden: false },
    reporter: { name: 'Buyer' },
    reason: 'other',
    status,
    createdAt: '2026-10-09T00:00:00.000Z',
  });
  const counts = { all: 2, open: 1, resolved: 1, dismissed: 0 };
  const pagination = { page: 1, pageSize: 50, total: 2, totalPages: 1 };
  const pendingRequests = [];
  axios.get.mockImplementation(() => new Promise((resolve) => pendingRequests.push(resolve)));

  render(<AdminReports token="admin-token" />);
  await waitFor(() => expect(pendingRequests).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Open 0' }));
  await waitFor(() => expect(pendingRequests).toHaveLength(2));

  await act(async () => {
    pendingRequests[1]({
      data: {
        reports: [makeReport('open-report', 'Current open report', 'open')],
        pagination,
        counts,
      },
    });
  });
  expect(await screen.findByText('Current open report')).toBeInTheDocument();

  await act(async () => {
    pendingRequests[0]({
      data: {
        reports: [makeReport('old-report', 'Stale all-reports result', 'resolved')],
        pagination,
        counts,
      },
    });
  });

  expect(screen.getByText('Current open report')).toBeInTheDocument();
  expect(screen.queryByText('Stale all-reports result')).not.toBeInTheDocument();
});
