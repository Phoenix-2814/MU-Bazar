import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import AdminReports from './AdminReports';
import AdminUsers from './AdminUsers';
import ChatModal from './ChatModal';
import ReportListingModal from './ReportListingModal';
import {
  API_BASE_URL,
  CATEGORY_OPTIONS,
  GOOGLE_CLIENT_ID,
  LISTINGS_PAGE_SIZE,
  LISTINGS_REQUEST_TIMEOUT_MS,
  LISTING_FILTER_DEBOUNCE_MS,
  MAX_LISTINGS_PAGE_SIZE,
  NOTIFICATIONS_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from './config';
import compressImage from './utils/compressImage';
import {
  DEFAULT_LISTING_PARAMS_KEY,
  getListingParamsKey,
  normalizeSearchText,
  validateListingForm,
} from './utils/listings';
import { getSavedSession, getSavedTheme, persistSession, removeStoredItem } from './utils/storage';
import validateImageFiles from './utils/validateImageFiles';
import AuthModal from './components/AuthModal';
import CategoryBar from './components/CategoryBar';
import EditListingModal from './components/EditListingModal';
import MarketplacePage from './components/MarketplacePage';
import MyProductsPage from './components/MyProductsPage';
import Navbar from './components/Navbar';
import PostListingModal from './components/PostListingModal';
import ProfilePage from './components/ProfilePage';
import ShareModal from './components/ShareModal';
import ItemDetailModal from './components/ItemDetailModal';

function App() {
  const [savedSession] = useState(getSavedSession);
  const [items, setItems] = useState([]);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [myProducts, setMyProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoadError, setItemsLoadError] = useState('');
  const [myProductsLoading, setMyProductsLoading] = useState(false);
  const [activePage, setActivePage] = useState('marketplace');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isReportsAdmin, setIsReportsAdmin] = useState(false);
  const [reportingItem, setReportingItem] = useState(null);
  const [user, setUser] = useState(savedSession.user);
  const [token, setToken] = useState(savedSession.token);
  const [theme, setTheme] = useState(getSavedTheme);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (err) {
      console.error('Failed to load saved notifications:', err);
      return [];
    }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  ));
  const [authMessage, setAuthMessage] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isPostingItem, setIsPostingItem] = useState(false);
  const [isUpdatingListingStatus, setIsUpdatingListingStatus] = useState(false);
  const [isModifyingItem, setIsModifyingItem] = useState(false);
  const [toast, setToast] = useState(null);
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  const googleButtonRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const profileMenuButtonRef = useRef(null);
  const profilePageRef = useRef(null);
  const seenListingIdsRef = useRef(null);
  const listingRequestIdRef = useRef(0);
  const itemsRef = useRef([]);
  const loadedListingParamsKeyRef = useRef(null);
  const unreadCountRef = useRef(unreadMessageCount);
  const browserNotificationPermissionRef = useRef(browserNotificationPermission);
  const currentUserId = user?._id || user?.id;
  unreadCountRef.current = unreadMessageCount;
  browserNotificationPermissionRef.current = browserNotificationPermission;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast || toast.type === 'error') return undefined;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  }, [theme]);

  // Modal UI States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showPostModal, setShowPostModal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editItemModal, setEditItemModal] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatConversationId, setChatConversationId] = useState(null);
  const [shareModalItem, setShareModalItem] = useState(null);
  const [isNewPostShare, setIsNewPostShare] = useState(false);
  const [deepLinkedItem, setDeepLinkedItem] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [listingSort, setListingSort] = useState('newest');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const [listingParamsKey, setListingParamsKey] = useState(DEFAULT_LISTING_PARAMS_KEY);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  // Forms
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    phone: '',
    residencyType: 'hosteler',
    hostelName: '',
    hostelBlock: '',
    roomNumber: '',
    profilePic: null,
    profilePicPreview: '',
  });
  const authFormRef = useRef(authForm);
  authFormRef.current = authForm;

  const [postForm, setPostForm] = useState({
    title: '',
    description: '',
    price: '',
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: null,
  });

  const [editItemForm, setEditItemForm] = useState({
    title: '',
    description: '',
    price: '',
    category: 'BOOKS',
    condition: 'USED_GOOD',
    images: null,
  });

  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    residencyType: 'hosteler',
    hostelName: '',
    hostelBlock: '',
    roomNumber: '',
    profilePic: null,
    profilePicPreview: '',
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        phone: user.phone || '',
        residencyType: user.residencyType || 'hosteler',
        hostelName: user.hostelName || '',
        hostelBlock: user.hostelBlock || '',
        roomNumber: user.roomNumber || '',
        profilePic: null,
        profilePicPreview: user.profilePic || '',
      });
    }
  }, [user]);

  const publishNotification = useCallback((notification) => {
    const entry = {
      ...notification,
      id: `${notification.type}-${notification.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications((current) => [entry, ...current].slice(0, 50));

    if (browserNotificationPermissionRef.current === 'granted' && 'Notification' in window) {
      try {
        const browserNotification = new window.Notification(entry.title, {
          body: entry.body,
          tag: entry.id,
        });
        browserNotification.onclick = () => window.focus();
      } catch (err) {
        console.error('Could not show browser notification:', err);
      }
    }
  }, []);

  const fetchItems = useCallback(async ({ background = false, notifyNewListings = false, append = false } = {}) => {
    const requestId = ++listingRequestIdRef.current;
    const sameFilters = loadedListingParamsKeyRef.current === listingParamsKey;
    const loadedCount = sameFilters ? itemsRef.current.length : 0;
    const offset = append ? loadedCount : 0;
    const limit = append
      ? LISTINGS_PAGE_SIZE
      : Math.min(MAX_LISTINGS_PAGE_SIZE, Math.max(LISTINGS_PAGE_SIZE, loadedCount));
    const filters = JSON.parse(listingParamsKey);
    const params = {
      limit,
      offset,
      sort: filters.sort,
      ...(filters.q && { q: filters.q }),
      ...(filters.category !== 'ALL' && { category: filters.category }),
      ...(filters.minPrice !== '' && { minPrice: filters.minPrice }),
      ...(filters.maxPrice !== '' && { maxPrice: filters.maxPrice }),
      ...(currentUserId && { excludeSeller: currentUserId }),
    };
    try {
      if (append) {
        setLoadingMoreItems(true);
      } else if (!background) {
        setLoading(true);
      }
      const res = await axios.get(`${API_BASE_URL}/api/items`, {
        params,
        timeout: LISTINGS_REQUEST_TIMEOUT_MS,
      });
      if (requestId !== listingRequestIdRef.current) return;
      const page = Array.isArray(res.data)
        ? { items: res.data, total: res.data.length, hasMore: false }
        : res.data;
      if (Array.isArray(page?.items)) {
        const incoming = page.items;
        if (seenListingIdsRef.current === null) {
          seenListingIdsRef.current = new Set(incoming.map((item) => item._id));
        } else {
          const newListings = incoming.filter((item) => !seenListingIdsRef.current.has(item._id));
          newListings.forEach((item) => seenListingIdsRef.current.add(item._id));
          if (notifyNewListings) {
            newListings
              .filter((item) => {
                const sellerId = item.seller?._id || item.seller;
                return !currentUserId || sellerId !== currentUserId;
              })
              .forEach((item) => publishNotification({
                type: 'listing',
                id: item._id,
                title: 'New listing',
                body: `${item.title} · ₹${item.price}`,
                listingId: item._id,
                itemTitle: item.title,
              }));
          }
        }
        let nextItems = incoming;
        if (append) {
          const loadedIds = new Set(itemsRef.current.map((item) => item._id));
          nextItems = [...itemsRef.current, ...incoming.filter((item) => !loadedIds.has(item._id))];
        }
        itemsRef.current = nextItems;
        loadedListingParamsKeyRef.current = listingParamsKey;
        setItems(nextItems);
        setHasMoreItems(Boolean(page.hasMore));
        setTotalItems(Number.isFinite(page.total) ? page.total : nextItems.length);
        setItemsLoadError('');
      } else {
        setItemsLoadError('The listings service returned an invalid response.');
      }
    } catch (err) {
      if (requestId !== listingRequestIdRef.current) return;
      console.error('Failed to fetch items:', err);
      setItemsLoadError(
        err.code === 'ECONNABORTED'
          ? 'Loading listings took too long. Please check your connection and try again.'
          : `Could not load listings: ${err.response?.data?.message || err.message}. Please try again.`
      );
    } finally {
      if (append) setLoadingMoreItems(false);
      if (requestId === listingRequestIdRef.current) setLoading(false);
    }
  }, [currentUserId, publishNotification, listingParamsKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setListingParamsKey(getListingParamsKey({
        searchQuery,
        selectedCategory,
        minimumPrice,
        maximumPrice,
        listingSort,
      }));
    }, LISTING_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchQuery, selectedCategory, minimumPrice, maximumPrice, listingSort]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch (err) {
      console.error('Failed to save notifications:', err);
    }
  }, [notifications]);

  useEffect(() => {
    const refreshListings = () => fetchItems({ background: true, notifyNewListings: true });
    const interval = window.setInterval(refreshListings, 60000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshListings();
    };
    window.addEventListener('focus', refreshListings);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshListings);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchItems]);

  useEffect(() => {
    if (!showProfileDropdown) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!profileDropdownRef.current?.contains(event.target)) setShowProfileDropdown(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowProfileDropdown(false);
        profileMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showProfileDropdown]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setIsReportsAdmin(false);
      return undefined;
    }

    axios
      .get(`${API_BASE_URL}/api/reports/admin/access`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!cancelled) setIsReportsAdmin(res.data.isAdmin === true);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to check report admin access:', err);
          setIsReportsAdmin(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, currentUserId]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    if (window.google?.accounts?.id) {
      setGoogleScriptLoaded(true);
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleScriptLoaded(true);
    script.onerror = () => setAuthMessage('Could not load Google sign-in. Please try again later.');
    document.head.appendChild(script);
    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  useEffect(() => {
    if (
      !showAuthModal ||
      !['login', 'register'].includes(authMode) ||
      !GOOGLE_CLIENT_ID ||
      !googleScriptLoaded ||
      !googleButtonRef.current
    ) return;

    googleButtonRef.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        setAuthMessage('');
        const currentForm = authFormRef.current;
        try {
          const res = await axios.post(`${API_BASE_URL}/api/auth/google`, {
            credential: response.credential,
            mode: authMode === 'register' ? 'signup' : 'signin',
            residencyType: currentForm.residencyType,
            hostelName: currentForm.hostelName,
            hostelBlock: currentForm.hostelBlock,
            roomNumber: currentForm.roomNumber,
          });
          setUser(res.data.user);
          setToken(res.data.token);
          persistSession(res.data.user, res.data.token);
          setShowAuthModal(false);
          setNeedsEmailVerification(false);
          setAuthMessage('');
        } catch (err) {
          const message = err.response?.data?.message || 'Google authentication failed.';
          if (err.response?.data?.code === 'ACCOUNT_NOT_FOUND') {
            setAuthMessage(`${message} Choose Register to create an account.`);
          } else if (err.response?.data?.code === 'ACCOUNT_EXISTS') {
            setAuthMessage(`${message} Choose Login to continue.`);
          } else {
            setAuthMessage(message);
          }
        }
      },
    });
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      text: authMode === 'register' ? 'signup_with' : 'signin_with',
      shape: 'rectangular',
      width: 280,
    });
  }, [
    showAuthModal,
    authMode,
    googleScriptLoaded,
  ]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const verificationToken = url.searchParams.get('verifyEmail');
    if (!verificationToken) return;

    url.searchParams.delete('verifyEmail');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

    axios
      .post(`${API_BASE_URL}/api/auth/verify-email`, { token: verificationToken })
      .then((res) => {
        setUser(res.data.user);
        setToken(res.data.token);
        persistSession(res.data.user, res.data.token);
        setAuthMessage('Your email is verified and you are now logged in.');
      })
      .catch((err) => {
        setAuthMessage(err.response?.data?.message || 'Could not verify your email. Request a new link and try again.');
      });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get('resetPassword');
    if (!resetToken) return;

    url.searchParams.delete('resetPassword');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    setPasswordResetToken(resetToken);
    setAuthMode('resetPassword');
    setNeedsEmailVerification(false);
    setAuthMessage('');
    setShowAuthModal(true);
  }, []);

  useEffect(() => {
    const soldExpiries = items
      .filter((item) => item.isSold && item.updatedAt)
      .map((item) => new Date(item.updatedAt).getTime() + 24 * 60 * 60 * 1000);
    if (soldExpiries.length === 0) return undefined;

    const nextExpiry = Math.min(...soldExpiries);
    const timeout = setTimeout(fetchItems, Math.max(0, nextExpiry - Date.now() + 50));
    return () => clearTimeout(timeout);
  }, [items, fetchItems]);

  useEffect(() => {
    let cancelled = false;
    if (!token || !currentUserId) {
      setMyProducts([]);
      return undefined;
    }

    setMyProductsLoading(true);
    axios
      .get(`${API_BASE_URL}/api/items/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!cancelled) setMyProducts(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch your products:', err);
          setMyProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setMyProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, currentUserId]);

  const handleShareListing = useCallback((item) => {
    setShareModalItem(item);
    setIsNewPostShare(false);
  }, []);

  const closeDeepLinkedItem = useCallback(() => {
    setDeepLinkedItem(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/item/')) {
      window.history.pushState(null, '', '/');
    }
  }, []);

  // Handle URL routing & Deep Linking (/item/:id or ?item=id)
  useEffect(() => {
    let cancelled = false;

    const handleUrlChange = async () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;
      const search = new URLSearchParams(window.location.search);
      const itemQuery = search.get('item');
      const itemMatch = path.match(/^\/item\/([a-fA-F0-9]{24})/);
      const itemId = itemMatch ? itemMatch[1] : (itemQuery && /^[a-fA-F0-9]{24}$/.test(itemQuery) ? itemQuery : null);

      if (itemId) {
        const found = itemsRef.current.find((i) => i._id === itemId);
        if (found) {
          if (!cancelled) setDeepLinkedItem(found);
        } else {
          try {
            const res = await axios.get(`${API_BASE_URL}/api/items/${itemId}`);
            if (!cancelled && res.data) {
              setDeepLinkedItem(res.data);
            }
          } catch (err) {
            if (!cancelled) console.error('Failed to load deep-linked listing:', err);
          }
        }
      } else {
        if (!cancelled) setDeepLinkedItem(null);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  useEffect(() => {
    if (!token || !currentUserId) {
      setUnreadMessageCount(0);
      return undefined;
    }

    let cancelled = false;
    const refreshUnreadCount = async (notifyNewMessage = false, messageEvent = {}) => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/chat/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) {
          const nextUnreadCount = res.data.unreadCount || 0;
          if (notifyNewMessage && nextUnreadCount > unreadCountRef.current) {
            publishNotification({
              type: 'message',
              id: messageEvent.messageId || messageEvent.conversationId,
              title: 'New message',
              body: 'You received a new message.',
              conversationId: messageEvent.conversationId,
            });
          }
          unreadCountRef.current = nextUnreadCount;
          setUnreadMessageCount(nextUnreadCount);
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch unread message count:', err);
      }
    };

    refreshUnreadCount();
    const unreadRefreshInterval = window.setInterval(refreshUnreadCount, 15000);
    const refreshUnreadWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshUnreadCount();
    };
    window.addEventListener('focus', refreshUnreadCount);
    document.addEventListener('visibilitychange', refreshUnreadWhenVisible);

    const socket = io(API_BASE_URL, { autoConnect: false, auth: { token } });
    socket.on('user_message', (messageEvent = {}) => refreshUnreadCount(true, messageEvent));
    socket.on('connect_error', (err) => {
      if (!cancelled) console.error('Chat notification connection failed:', err.message);
    });
    socket.connect();

    return () => {
      cancelled = true;
      window.clearInterval(unreadRefreshInterval);
      window.removeEventListener('focus', refreshUnreadCount);
      document.removeEventListener('visibilitychange', refreshUnreadWhenVisible);
      socket.disconnect();
    };
  }, [token, currentUserId, publishNotification]);

  const handleRegisterPicChange = (e) => {
    const file = e.target.files[0];
    const validationError = validateImageFiles(file ? [file] : [], 1);
    if (validationError) {
      showToast(validationError, 'error');
      e.target.value = '';
      return;
    }
    if (file) {
      setAuthForm({
        ...authForm,
        profilePic: file,
        profilePicPreview: URL.createObjectURL(file),
      });
    }
  };

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    const validationError = validateImageFiles(file ? [file] : [], 1);
    if (validationError) {
      showToast(validationError, 'error');
      e.target.value = '';
      return;
    }
    if (file) {
      setProfileForm({
        ...profileForm,
        profilePic: file,
        profilePicPreview: URL.createObjectURL(file),
      });
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      let res;
      if (authMode === 'register') {
        const normalizedEmail = authForm.email.trim().toLowerCase();
        if (!/^[^\s@]+@marwadiuniversity\.ac\.in$/.test(normalizedEmail)) {
          showToast('Only MU students can register. Use your @marwadiuniversity.ac.in email address.', 'error');
          return;
        }

        const formData = new FormData();
        formData.append('name', authForm.name);
        formData.append('email', normalizedEmail);
        formData.append('password', authForm.password);
        formData.append('phone', authForm.phone);
        formData.append('residencyType', authForm.residencyType);
        if (authForm.residencyType === 'hosteler') {
          formData.append('hostelName', authForm.hostelName);
          formData.append('hostelBlock', authForm.hostelBlock);
          formData.append('roomNumber', authForm.roomNumber);
        }
        if (authForm.profilePic) {
          formData.append('profilePic', await compressImage(authForm.profilePic));
        }

        res = await axios.post(`${API_BASE_URL}/api/auth/register`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const verificationMsg = res.data?.message || 'Account created. Check your MU email for a verification link before logging in. Check your spam.';
        setAuthForm((form) => ({ ...form, email: normalizedEmail }));
        setAuthMode('login');
        setNeedsEmailVerification(true);
        setAuthMessage(verificationMsg);
        showToast(verificationMsg, 'success');
        setShowAuthModal(false);
        return;
      } else {
        res = await axios.post(`${API_BASE_URL}/api/auth/login`, {
          email: authForm.email.trim().toLowerCase(),
          password: authForm.password,
        });
      }

      setUser(res.data.user);
      setToken(res.data.token);
      persistSession(res.data.user, res.data.token);
      setShowAuthModal(false);
      setNeedsEmailVerification(false);
      setAuthMessage('');
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsEmailVerification(true);
        setAuthMessage(message);
      } else if (
        authMode === 'register' &&
        [429, 503].includes(err.response?.status) &&
        err.response?.data?.code !== 'RATE_LIMITED'
      ) {
        setAuthForm((form) => ({ ...form, email: form.email.trim().toLowerCase() }));
        setAuthMode('login');
        setNeedsEmailVerification(true);
        setAuthMessage(message);
        setShowAuthModal(false);
      } else {
        setAuthMessage(`Authentication failed: ${message}`);
      }
    }
  };

  const handleResendVerification = async () => {
    setAuthMessage('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/resend-verification`, {
        email: authForm.email.trim().toLowerCase(),
      });
      const msg = res.data?.message || 'A verification link has been sent. Check your spam.';
      setAuthMessage(msg);
      showToast(msg, 'success');
    } catch (err) {
      setAuthMessage(err.response?.data?.message || 'Could not resend the verification email.');
    }
  };

  const handlePasswordResetRequest = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/request-password-reset`, {
        email: authForm.email.trim().toLowerCase(),
      });
      setAuthMessage(res.data.message);
    } catch (err) {
      setAuthMessage(err.response?.data?.message || 'Could not process your password reset request.');
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    if (authForm.password !== authForm.passwordConfirmation) {
      setAuthMessage('Passwords do not match.');
      return;
    }

    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
        token: passwordResetToken,
        password: authForm.password,
      });
      setPasswordResetToken('');
      setAuthForm((form) => ({ ...form, password: '', passwordConfirmation: '' }));
      setAuthMode('login');
      setAuthMessage(res.data.message);
    } catch (err) {
      setAuthMessage(err.response?.data?.message || 'Could not reset your password. Please try again.');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const formData = new FormData();
      formData.append('name', profileForm.name);
      formData.append('phone', profileForm.phone);
      formData.append('residencyType', profileForm.residencyType);
      if (profileForm.residencyType === 'hosteler') {
        formData.append('hostelName', profileForm.hostelName);
        formData.append('hostelBlock', profileForm.hostelBlock);
        formData.append('roomNumber', profileForm.roomNumber);
      }
      if (profileForm.profilePic) {
        formData.append('profilePic', await compressImage(profileForm.profilePic));
      }

      const res = await axios.put(`${API_BASE_URL}/api/user/profile`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      const updatedUser = res.data.user || res.data;
      setUser(updatedUser);
      try {
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } catch (err) {
        console.error('Failed to save updated profile to browser storage:', err);
      }
      setIsEditingProfile(false);
      showToast('Profile updated successfully!');
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      showToast(`Failed to update profile: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleLogout = () => {
    const publicNotifications = notifications.filter((notification) => notification.type !== 'message');
    setNotifications(publicNotifications);
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(publicNotifications));
    } catch (err) {
      console.error('Failed to save notifications:', err);
    }
    setUser(null);
    setToken('');
    setUnreadMessageCount(0);
    setActivePage('marketplace');
    removeStoredItem('user');
    removeStoredItem('token');
    setIsEditingProfile(false);
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (isPostingItem) return;
    if (!token) return showToast('Please log in first.', 'error');

    const imageValidationError = validateImageFiles(postForm.images);
    if (imageValidationError) {
      showToast(imageValidationError, 'error');
      return;
    }

    const validationError = validateListingForm(postForm);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setIsPostingItem(true);
    try {
      const formData = new FormData();
      formData.append('title', postForm.title.trim());
      formData.append('description', postForm.description.trim());
      formData.append('price', String(Number(postForm.price)));
      formData.append('category', postForm.category);
      formData.append('condition', postForm.condition);

      if (postForm.images) {
        for (let i = 0; i < postForm.images.length; i++) {
          formData.append('images', await compressImage(postForm.images[i]));
        }
      }

      const response = await axios.post(`${API_BASE_URL}/api/items`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      const createdItem = response.data?.item;
      showToast('Item posted successfully!');
      setShowPostModal(false);
      setPostForm({
        title: '',
        description: '',
        price: '',
        category: 'BOOKS',
        condition: 'USED_GOOD',
        images: null,
      });
      if (createdItem) {
        setShareModalItem(createdItem);
        setIsNewPostShare(true);
      }
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      showToast(`Failed to post item: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      setIsPostingItem(false);
    }
  };

  const handleToggleSold = async (itemId, isSold) => {
    if (isUpdatingListingStatus) return;
    setIsUpdatingListingStatus(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/items/${itemId}/sold`,
        { isSold },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      showToast(`Failed to update status: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      setIsUpdatingListingStatus(false);
    }
  };

  const refreshMyProducts = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/items/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to refresh your products:', err);
    }
  };

  const handleDeleteProduct = async (itemId) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshMyProducts();
      fetchItems();
    } catch (err) {
      showToast(`Failed to delete product: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleMessageSeller = async (item) => {
    if (!user || !token) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/chat/conversation`,
        { itemId: item._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setChatConversationId(res.data._id);
      setShowChatModal(true);
    } catch (err) {
      showToast(`Could not start chat: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleOpenMessages = () => {
    setChatConversationId(null);
    setShowChatModal(true);
  };

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      setBrowserNotificationPermission(permission);
    } catch (err) {
      console.error('Could not request browser notification permission:', err);
      setAuthMessage('Could not enable browser notifications. Check your browser settings and try again.');
    }
  };

  const handleNotificationClick = (notification) => {
    setNotifications((current) => current.map((entry) => (
      entry.id === notification.id ? { ...entry, read: true } : entry
    )));
    setShowNotifications(false);
    if (notification.type === 'message' && notification.conversationId) {
      setChatConversationId(notification.conversationId);
      setShowChatModal(true);
      return;
    }
    if (notification.type === 'listing') {
      setActivePage('marketplace');
      setSelectedCategory('ALL');
      setSearchQuery(notification.itemTitle || '');
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((current) => current.map((entry) => ({ ...entry, read: true })));
  };

  useEffect(() => {
    if (!showNotifications) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        notificationButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showNotifications]);

  const unreadNotificationCount = notifications.filter((entry) => !entry.read).length;

  const handleReportListing = (item) => {
    if (!user || !token) {
      setAuthMode('login');
      setAuthMessage('Please log in to report a listing.');
      setShowAuthModal(true);
      return;
    }
    setReportingItem(item);
  };

  const openEditModal = (item) => {
    setEditItemModal(item);
    setEditItemForm({
      title: item.title,
      description: item.description,
      price: item.price,
      category: item.category,
      condition: item.condition,
      images: null,
    });
  };

  const handleModifySubmit = async (e) => {
    e.preventDefault();
    const imageValidationError = validateImageFiles(editItemForm.images);
    if (imageValidationError) {
      showToast(imageValidationError, 'error');
      return;
    }

    const validationError = validateListingForm(editItemForm);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setIsModifyingItem(true);
    try {
      const formData = new FormData();
      formData.append('title', editItemForm.title.trim());
      formData.append('description', editItemForm.description.trim());
      formData.append('price', String(Number(editItemForm.price)));
      formData.append('category', editItemForm.category);
      formData.append('condition', editItemForm.condition);

      if (editItemForm.images) {
        const compressedImages = await Promise.all(
          Array.from(editItemForm.images, (image) => compressImage(image))
        );
        compressedImages.forEach((image) => formData.append('images', image));
      }

      await axios.put(`${API_BASE_URL}/api/items/${editItemModal._id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      showToast('Item updated successfully!');
      setEditItemModal(null);
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      showToast(`Failed to modify item: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      setIsModifyingItem(false);
    }
  };

  const preventContextMenu = (e) => {
    e.preventDefault();
  };

  const searchTerms = normalizeSearchText(searchQuery).split(' ').filter(Boolean);
  const minPriceValue = minimumPrice === '' ? null : Number(minimumPrice);
  const maxPriceValue = maximumPrice === '' ? null : Number(maximumPrice);
  const priceRangeError = (
    (minPriceValue !== null && (!Number.isFinite(minPriceValue) || minPriceValue < 0 || minPriceValue > 500000)) ||
    (maxPriceValue !== null && (!Number.isFinite(maxPriceValue) || maxPriceValue < 0 || maxPriceValue > 500000))
  )
    ? 'Price filters must be between ₹0 and ₹5,00,000.'
    : minPriceValue !== null && maxPriceValue !== null && minPriceValue > maxPriceValue
      ? 'Minimum price cannot be greater than maximum price.'
      : '';
  const filteredItems = items.filter((item) => {
    const sellerId = item.seller?._id || item.seller;
    const isOwnProduct = currentUserId && sellerId === currentUserId;
    const soldListingExpired =
      item.isSold &&
      (!item.updatedAt || Date.now() - new Date(item.updatedAt).getTime() >= 24 * 60 * 60 * 1000);

    if (isOwnProduct || soldListingExpired) return false;

    const matchesCategory =
      selectedCategory === 'ALL' ||
      normalizeSearchText(item.category) === normalizeSearchText(selectedCategory);
    const price = Number(item.price);
    const matchesPrice = !priceRangeError &&
      (minPriceValue === null || price >= minPriceValue) &&
      (maxPriceValue === null || price <= maxPriceValue);
    const seller = item.seller && typeof item.seller === 'object' ? item.seller : {};
    const searchableText = normalizeSearchText([
      item.title,
      item.description,
      item.price,
      item.category,
      CATEGORY_OPTIONS.find((category) => category.key === item.category)?.label,
      item.condition,
      seller.name,
      seller.residencyType,
      seller.hostelName,
      seller.hostelBlock,
    ].filter(Boolean).join(' '));
    const matchesSearch = searchTerms.every((term) => searchableText.includes(term));

    return matchesCategory && matchesSearch && matchesPrice;
  });
  const sortedItems = [...filteredItems].sort((first, second) => {
    if (listingSort === 'price-low') {
      return Number(first.price) - Number(second.price);
    }
    if (listingSort === 'price-high') {
      return Number(second.price) - Number(first.price);
    }
    return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
  });

  const myActiveListings = myProducts.filter((item) => !item.isSold);
  const mySoldHistoryListings = myProducts.filter((item) => item.isSold);

  return (
    <div className="app-container" data-theme={theme}>
      {toast && (
        <div
          className={`app-toast app-toast-${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
        >
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            &times;
          </button>
        </div>
      )}
      {authMessage && !showAuthModal && (
        <div className="auth-status-message" role="status" aria-live="polite">
          <span>{authMessage}</span>
          <button type="button" onClick={() => setAuthMessage('')} aria-label="Dismiss message">
            &times;
          </button>
        </div>
      )}
      {/* Header Navbar */}
      <Navbar
        activePage={activePage}
        browserNotificationPermission={browserNotificationPermission}
        handleLogout={handleLogout}
        handleNotificationClick={handleNotificationClick}
        handleOpenMessages={handleOpenMessages}
        isReportsAdmin={isReportsAdmin}
        markAllNotificationsRead={markAllNotificationsRead}
        myActiveListings={myActiveListings}
        mySoldHistoryListings={mySoldHistoryListings}
        notificationButtonRef={notificationButtonRef}
        notifications={notifications}
        preventContextMenu={preventContextMenu}
        profileDropdownRef={profileDropdownRef}
        profileMenuButtonRef={profileMenuButtonRef}
        requestBrowserNotifications={requestBrowserNotifications}
        searchQuery={searchQuery}
        setActivePage={setActivePage}
        setAuthMode={setAuthMode}
        setIsEditingProfile={setIsEditingProfile}
        setSearchQuery={setSearchQuery}
        setSelectedCategory={setSelectedCategory}
        setShowAuthModal={setShowAuthModal}
        setShowNotifications={setShowNotifications}
        setShowPostModal={setShowPostModal}
        setShowProfileDropdown={setShowProfileDropdown}
        showNotifications={showNotifications}
        showProfileDropdown={showProfileDropdown}
        unreadMessageCount={unreadMessageCount}
        unreadNotificationCount={unreadNotificationCount}
        user={user}
      />

      {/* Category Bar */}
      {activePage === 'marketplace' && (
        <CategoryBar
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          setTheme={setTheme}
          theme={theme}
        />
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {activePage === 'marketplace' ? (
          <MarketplacePage
            expandedDescriptions={expandedDescriptions}
            fetchItems={fetchItems}
            filteredItems={filteredItems}
            handleMessageSeller={handleMessageSeller}
            handleReportListing={handleReportListing}
            handleShareListing={handleShareListing}
            hasMoreItems={hasMoreItems}
            items={items}
            itemsLoadError={itemsLoadError}
            listingSort={listingSort}
            loading={loading}
            loadingMoreItems={loadingMoreItems}
            maximumPrice={maximumPrice}
            minimumPrice={minimumPrice}
            preventContextMenu={preventContextMenu}
            priceRangeError={priceRangeError}
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            setExpandedDescriptions={setExpandedDescriptions}
            setListingSort={setListingSort}
            setMaximumPrice={setMaximumPrice}
            setMinimumPrice={setMinimumPrice}
            setSearchQuery={setSearchQuery}
            setSelectedCategory={setSelectedCategory}
            sortedItems={sortedItems}
            totalItems={totalItems}
          />
        ) : activePage === 'admin-reports' ? (
          isReportsAdmin ? (
            <AdminReports token={token} />
          ) : (
            <section className="products-page">
              <h2>Admin access required</h2>
              <p className="no-items">This page is only available to authorized report moderators.</p>
            </section>
          )
        ) : activePage === 'admin-users' ? (
          isReportsAdmin ? (
            <AdminUsers token={token} />
          ) : (
            <section className="products-page">
              <h2>Admin access required</h2>
              <p className="no-items">This page is only available to authorized administrators.</p>
            </section>
          )
        ) : activePage === 'profile' && user ? (
          <ProfilePage
            handleLogout={handleLogout}
            handleProfilePicChange={handleProfilePicChange}
            handleUpdateProfile={handleUpdateProfile}
            isEditingProfile={isEditingProfile}
            isUpdatingProfile={isUpdatingProfile}
            preventContextMenu={preventContextMenu}
            profileForm={profileForm}
            profilePageRef={profilePageRef}
            setActivePage={setActivePage}
            setIsEditingProfile={setIsEditingProfile}
            setProfileForm={setProfileForm}
            user={user}
          />
        ) : (
          <MyProductsPage
            activePage={activePage}
            handleDeleteProduct={handleDeleteProduct}
            handleShareListing={handleShareListing}
            handleToggleSold={handleToggleSold}
            isUpdatingListingStatus={isUpdatingListingStatus}
            myActiveListings={myActiveListings}
            myProductsLoading={myProductsLoading}
            mySoldHistoryListings={mySoldHistoryListings}
            openEditModal={openEditModal}
          />
        )}
      </main>

      {/* Modify Item Modal */}
      {editItemModal && (
        <EditListingModal
          editItemForm={editItemForm}
          handleModifySubmit={handleModifySubmit}
          isModifyingItem={isModifyingItem}
          setEditItemForm={setEditItemForm}
          setEditItemModal={setEditItemModal}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          authForm={authForm}
          authMessage={authMessage}
          authMode={authMode}
          handlePasswordReset={handlePasswordReset}
          handlePasswordResetRequest={handlePasswordResetRequest}
          googleButtonRef={googleButtonRef}
          googleScriptLoaded={googleScriptLoaded}
          handleAuth={handleAuth}
          handleRegisterPicChange={handleRegisterPicChange}
          handleResendVerification={handleResendVerification}
          needsEmailVerification={needsEmailVerification}
          preventContextMenu={preventContextMenu}
          setAuthForm={setAuthForm}
          setAuthMessage={setAuthMessage}
          setAuthMode={setAuthMode}
          setNeedsEmailVerification={setNeedsEmailVerification}
          setShowAuthModal={setShowAuthModal}
        />
      )}

      {/* Post Modal */}
      {showPostModal && (
        <PostListingModal
          handlePostSubmit={handlePostSubmit}
          isPostingItem={isPostingItem}
          postForm={postForm}
          setPostForm={setPostForm}
          setShowPostModal={setShowPostModal}
        />
      )}

      {showChatModal && user && (
        <ChatModal
          conversationId={chatConversationId}
          currentUser={user}
          token={token}
          onUnreadCountChange={setUnreadMessageCount}
          onClose={() => setShowChatModal(false)}
        />
      )}
      {reportingItem && user && (
        <ReportListingModal
          listing={reportingItem}
          token={token}
          onClose={() => setReportingItem(null)}
          onSubmitted={(message) => {
            setReportingItem(null);
            setAuthMessage(message);
          }}
        />
      )}

      {/* Share Modal */}
      {shareModalItem && (
        <ShareModal
          item={shareModalItem}
          isNewPost={isNewPostShare}
          onClose={() => {
            setShareModalItem(null);
            setIsNewPostShare(false);
          }}
        />
      )}

      {/* Deep-Linked Item Detail Modal */}
      {deepLinkedItem && (
        <ItemDetailModal
          item={deepLinkedItem}
          onClose={closeDeepLinkedItem}
          handleMessageSeller={handleMessageSeller}
          handleShareListing={handleShareListing}
          handleReportListing={handleReportListing}
        />
      )}
    </div>
  );
}

export default App;