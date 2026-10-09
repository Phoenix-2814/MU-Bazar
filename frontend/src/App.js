import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';
import ChatModal from './ChatModal';
import compressImage from './utils/compressImage';
import ReportListingModal from './ReportListingModal';
import AdminReports from './AdminReports';

const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const CATEGORY_OPTIONS = [
  { key: 'ALL', label: 'All Items' },
  { key: 'BOOKS', label: 'Books & Notes' },
  { key: 'ELECTRONICS', label: 'Electronics' },
  { key: 'CLOTHING', label: 'Clothing' },
  { key: 'HOSTEL_ESSENTIALS', label: 'Hostel Essentials' },
  { key: 'OTHER', label: 'Others' },
];

const normalizeSearchText = (value) => String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
const NOTIFICATIONS_STORAGE_KEY = 'mubazar-notifications';

function App() {
  const [items, setItems] = useState([]);
  const [myProducts, setMyProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoadError, setItemsLoadError] = useState('');
  const [myProductsLoading, setMyProductsLoading] = useState(false);
  const [activePage, setActivePage] = useState('marketplace');
  const [isReportsAdmin, setIsReportsAdmin] = useState(false);
  const [reportingItem, setReportingItem] = useState(null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(localStorage.getItem('token') || '');
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
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isModifyingItem, setIsModifyingItem] = useState(false);
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  const googleButtonRef = useRef(null);
  const profilePageRef = useRef(null);
  const seenListingIdsRef = useRef(null);
  const unreadCountRef = useRef(unreadMessageCount);
  const browserNotificationPermissionRef = useRef(browserNotificationPermission);
  const currentUserId = user?._id || user?.id;
  unreadCountRef.current = unreadMessageCount;
  browserNotificationPermissionRef.current = browserNotificationPermission;

  // Modal UI States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showPostModal, setShowPostModal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editItemModal, setEditItemModal] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatConversationId, setChatConversationId] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [listingSort, setListingSort] = useState('newest');

  // Forms
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
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

  const publishNotification = (notification) => {
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
  };

  const fetchItems = async ({ background = false, notifyNewListings = false } = {}) => {
    try {
      if (!background) {
        setLoading(true);
        setItemsLoadError('');
      }
      const res = await axios.get(`${API_BASE_URL}/api/items`);
      if (Array.isArray(res.data)) {
        const incomingIds = new Set(res.data.map((item) => item._id));
        if (seenListingIdsRef.current === null) {
          seenListingIdsRef.current = incomingIds;
        } else {
          const newListings = res.data.filter((item) => !seenListingIdsRef.current.has(item._id));
          seenListingIdsRef.current = incomingIds;
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
        setItems(res.data);
      } else {
        if (!background) {
          setItems([]);
          setItemsLoadError('The listings service returned an invalid response.');
        }
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
      if (!background) {
        setItems([]);
        setItemsLoadError(
          `Could not load listings: ${err.response?.data?.message || err.message}. Please try again.`
        );
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
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
  }, []);

  useEffect(() => {
    if (activePage === 'profile') {
      profilePageRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [activePage]);

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
    if (!showAuthModal || !GOOGLE_CLIENT_ID || !googleScriptLoaded || !googleButtonRef.current) return;

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
          localStorage.setItem('user', JSON.stringify(res.data.user));
          localStorage.setItem('token', res.data.token);
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
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('token', res.data.token);
        setAuthMessage('Your email is verified and you are now logged in.');
      })
      .catch((err) => {
        setAuthMessage(err.response?.data?.message || 'Could not verify your email. Request a new link and try again.');
      });
  }, []);

  useEffect(() => {
    const soldExpiries = items
      .filter((item) => item.isSold && item.updatedAt)
      .map((item) => new Date(item.updatedAt).getTime() + 24 * 60 * 60 * 1000);
    if (soldExpiries.length === 0) return undefined;

    const nextExpiry = Math.min(...soldExpiries);
    const timeout = setTimeout(fetchItems, Math.max(0, nextExpiry - Date.now() + 50));
    return () => clearTimeout(timeout);
  }, [items]);

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
  }, [token, currentUserId]);

  const handleRegisterPicChange = (e) => {
    const file = e.target.files[0];
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
          alert('Only MU students can register. Use your @marwadiuniversity.ac.in email address.');
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
        setAuthForm((form) => ({ ...form, email: normalizedEmail }));
        setAuthMode('login');
        setNeedsEmailVerification(true);
        setAuthMessage(res.data.message);
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
      localStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.setItem('token', res.data.token);
      setShowAuthModal(false);
      setNeedsEmailVerification(false);
      setAuthMessage('');
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsEmailVerification(true);
        setAuthMessage(message);
      } else if (authMode === 'register' && [429, 503].includes(err.response?.status)) {
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
      setAuthMessage(res.data.message);
    } catch (err) {
      setAuthMessage(err.response?.data?.message || 'Could not resend the verification email.');
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
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setIsEditingProfile(false);
      alert('Profile updated successfully!');
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      alert(`Failed to update profile: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleLogout = () => {
    const publicNotifications = notifications.filter((notification) => notification.type !== 'message');
    setNotifications(publicNotifications);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(publicNotifications));
    setUser(null);
    setToken('');
    setUnreadMessageCount(0);
    setActivePage('marketplace');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setIsEditingProfile(false);
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (!token) return alert('Please log in first.');

    const formData = new FormData();
    formData.append('title', postForm.title);
    formData.append('description', postForm.description);
    formData.append('price', postForm.price);
    formData.append('category', postForm.category);
    formData.append('condition', postForm.condition);

    if (postForm.images) {
      for (let i = 0; i < postForm.images.length; i++) {
        formData.append('images', await compressImage(postForm.images[i]));
      }
    }

    try {
      await axios.post(`${API_BASE_URL}/api/items`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      alert('Item posted successfully!');
      setShowPostModal(false);
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      alert(`Failed to post item: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleToggleSold = async (itemId) => {
    try {
      await axios.patch(
        `${API_BASE_URL}/api/items/${itemId}/sold`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      alert(`Failed to update status: ${err.response?.data?.message || err.message}`);
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
      alert(`Failed to delete product: ${err.response?.data?.message || err.message}`);
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
      alert(`Could not start chat: ${err.response?.data?.message || err.message}`);
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
    setIsModifyingItem(true);
    try {
      const formData = new FormData();
      formData.append('title', editItemForm.title);
      formData.append('description', editItemForm.description);
      formData.append('price', editItemForm.price);
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
      alert('Item updated successfully!');
      setEditItemModal(null);
      fetchItems();
      refreshMyProducts();
    } catch (err) {
      alert(`Failed to modify item: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsModifyingItem(false);
    }
  };

  const preventContextMenu = (e) => {
    e.preventDefault();
  };

  const searchTerms = normalizeSearchText(searchQuery).split(' ').filter(Boolean);
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

    return matchesCategory && matchesSearch;
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
    <div className="app-container">
      {authMessage && !showAuthModal && (
        <div className="auth-status-message" role="status" aria-live="polite">
          <span>{authMessage}</span>
          <button type="button" onClick={() => setAuthMessage('')} aria-label="Dismiss message">
            &times;
          </button>
        </div>
      )}
      {/* Header Navbar */}
      <header className="navbar">
        <div
          className="brand"
          onClick={() => {
            setActivePage('marketplace');
            setSelectedCategory('ALL');
          }}
        >
          <img src="/logo.png" alt="MU Bazar Logo" className="navbar-logo" />
          <div className="brand-text">
            <h1>MU BAZAR</h1>
            <span className="tagline">Marwadi University Campus Marketplace</span>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            aria-label="Search listings"
            placeholder="Search by item, details, or seller..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <div className="nav-actions">
          {user ? (
            <>
              <button
                className={`btn-sell ${activePage === 'my-products' ? 'nav-button-active' : ''}`}
                onClick={() => setActivePage('my-products')}
              >
                MY PRODUCTS
              </button>
              <button
                className={`btn-sell ${activePage === 'history' ? 'nav-button-active' : ''}`}
                onClick={() => setActivePage('history')}
              >
                HISTORY
              </button>
              <button className="btn-sell" onClick={handleOpenMessages}>
                <span>MESSAGES</span>
                {unreadMessageCount > 0 && (
                  <span className="unread-message-dot" aria-label="You have unread messages" />
                )}
              </button>
              {isReportsAdmin && (
                <button
                  className={`btn-sell ${activePage === 'admin-reports' ? 'nav-button-active' : ''}`}
                  onClick={() => setActivePage('admin-reports')}
                >
                  REPORTS
                </button>
              )}
              <button className="btn-sell" onClick={() => setShowPostModal(true)}>
                + SELL ITEM
              </button>
            </>
          ) : (
            <button
              className="btn-login"
              onClick={() => {
                setAuthMode('login');
                setShowAuthModal(true);
              }}
            >
              Login / Register
            </button>
          )}
          <button
            type="button"
            className="btn-sell notification-trigger"
            aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
            aria-expanded={showNotifications}
            onClick={() => setShowNotifications((showing) => !showing)}
          >
            Notifications
            {unreadNotificationCount > 0 && (
              <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
            )}
          </button>
        </div>
        {showNotifications && (
          <section className="notification-panel" aria-label="Notifications">
            <div className="notification-panel-header">
              <h2>Notifications</h2>
              {unreadNotificationCount > 0 && (
                <button type="button" onClick={markAllNotificationsRead}>Mark all read</button>
              )}
            </div>
            <div className="browser-notification-setting">
              {browserNotificationPermission === 'granted' ? (
                <span>Browser notifications are enabled.</span>
              ) : browserNotificationPermission === 'unsupported' ? (
                <span>Browser notifications are not supported in this browser.</span>
              ) : browserNotificationPermission === 'denied' ? (
                <span>Browser notifications are blocked. Enable them in your browser site settings.</span>
              ) : (
                <>
                  <span>Get alerts while MU Bazar is open.</span>
                  <button type="button" onClick={requestBrowserNotifications}>
                    Enable browser alerts
                  </button>
                </>
              )}
            </div>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <p className="notification-empty">You’re all caught up.</p>
              ) : notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={`notification-item ${notification.read ? 'is-read' : 'is-unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-item-type">
                    {notification.type === 'message' ? 'Message' : 'New listing'}
                  </span>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                  <small>{new Date(notification.createdAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        {user && (
          <div
            className="profile-badge"
            onClick={() => {
              setIsEditingProfile(false);
              setActivePage('profile');
            }}
          >
            {user.profilePic ? (
              <div
                className="profile-avatar-img secure-bg-avatar"
                style={{ backgroundImage: `url(${user.profilePic})` }}
                onContextMenu={preventContextMenu}
              />
            ) : (
              <div className="profile-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <span className="user-welcome">{user.name}</span>
          </div>
        )}
      </header>

      {/* Category Bar */}
      {activePage === 'marketplace' && <nav className="category-bar" aria-label="Listing categories">
        {CATEGORY_OPTIONS.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`cat-btn ${selectedCategory === cat.key ? 'active' : ''}`}
            aria-pressed={selectedCategory === cat.key}
            onClick={() => setSelectedCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </nav>}

      {/* Main Content Area */}
      <main className="main-content">
        {activePage === 'marketplace' ? (
          <>
        <h2>
          {searchQuery.trim()
            ? 'Search Results'
            : selectedCategory === 'ALL'
              ? 'Recent Listings'
              : `${CATEGORY_OPTIONS.find((category) => category.key === selectedCategory)?.label || 'Other'} Listings`}
        </h2>

        <div className="listing-sort-control">
          <label htmlFor="listing-sort">Sort by</label>
          <select
            id="listing-sort"
            value={listingSort}
            onChange={(event) => setListingSort(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </div>

        {loading ? (
          <p className="loading-text">Loading listings...</p>
        ) : itemsLoadError ? (
          <div className="no-items" role="alert">
            <p>{itemsLoadError}</p>
            <button type="button" className="btn-resend-verification" onClick={fetchItems}>
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="no-items">
            <p>No listings match your search or selected category.</p>
            {(searchQuery || selectedCategory !== 'ALL') && (
              <button
                type="button"
                className="clear-filters-button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                }}
              >
                Clear search and category filters
              </button>
            )}
          </div>
        ) : (
          <div className="items-grid">
            {sortedItems.map((item) => (
              <div className="item-card" key={item._id}>
                <div className="image-container">
                  <img
                    src={
                      item.images && item.images.length > 0
                        ? item.images[0]
                        : 'https://via.placeholder.com/250x200?text=MU+Bazar'
                    }
                    alt={item.title}
                  />
                  <span className="price-tag">₹{item.price}</span>
                  {item.isSold && <span className="public-sold-badge">SOLD</span>}
                </div>

                <div className="card-body">
                  <h3>{item.title}</h3>
                  <p className="description">{item.description}</p>

                  <div className="seller-profile-row">
                    {item.seller?.profilePic ? (
                      <div
                        className="seller-avatar-img secure-bg-avatar"
                        style={{ backgroundImage: `url(${item.seller.profilePic})` }}
                        onContextMenu={preventContextMenu}
                      />
                    ) : (
                      <div className="seller-avatar-small">
                        {item.seller?.name ? item.seller.name.charAt(0).toUpperCase() : 'S'}
                      </div>
                    )}
                    <div className="seller-text-details">
                      <span className="seller-name">{item.seller?.name || 'MU Student'}</span>
                      <span className="seller-info">
                        {item.seller?.residencyType === 'outsider'
                          ? 'Outsider'
                          : [
                            item.seller?.hostelName,
                            item.seller?.hostelBlock && `Block ${item.seller.hostelBlock}`,
                            item.seller?.roomNumber && `Room ${item.seller.roomNumber}`,
                          ].filter(Boolean).join(' · ') || 'Hosteler'}
                      </span>
                    </div>
                  </div>

                  <div className="card-footer">
                    <span className="badge">{(item.condition || '').replace('_', ' ')}</span>
                    {item.isSold ? (
                      <span className="sold-badge">Sold</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-chat-seller"
                        onClick={() => handleMessageSeller(item)}
                      >
                        Message seller
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-report-listing"
                      onClick={() => handleReportListing(item)}
                    >
                      Report
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        ) : activePage === 'admin-reports' ? (
          isReportsAdmin ? (
            <AdminReports token={token} />
          ) : (
            <section className="products-page">
              <h2>Admin access required</h2>
              <p className="no-items">This page is only available to authorized report moderators.</p>
            </section>
          )
        ) : activePage === 'profile' && user ? (
          <section className="products-page profile-page" ref={profilePageRef}>
            <div className="products-page-heading">
              <div>
                <h2>My Profile</h2>
                <p>Manage your account details and marketplace activity.</p>
              </div>
              <button type="button" className="btn-cancel" onClick={() => setActivePage('marketplace')}>
                Back to marketplace
              </button>
            </div>
            <div className="profile-page-card">
              {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="profile-edit-form">
                  <h3>Edit Profile</h3>
                  <div className="profile-pic-upload">
                    {profileForm.profilePicPreview ? (
                      <div
                        className="profile-large-avatar-img secure-bg-avatar"
                        style={{ backgroundImage: `url(${profileForm.profilePicPreview})` }}
                        onContextMenu={preventContextMenu}
                      />
                    ) : (
                      <div className="profile-large-avatar">
                        {profileForm.name ? profileForm.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <label className="btn-upload-pic">
                      Change Profile Picture
                      <input type="file" accept="image/*" onChange={handleProfilePicChange} hidden />
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Phone Number"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    required
                  />
                  <select
                    aria-label="Residency type"
                    value={profileForm.residencyType}
                    onChange={(e) => setProfileForm({ ...profileForm, residencyType: e.target.value })}
                  >
                    <option value="hosteler">Hosteler</option>
                    <option value="outsider">Outsider</option>
                  </select>
                  {profileForm.residencyType === 'hosteler' && (
                    <>
                      <input
                        type="text"
                        placeholder="Hostel Name"
                        value={profileForm.hostelName}
                        onChange={(e) => setProfileForm({ ...profileForm, hostelName: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Hostel Block"
                        value={profileForm.hostelBlock}
                        onChange={(e) => setProfileForm({ ...profileForm, hostelBlock: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Room Number"
                        value={profileForm.roomNumber}
                        onChange={(e) => setProfileForm({ ...profileForm, roomNumber: e.target.value })}
                        required
                      />
                    </>
                  )}
                  <div className="profile-actions-row">
                    <button type="submit" className="btn-submit" disabled={isUpdatingProfile}>
                      {isUpdatingProfile ? 'Saving profile...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => setIsEditingProfile(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="profile-header">
                    {user.profilePic ? (
                      <div
                        className="profile-large-avatar-img secure-bg-avatar"
                        style={{ backgroundImage: `url(${user.profilePic})` }}
                        onContextMenu={preventContextMenu}
                      />
                    ) : (
                      <div className="profile-large-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <h2>{user.name}</h2>
                    <p className="profile-email">{user.email}</p>
                  </div>
                  <div className="profile-details">
                    <div className="detail-item">
                      <span>Phone:</span> <strong>{user.phone || 'N/A'}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Residency:</span>
                      <strong>
                        {user.residencyType === 'outsider'
                          ? 'Outsider'
                          : [
                            user.hostelName,
                            user.hostelBlock && `Block ${user.hostelBlock}`,
                            user.roomNumber && `Room ${user.roomNumber}`,
                          ].filter(Boolean).join(' · ') || 'Hosteler'}
                      </strong>
                    </div>
                  </div>
                  <div className="profile-actions-row">
                    <button
                      className="btn-edit-profile"
                      onClick={() => setActivePage('my-products')}
                    >
                      My Products ({myActiveListings.length})
                    </button>
                    <button
                      className="btn-edit-profile"
                      onClick={() => setActivePage('history')}
                    >
                      History ({mySoldHistoryListings.length})
                    </button>
                    <button className="btn-edit-profile" onClick={() => setIsEditingProfile(true)}>
                      Edit Profile
                    </button>
                    <button className="btn-logout-full" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="products-page">
            <div className="products-page-heading">
              <div>
                <h2>{activePage === 'my-products' ? 'My Products' : 'Product History'}</h2>
                <p>
                  {activePage === 'my-products'
                    ? 'Manage your active listings.'
                    : 'Products you have marked as sold.'}
                </p>
              </div>
              <div className="products-page-tabs">
                <button
                  type="button"
                  className={activePage === 'my-products' ? 'selected' : ''}
                  onClick={() => setActivePage('my-products')}
                >
                  My Products ({myActiveListings.length})
                </button>
                <button
                  type="button"
                  className={activePage === 'history' ? 'selected' : ''}
                  onClick={() => setActivePage('history')}
                >
                  History ({mySoldHistoryListings.length})
                </button>
              </div>
            </div>
            {myProductsLoading ? (
              <p className="loading-text">Loading your products...</p>
            ) : activePage === 'my-products' ? (
              myActiveListings.length === 0 ? (
                <p className="no-items">You don’t have any active products yet.</p>
              ) : (
                <ul className="my-items-list products-page-list">
                  {myActiveListings.map((item) => (
                    <li key={item._id} className="my-item-row">
                      <div className="item-info">
                        {item.images?.[0] && <img src={item.images[0]} alt="" />}
                        <span>
                          <strong>{item.title}</strong>
                          <small>₹{item.price} · {item.category.replace('_', ' ')}</small>
                          {item.isHidden && (
                            <small className="listing-hidden-notice">
                              Hidden from the marketplace pending admin review.
                            </small>
                          )}
                        </span>
                      </div>
                      <div className="action-buttons">
                        <button className="btn-modify" onClick={() => openEditModal(item)}>
                          Modify
                        </button>
                        <button className="btn-sold" onClick={() => handleToggleSold(item._id)}>
                          Mark as Sold
                        </button>
                        <button className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : mySoldHistoryListings.length === 0 ? (
              <p className="no-items">Your sold products will appear here.</p>
            ) : (
              <ul className="my-items-list products-page-list">
                {mySoldHistoryListings.map((item) => (
                  <li key={item._id} className="my-item-row sold-item-row">
                    <div className="item-info">
                      {item.images?.[0] && <img src={item.images[0]} alt="" />}
                      <span>
                        <span className="sold-badge">SOLD</span>
                        <strong>{item.title}</strong>
                        <small>₹{item.price} · Sold {new Date(item.updatedAt).toLocaleDateString()}</small>
                      </span>
                    </div>
                    <div className="action-buttons">
                      <button className="btn-relist" onClick={() => handleToggleSold(item._id)}>
                        Mark Active
                      </button>
                      <button className="btn-delete" onClick={() => handleDeleteProduct(item._id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {/* Modify Item Modal */}
      {editItemModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-btn" onClick={() => setEditItemModal(null)}>
              &times;
            </button>
            <h2>Modify Product</h2>
            <form onSubmit={handleModifySubmit}>
              <input
                type="text"
                placeholder="Title"
                value={editItemForm.title}
                onChange={(e) => setEditItemForm({ ...editItemForm, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                value={editItemForm.description}
                onChange={(e) =>
                  setEditItemForm({ ...editItemForm, description: e.target.value })
                }
                required
              />
              <input
                type="number"
                placeholder="Price (₹)"
                value={editItemForm.price}
                onChange={(e) => setEditItemForm({ ...editItemForm, price: e.target.value })}
                required
              />
              <select
                value={editItemForm.category}
                onChange={(e) => setEditItemForm({ ...editItemForm, category: e.target.value })}
              >
                <option value="BOOKS">Books & Notes</option>
                <option value="ELECTRONICS">Electronics</option>
                <option value="CLOTHING">Clothing</option>
                <option value="HOSTEL_ESSENTIALS">Hostel Essentials</option>
                <option value="OTHER">Others</option>
              </select>
              <select
                value={editItemForm.condition}
                onChange={(e) => setEditItemForm({ ...editItemForm, condition: e.target.value })}
              >
                <option value="NEW">Brand New</option>
                <option value="USED_LIKE_NEW">Used - Like New</option>
                <option value="USED_GOOD">Used - Good</option>
                <option value="USED_FAIR">Used - Fair</option>
              </select>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setEditItemForm({ ...editItemForm, images: e.target.files })}
              />
              <button type="submit" className="btn-submit" disabled={isModifyingItem}>
                {isModifyingItem ? 'Saving product...' : 'Save Modifications'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-btn" onClick={() => setShowAuthModal(false)}>
              &times;
            </button>
            <h2>{authMode === 'login' ? 'Login' : 'Register'}</h2>
            {authMessage && <p className="auth-form-message" role="status">{authMessage}</p>}
            {GOOGLE_CLIENT_ID && (
              <div className="google-auth-section">
                {authMode === 'register' && (
                  <div className="google-signup-profile">
                    <p>Choose your residency for Google sign-up</p>
                    <select
                      aria-label="Google signup residency type"
                      value={authForm.residencyType}
                      onChange={(e) => setAuthForm({ ...authForm, residencyType: e.target.value })}
                    >
                      <option value="hosteler">Hosteler</option>
                      <option value="outsider">Outsider</option>
                    </select>
                    {authForm.residencyType === 'hosteler' && (
                      <>
                        <input
                          aria-label="Google signup hostel name"
                          placeholder="Hostel Name"
                          value={authForm.hostelName}
                          onChange={(e) => setAuthForm({ ...authForm, hostelName: e.target.value })}
                        />
                        <input
                          aria-label="Google signup hostel block"
                          placeholder="Hostel Block"
                          value={authForm.hostelBlock}
                          onChange={(e) => setAuthForm({ ...authForm, hostelBlock: e.target.value })}
                        />
                        <input
                          aria-label="Google signup room number"
                          placeholder="Room Number"
                          value={authForm.roomNumber}
                          onChange={(e) => setAuthForm({ ...authForm, roomNumber: e.target.value })}
                        />
                      </>
                    )}
                  </div>
                )}
                {googleScriptLoaded ? (
                  <div ref={googleButtonRef} className="google-signin-button" />
                ) : (
                  <p className="registration-email-note">Loading Google sign-in...</p>
                )}
                <div className="auth-divider"><span>or use email</span></div>
              </div>
            )}
            <form onSubmit={handleAuth}>
              {authMode === 'register' && (
                <>
                  <div className="profile-pic-upload reg-pic-upload">
                    {authForm.profilePicPreview ? (
                      <div
                        className="profile-large-avatar-img secure-bg-avatar"
                        style={{ backgroundImage: `url(${authForm.profilePicPreview})` }}
                        onContextMenu={preventContextMenu}
                      />
                    ) : (
                      <div className="profile-large-avatar">
                        {authForm.name ? authForm.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <label className="btn-upload-pic">
                      Choose Profile Picture (Optional)
                      <input type="file" accept="image/*" onChange={handleRegisterPicChange} hidden />
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                    required
                  />
                  <select
                    aria-label="Residency type"
                    value={authForm.residencyType}
                    onChange={(e) => setAuthForm({ ...authForm, residencyType: e.target.value })}
                  >
                    <option value="hosteler">Hosteler</option>
                    <option value="outsider">Outsider</option>
                  </select>
                  {authForm.residencyType === 'hosteler' && (
                    <>
                      <input
                        type="text"
                        placeholder="Hostel Name"
                        value={authForm.hostelName}
                        onChange={(e) => setAuthForm({ ...authForm, hostelName: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Hostel Block"
                        value={authForm.hostelBlock}
                        onChange={(e) => setAuthForm({ ...authForm, hostelBlock: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Room Number"
                        value={authForm.roomNumber}
                        onChange={(e) => setAuthForm({ ...authForm, roomNumber: e.target.value })}
                        required
                      />
                    </>
                  )}
                </>
              )}
              <input
                type="email"
                placeholder={authMode === 'register' ? 'MU email (@marwadiuniversity.ac.in)' : 'Email'}
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                pattern={authMode === 'register' ? ".*@marwadiuniversity\\.ac\\.in" : undefined}
                title={authMode === 'register' ? 'Use your @marwadiuniversity.ac.in email address.' : undefined}
                required
              />
              {authMode === 'register' && (
                <p className="registration-email-note">
                  Registration is limited to MU students. Use your @marwadiuniversity.ac.in email.
                </p>
              )}
              <input
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
              <button type="submit" className="btn-submit">
                {authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </form>
            {authMode === 'login' && needsEmailVerification && (
              <button type="button" className="btn-resend-verification" onClick={handleResendVerification}>
                Resend verification email
              </button>
            )}
            <div className="switch-mode">
              {authMode === 'login' ? (
                <p>
                  No account?{' '}
                  <span onClick={() => {
                    setAuthMode('register');
                    setNeedsEmailVerification(false);
                    setAuthMessage('');
                  }}>Register here</span>
                </p>
              ) : (
                <p>
                  Have an account? <span onClick={() => {
                    setAuthMode('login');
                    setAuthMessage('');
                  }}>Login here</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post Modal */}
      {showPostModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-btn" onClick={() => setShowPostModal(false)}>
              &times;
            </button>
            <h2>Post Item</h2>
            <form onSubmit={handlePostSubmit}>
              <input
                type="text"
                placeholder="Title"
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                value={postForm.description}
                onChange={(e) => setPostForm({ ...postForm, description: e.target.value })}
                required
              />
              <input
                type="number"
                placeholder="Price (₹)"
                value={postForm.price}
                onChange={(e) => setPostForm({ ...postForm, price: e.target.value })}
                required
              />
              <select
                value={postForm.category}
                onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}
              >
                <option value="BOOKS">Books & Notes</option>
                <option value="ELECTRONICS">Electronics</option>
                <option value="CLOTHING">Clothing</option>
                <option value="HOSTEL_ESSENTIALS">Hostel Essentials</option>
                <option value="OTHER">Others</option>
              </select>
              <select
                value={postForm.condition}
                onChange={(e) => setPostForm({ ...postForm, condition: e.target.value })}
              >
                <option value="NEW">Brand New</option>
                <option value="USED_LIKE_NEW">Used - Like New</option>
                <option value="USED_GOOD">Used - Good</option>
                <option value="USED_FAIR">Used - Fair</option>
              </select>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setPostForm({ ...postForm, images: e.target.files })}
              />
              <button type="submit" className="btn-submit">
                Post Item
              </button>
            </form>
          </div>
        </div>
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
    </div>
  );
}

export default App;