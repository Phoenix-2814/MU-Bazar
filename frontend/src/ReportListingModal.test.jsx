import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ReportListingModal from './ReportListingModal';

vi.mock('axios');

test('submits a listing report with its selected reason and details', async () => {
  const onSubmitted = vi.fn();
  axios.post.mockResolvedValue({ data: { message: 'Report submitted.' } });

  render(
    <ReportListingModal
      listing={{ _id: 'listing-1', title: 'Test listing' }}
      token="test-token"
      onClose={vi.fn()}
      onSubmitted={onSubmitted}
    />
  );

  fireEvent.change(screen.getByLabelText('Why are you reporting this product?'), {
    target: { value: 'scam' },
  });
  fireEvent.change(screen.getByLabelText('Additional details (optional)'), {
    target: { value: 'The listing details seem suspicious.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/reports$/),
    {
      listingId: 'listing-1',
      reason: 'scam',
      details: 'The listing details seem suspicious.',
    },
    { headers: { Authorization: 'Bearer test-token' } }
  ));
  expect(onSubmitted).toHaveBeenCalledWith('Report submitted.');
});
