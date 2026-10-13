import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareModal from './components/ShareModal';

const sampleItem = {
  _id: '661a1b2c3d4e5f6789012345',
  title: 'Engineering Mathematics Textbook',
  price: 350,
  images: ['https://ik.imagekit.io/sample/book.jpg'],
};

describe('ShareModal component', () => {
  test('renders the share modal with item info and shareable link', () => {
    const handleClose = jest.fn();
    render(<ShareModal item={sampleItem} onClose={handleClose} isNewPost={false} />);

    expect(screen.getByRole('heading', { name: /share this product/i })).toBeInTheDocument();
    expect(screen.getByText('Engineering Mathematics Textbook')).toBeInTheDocument();
    expect(screen.getByText('₹350')).toBeInTheDocument();

    const input = screen.getByLabelText(/product shareable link/i);
    expect(input).toBeInTheDocument();
    expect(input.value).toContain(`/item/${sampleItem._id}`);

    const whatsappLink = screen.getByRole('link', { name: /share on whatsapp/i });
    expect(whatsappLink).toBeInTheDocument();
    expect(whatsappLink.getAttribute('href')).toContain('whatsapp.com');
    expect(whatsappLink.getAttribute('href')).toContain(encodeURIComponent(sampleItem.title));
  });

  test('displays congratulatory message when shown right after posting a new product', () => {
    const handleClose = jest.fn();
    render(<ShareModal item={sampleItem} onClose={handleClose} isNewPost={true} />);

    expect(screen.getByRole('heading', { name: /your product is live!/i })).toBeInTheDocument();
    expect(screen.getByText(/your listing has been posted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  test('calls onClose when close cross button or done button is clicked', () => {
    const handleClose = jest.fn();
    render(<ShareModal item={sampleItem} onClose={handleClose} isNewPost={true} />);

    fireEvent.click(screen.getByLabelText(/close share popup/i));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  test('copies link when copy button is clicked', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    render(<ShareModal item={sampleItem} onClose={jest.fn()} isNewPost={false} />);

    const copyBtn = screen.getByRole('button', { name: /copy link/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(`/item/${sampleItem._id}`)
    );
    expect(await screen.findByText(/copied!/i)).toBeInTheDocument();
  });
});

