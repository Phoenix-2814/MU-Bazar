import { THEME_STORAGE_KEY } from '../config';

export const getSavedTheme = () => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    console.error('Failed to load saved theme:', err);
    return 'light';
  }
};

export const persistSession = (user, token) => {
  try {
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('sessionActivityAt', String(Date.now()));
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch (err) {
    console.error('Failed to save session to browser storage:', err);
  }
};

export const getSessionActivityAt = () => {
  try {
    const timestamp = Number(sessionStorage.getItem('sessionActivityAt'));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  } catch (err) {
    console.error('Failed to load session activity time:', err);
    return Date.now();
  }
};

export const persistSessionActivity = (timestamp = Date.now()) => {
  try {
    sessionStorage.setItem('sessionActivityAt', String(timestamp));
  } catch (err) {
    console.error('Failed to save session activity time:', err);
  }
};

export const removeStoredItem = (key) => {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    if (key === 'token') sessionStorage.removeItem('sessionActivityAt');
  } catch (err) {
    console.error(`Failed to remove ${key} from browser storage:`, err);
  }
};

export const getSavedSession = () => {
  try {
    const savedUser = sessionStorage.getItem('user');
    const savedToken = sessionStorage.getItem('token') || '';
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    if (!savedUser) return { user: null, token: '' };

    const parsedUser = JSON.parse(savedUser);
    if (parsedUser === null) return { user: null, token: '' };
    if (typeof parsedUser === 'object' && !Array.isArray(parsedUser)) {
      return { user: parsedUser, token: savedToken };
    }
    throw new Error('Saved user data must be an object.');
  } catch (err) {
    console.error('Failed to load saved session:', err);
    return { user: null, token: '' };
  }
};
