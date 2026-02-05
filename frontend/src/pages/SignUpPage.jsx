import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import {
  ensureUserDoc,
  getUserDoc,
  getNextProfileField,
  getMissingProfileFieldsCount,
  updateProfileField,
} from '../lib/userService'
import {
  AuthChoiceStep,
  AuthStepEmail,
  AuthStepPassword,
  AuthStepProfile,
  AuthStepProfilePicture,
} from '../components/auth'
import { ArrowLeftIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AuthPage.css'

export function SignUpPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [lastDirection, setLastDirection] = useState('forward')
  const [provider, setProvider] = useState(null)
  const [email, setEmail] = useState('')
  const [userDoc, setUserDoc] = useState(null)
  const [totalSteps, setTotalSteps] = useState(3)
  const [error, setError] = useState('')

  const goNext = () => {
    setLastDirection('forward')
    setStep((s) => s + 1)
  }

  const goBack = () => {
    setLastDirection('back')
    setError('')
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleGoogle = async () => {
    setError('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      await ensureUserDoc(result.user, ['google'])
      const doc = await getUserDoc(result.user.uid)
      setUserDoc(doc)
      const next = getNextProfileField(doc)
      if (doc.onboardingComplete) {
        navigate('/app')
        return
      }
      setProvider('google')
      if (next) {
        const missing = getMissingProfileFieldsCount(doc)
        setTotalSteps(2 + missing)
        setStep(2)
      } else {
        navigate('/app')
      }
    } catch (err) {
      setError(err.message || 'Sign up failed.')
    }
  }

  const handleEmail = () => {
    setProvider('email')
    setTotalSteps(4)
    goNext()
  }

  const handleEmailSubmit = (submittedEmail) => {
    setEmail(submittedEmail)
    goNext()
  }

  const handlePasswordSubmit = async (password) => {
    setError('')
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      await ensureUserDoc(result.user, ['password'])
      const doc = await getUserDoc(result.user.uid)
      setUserDoc(doc)
      const next = getNextProfileField(doc)
      if (doc.onboardingComplete) {
        navigate('/app')
        return
      }
      if (next) {
        const missing = getMissingProfileFieldsCount(doc)
        setTotalSteps(4 + missing)
        setStep(4)
      } else {
        navigate('/app')
      }
    } catch (err) {
      setError(err.message || 'Sign up failed.')
      throw err
    }
  }

  const handleProfileSave = async (value) => {
    const next = getNextProfileField(userDoc)
    if (!next) return
    await updateProfileField(auth.currentUser.uid, next.key, value)
    const updated = await getUserDoc(auth.currentUser.uid)
    setUserDoc(updated)
    if (updated.onboardingComplete) {
      navigate('/app')
      return
    }
    const nextField = getNextProfileField(updated)
    if (nextField) setStep((s) => s + 1)
    else navigate('/app')
  }

  const handleProfileSkip = async () => {
    await handleProfileSave(
      getNextProfileField(userDoc)?.key === 'profilePicture' ? 'skipped' : ''
    )
  }

  const nextProfileField = userDoc ? getNextProfileField(userDoc) : null

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back">
        <ArrowLeftIcon size={18} />
        Back
      </Link>
      <div className="auth-container">
        <Link to="/" className="auth-logo">Notus</Link>
        <div className="auth-progress">
          <span className="auth-progress-text">Step {step} of {totalSteps}</span>
        </div>
        <div className={`auth-carousel auth-carousel--${lastDirection}`}>
          <div className="auth-step-wrap" key={step}>
            {step === 1 && (
              <AuthChoiceStep
                title="Sign up"
                subtitle="Create your account to get started."
                googleLabel="Sign up with Google"
                emailLabel="Sign up with Email"
                onGoogle={handleGoogle}
                onEmail={handleEmail}
                error={error}
                footerLink={{ to: '/login', label: 'Already have an account? Log in' }}
              />
            )}
            {step === 2 && provider === 'email' && (
              <AuthStepEmail
                title="Create account"
                onSubmit={handleEmailSubmit}
                onBack={goBack}
              />
            )}
            {step === 3 && provider === 'email' && (
              <AuthStepPassword
                email={email}
                isSignUp
                onSubmit={handlePasswordSubmit}
                onBack={goBack}
              />
            )}
            {step >= 4 && provider === 'email' && nextProfileField && (
              nextProfileField.key === 'profilePicture' ? (
                <AuthStepProfilePicture
                  onSave={handleProfileSave}
                  onBack={step === 4 ? undefined : goBack}
                  onSkip={handleProfileSkip}
                />
              ) : (
                <AuthStepProfile
                  field={nextProfileField.key}
                  label={nextProfileField.label}
                  onSave={handleProfileSave}
                  onBack={step === 4 ? undefined : goBack}
                />
              )
            )}
            {step >= 2 && provider === 'google' && nextProfileField && (
              nextProfileField.key === 'profilePicture' ? (
                <AuthStepProfilePicture
                  onSave={handleProfileSave}
                  onBack={step === 2 ? undefined : goBack}
                  onSkip={handleProfileSkip}
                />
              ) : (
                <AuthStepProfile
                  field={nextProfileField.key}
                  label={nextProfileField.label}
                  onSave={handleProfileSave}
                  onBack={step === 2 ? undefined : goBack}
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
