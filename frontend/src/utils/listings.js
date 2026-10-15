import { MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../config';

export const normalizeSearchText = (value) => String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');

export const validPriceFilter = (value) => {
  if (value === '') return '';
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 500000 ? String(price) : '';
};

export const getListingParamsKey = ({ searchQuery, selectedCategory, minimumPrice, maximumPrice, listingSort }) => {
  let minPrice = validPriceFilter(minimumPrice);
  let maxPrice = validPriceFilter(maximumPrice);
  if (minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice)) {
    minPrice = '';
    maxPrice = '';
  }
  return JSON.stringify({
    q: normalizeSearchText(searchQuery),
    category: selectedCategory,
    minPrice,
    maxPrice,
    sort: listingSort,
  });
};

export const DEFAULT_LISTING_PARAMS_KEY = getListingParamsKey({
  searchQuery: '',
  selectedCategory: 'ALL',
  minimumPrice: '',
  maximumPrice: '',
  listingSort: 'newest',
});

export const validateListingForm = ({ title, description, price, category, condition }) => {
  const cleanTitle = String(title || '').trim();
  const cleanDescription = String(description || '').trim();
  const numericPrice = Number(price);
  const validCategories = new Set(['BOOKS', 'ELECTRONICS', 'CLOTHING', 'HOSTEL_ESSENTIALS', 'OTHER']);
  const validConditions = new Set(['NEW', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR']);

  if (cleanTitle.length < 3) {
    return 'Title must be at least 3 characters long.';
  }
  if (cleanTitle.length > MAX_LISTING_TITLE_LENGTH) {
    return `Title must be ${MAX_LISTING_TITLE_LENGTH} characters or fewer.`;
  }

  if (cleanDescription.length < 10) {
    return 'Description must be at least 10 characters long.';
  }
  if (cleanDescription.length > MAX_LISTING_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_LISTING_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 500000) {
    return 'Price must be a positive number under ₹5,00,000.';
  }

  if (!validCategories.has(category)) {
    return 'Please choose a valid product category.';
  }

  if (!validConditions.has(condition)) {
    return 'Please choose a valid item condition.';
  }

  return '';
};
