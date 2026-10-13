export default function ProfilePage({
  handleLogout,
  handleProfilePicChange,
  handleUpdateProfile,
  isEditingProfile,
  isUpdatingProfile,
  preventContextMenu,
  profileForm,
  profilePageRef,
  setActivePage,
  setIsEditingProfile,
  setProfileForm,
  user,
}) {
  return (
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
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleProfilePicChange} hidden />
              </label>
            </div>
            <input
              type="text"
              placeholder="Full Name"
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              minLength="2"
              maxLength="100"
              required
            />
            <input
              type="text"
              placeholder="Phone Number"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              maxLength="30"
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
                <p className="hostel-privacy-note">
                  Note: Your room number and block is not visible to anyone. It is only for validation and security purposes.
                </p>
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
  );
}
