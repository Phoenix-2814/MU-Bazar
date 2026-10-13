import { GOOGLE_CLIENT_ID } from '../config';

export default function AuthModal({
  authForm,
  authMessage,
  authMode,
  handlePasswordReset,
  handlePasswordResetRequest,
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
  const isLogin = authMode === 'login';
  const isRegister = authMode === 'register';
  const isForgotPassword = authMode === 'forgotPassword';
  const isResetPassword = authMode === 'resetPassword';
  const isRecoveryMode = isForgotPassword || isResetPassword;

  const title = isRegister
    ? 'Register'
    : isForgotPassword
      ? 'Forgot password'
      : isResetPassword
        ? 'Reset password'
        : 'Login';

  const handleSubmit = isForgotPassword
    ? handlePasswordResetRequest
    : isResetPassword
      ? handlePasswordReset
      : handleAuth;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-btn" onClick={() => setShowAuthModal(false)}>
          &times;
        </button>
        <h2>{title}</h2>
        {authMessage && <p className="auth-form-message" role="status">{authMessage}</p>}
        {!isRecoveryMode && GOOGLE_CLIENT_ID && (
          <div className="google-auth-section">
            {isRegister && (
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
                    <p className="hostel-privacy-note">
                      Note: Your room number and block is not visible to anyone. It is only for validation and security purposes.
                    </p>
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
        <form onSubmit={handleSubmit}>
          {isRegister && (
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
                  <p className="hostel-privacy-note">
                    Note: Your room number and block is not visible to anyone. It is only for validation and security purposes.
                  </p>
                </>
              )}
            </>
          )}
          {(isRegister || isLogin || isForgotPassword) && (
            <input
              type="email"
              placeholder={isRegister || isForgotPassword ? 'MU email (@marwadiuniversity.ac.in)' : 'Email'}
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              pattern={isRegister || isForgotPassword ? ".*@marwadiuniversity\\.ac\\.in" : undefined}
              title={isRegister || isForgotPassword ? 'Use your @marwadiuniversity.ac.in email address.' : undefined}
              required
            />
          )}
          {isRegister && (
            <p className="registration-email-note">
              Registration is limited to MU students. Use your @marwadiuniversity.ac.in email.
            </p>
          )}
          {!isForgotPassword && (
            <input
              type="password"
              placeholder={isResetPassword ? 'New password' : 'Password'}
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              minLength={isRegister || isResetPassword ? 8 : undefined}
              maxLength={isRegister || isResetPassword ? 128 : undefined}
              required
            />
          )}
          {isResetPassword && (
            <input
              type="password"
              placeholder="Confirm new password"
              value={authForm.passwordConfirmation}
              onChange={(e) => setAuthForm({ ...authForm, passwordConfirmation: e.target.value })}
              minLength={8}
              maxLength={128}
              required
            />
          )}
          <button type="submit" className="btn-submit">
            {isRegister ? 'Register' : isForgotPassword ? 'Send reset link' : isResetPassword ? 'Reset password' : 'Login'}
          </button>
        </form>
        {isLogin && (
          <button
            type="button"
            className="auth-mode-link"
            onClick={() => {
              setAuthMode('forgotPassword');
              setNeedsEmailVerification(false);
              setAuthMessage('');
            }}
          >
            Forgot password?
          </button>
        )}
        {isLogin && needsEmailVerification && (
          <button type="button" className="btn-resend-verification" onClick={handleResendVerification}>
            Resend verification email
          </button>
        )}
        <div className="switch-mode">
          {isLogin || isForgotPassword || isResetPassword ? (
            <p>
              {isLogin ? 'No account? ' : 'Remembered your password? '}
              <button type="button" className="auth-mode-link" onClick={() => {
                setAuthMode('login');
                setAuthMessage('');
              }}>Login here</button>
              {isLogin && (
                <>
                  {' '}
                  <span aria-hidden="true">|</span>
                  {' '}
                  <button type="button" className="auth-mode-link" onClick={() => {
                    setAuthMode('register');
                    setNeedsEmailVerification(false);
                    setAuthMessage('');
                  }}>Register here</button>
                </>
              )}
            </p>
          ) : (
            <p>
              Have an account? <button type="button" className="auth-mode-link" onClick={() => {
                setAuthMode('login');
                setAuthMessage('');
              }}>Login here</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
