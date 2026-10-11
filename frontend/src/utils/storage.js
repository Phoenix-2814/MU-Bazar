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
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  } catch (err) {
    console.error('Failed to save session to browser storage:', err);
  }
};

export const removeStoredItem = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`Failed to remove ${key} from browser storage:`, err);
  }
};

export const getSavedSession = () => {
  try {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token') || '';
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
