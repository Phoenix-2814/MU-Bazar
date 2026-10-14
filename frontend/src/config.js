export const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');
export const LISTINGS_REQUEST_TIMEOUT_MS = 15000;
export const LISTINGS_PAGE_SIZE = 20;
export const MAX_LISTINGS_PAGE_SIZE = 100;
export const LISTING_FILTER_DEBOUNCE_MS = 300;
export const MAX_LISTING_TITLE_LENGTH = 120;
export const MAX_LISTING_DESCRIPTION_LENGTH = 5000;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const THEME_STORAGE_KEY = 'mubazar-theme';
export const CATEGORY_OPTIONS = [
  { key: 'ALL', label: 'All Items' },
  { key: 'BOOKS', label: 'Books & Notes' },
  { key: 'ELECTRONICS', label: 'Electronics' },
  { key: 'CLOTHING', label: 'Clothing' },
  { key: 'HOSTEL_ESSENTIALS', label: 'Hostel Essentials' },
  { key: 'OTHER', label: 'Others' },
];
export const NOTIFICATIONS_STORAGE_KEY = 'mubazar-notifications';
