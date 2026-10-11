import { GOOGLE_CLIENT_ID } from '../config';

export default function AuthModal({
  authForm,
  authMessage,
  authMode,
  googleButtonRef,
  googleScriptLoaded,
  handleAuth,
  handleRegisterPicChange,
  handleResendVerification,
  needsEmailVerification,
  preventContextMenu,
  setAuthForm,
  setAuthMessage,
  setAuthMode,
  setNeedsEmailVerification,
  setShowAuthModal,
}) {
  return (
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
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleRegisterPicChange} hidden />
                </label>
              </div>
              <input
                type="text"
                placeholder="Full Name"
                value={authForm.name}
                onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                minLength="2"
                maxLength="100"
                required
              />
              <input
                type="text"
                placeholder="Phone"
                value={authForm.phone}
                onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                maxLength="30"
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
            minLength={authMode === 'register' ? 8 : undefined}
            maxLength={authMode === 'register' ? 128 : undefined}
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
  );
}
