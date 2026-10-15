import { Bell, Box, History, LogOut, MessageCircle, Search, UserRound } from 'lucide-react';

export default function Navbar({
  activePage,
  browserNotificationPermission,
  handleLogout,
  handleNotificationClick,
  handleOpenMessages,
  isReportsAdmin,
  markAllNotificationsRead,
  myActiveListings,
  mySoldHistoryListings,
  notificationButtonRef,
  notifications,
  preventContextMenu,
  profileDropdownRef,
  profileMenuButtonRef,
  requestBrowserNotifications,
  searchQuery,
  setActivePage,
  setAuthMode,
  setIsEditingProfile,
  setSearchQuery,
  setSelectedCategory,
  setShowAuthModal,
  setShowNotifications,
  setShowPostModal,
  setShowProfileDropdown,
  showNotifications,
  showProfileDropdown,
  unreadMessageCount,
  unreadNotificationCount,
  user,
}) {
  return (
    <header className="navbar">
      <a
        href="/"
        className="brand"
        aria-label="MU Bazar home"
        onClick={(event) => {
          event.preventDefault();
          setActivePage('marketplace');
          setSelectedCategory('ALL');
        }}
      >
        <img src="/logo.png" alt="MU Bazar Logo" className="navbar-logo" />
        <div className="brand-text">
          <h1>MU BAZAR</h1>
          <span className="tagline">Marwadi University Campus Marketplace</span>
        </div>
      </a>

      <div className="search-bar">
        <Search className="search-icon" size={18} aria-hidden="true" />
        <input
          type="text"
          aria-label="Search products"
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
            <button className="btn-sell nav-message-button" onClick={handleOpenMessages}>
              <MessageCircle size={16} aria-hidden="true" />
              <span>Messages</span>
              {unreadMessageCount > 0 && (
                <span className="unread-message-dot" aria-label="You have unread messages" />
              )}
            </button>
            {isReportsAdmin && (
              <>
                <button
                  className={`btn-sell ${activePage === 'admin-dashboard' ? 'nav-button-active' : ''}`}
                  onClick={() => setActivePage('admin-dashboard')}
                >
                  ADMIN
                </button>
                <button
                  className={`btn-sell ${activePage === 'admin-reports' ? 'nav-button-active' : ''}`}
                  onClick={() => setActivePage('admin-reports')}
                >
                  REPORTS
                </button>
                <button
                  className={`btn-sell ${activePage === 'admin-users' ? 'nav-button-active' : ''}`}
                  onClick={() => setActivePage('admin-users')}
                >
                  USERS
                </button>
              </>
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
          ref={notificationButtonRef}
          aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
          aria-expanded={showNotifications}
          aria-controls="notification-panel"
          onClick={() => setShowNotifications((showing) => !showing)}
        >
          <Bell size={16} aria-hidden="true" />
          <span>Notifications</span>
          {unreadNotificationCount > 0 && (
            <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
          )}
        </button>
      </div>
      {showNotifications && (
        <section id="notification-panel" className="notification-panel" aria-label="Notifications">
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
                  {notification.type === 'message' ? 'Message' : 'New product'}
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
        <div className="profile-menu-container" ref={profileDropdownRef}>
          <button
            type="button"
            className="profile-badge"
            ref={profileMenuButtonRef}
            aria-label={`Profile menu for ${user.name || 'user'}`}
            aria-expanded={showProfileDropdown}
            aria-controls="profile-dropdown"
            onClick={() => setShowProfileDropdown((open) => !open)}
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
          </button>
          {showProfileDropdown && (
            <section id="profile-dropdown" className="profile-dropdown" aria-label="Profile menu">
              <p className="profile-dropdown-label">YOUR ACCOUNT</p>
              <button
                type="button"
                className="profile-dropdown-action"
                onClick={() => {
                  setShowProfileDropdown(false);
                  setActivePage('my-products');
                }}
              >
                <Box size={17} aria-hidden="true" />
                <span>My Products</span>
                <span className="profile-menu-count">{myActiveListings.length}</span>
              </button>
              <button
                type="button"
                className="profile-dropdown-action"
                onClick={() => {
                  setShowProfileDropdown(false);
                  setActivePage('history');
                }}
              >
                <History size={17} aria-hidden="true" />
                <span>History</span>
                <span className="profile-menu-count">{mySoldHistoryListings.length}</span>
              </button>
              <button
                type="button"
                className="profile-dropdown-action"
                onClick={() => {
                  setIsEditingProfile(false);
                  setShowProfileDropdown(false);
                  setActivePage('profile');
                }}
              >
                <UserRound size={17} aria-hidden="true" />
                My Profile
              </button>
              <button type="button" className="profile-dropdown-logout" onClick={() => {
                setShowProfileDropdown(false);
                handleLogout();
              }}>
                <LogOut size={17} aria-hidden="true" />
                Logout
              </button>
            </section>
          )}
        </div>
      )}
    </header>
  );
}
