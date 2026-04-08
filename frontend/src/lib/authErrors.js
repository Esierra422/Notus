/**
 * Map Firebase Auth errors to short, user-facing strings (avoid raw "Firebase: Error (auth/…)" text).
 */
export function firebaseAuthErrorMessage(err, { isSignUp = false } = {}) {
  const code = typeof err?.code === 'string' ? err.code : ''

  if (!isSignUp) {
    switch (code) {
      case 'auth/wrong-password':
        return 'That password is incorrect. Please try again.'
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
        return 'Incorrect email or password. Please try again.'
      case 'auth/invalid-email':
        return 'Enter a valid email address.'
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact support if you need help.'
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a few minutes and try again.'
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.'
      default:
        break
    }
  } else {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account already exists with this email. Try signing in instead.'
      case 'auth/invalid-email':
        return 'Enter a valid email address.'
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.'
      case 'auth/operation-not-allowed':
        return 'Email sign-up is not enabled. Contact support.'
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.'
      default:
        break
    }
  }

  const raw = typeof err?.message === 'string' ? err.message.trim() : ''
  if (raw && !/^Firebase:\s*Error\s*\(auth\//i.test(raw)) {
    return raw
  }

  return isSignUp ? 'Could not create your account. Please try again.' : 'Could not sign you in. Please try again.'
}
