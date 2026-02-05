import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import { ensureUserDoc, getUserDoc, getNextProfileField, getMissingProfileFieldsCount, updateProfileField } from '../lib/userService'
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

export function LoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [lastDirection, setLastDirection] = useState('forward')
  const [email, setEmail] = useState('')
  const [provider, setProvider] = useState(null)
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
      if (doc.onboardingComplete) {
        navigate('/app')
        return
      }
      setProvider('google')
      const missing = getMissingProfileFieldsCount(doc)
      setTotalSteps(2 + missing)
      setStep(2)
    } catch (err) {
      setError(err.message || 'Log in failed.')
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

  const handleEmail = () => {
    goNext()
  }

  const handleEmailSubmit = (submittedEmail) => {
    setEmail(submittedEmail)
    goNext()
  }

  const handlePasswordSubmit = async (password) => {
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      const user = auth.currentUser
      await ensureUserDoc(user, ['password'])
      navigate('/app')
    } catch (err) {
      setError(err.message || 'Log in failed.')
      throw err
    }
  }

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
                title="Log in"
                subtitle="Sign in to continue to your workspace."
                googleLabel="Log in with Google"
                emailLabel="Log in with Email"
                onGoogle={handleGoogle}
                onEmail={handleEmail}
                error={error}
                footerLink={{ to: '/signup', label: "Don't have an account? Sign up" }}
              />
            )}
            {step === 2 && provider !== 'google' && (
              <AuthStepEmail
                title="Sign in"
                onSubmit={handleEmailSubmit}
                onBack={goBack}
              />
            )}
            {step === 3 && !provider && (
              <AuthStepPassword
                email={email}
                isSignUp={false}
                onSubmit={handlePasswordSubmit}
                onBack={goBack}
              />
            )}
            {step >= 2 && provider === 'google' && userDoc && (() => {
              const next = getNextProfileField(userDoc)
              if (!next) return null
              return next.key === 'profilePicture' ? (
                <AuthStepProfilePicture
                  onSave={handleProfileSave}
                  onBack={step === 2 ? undefined : goBack}
                  onSkip={handleProfileSkip}
                />
              ) : (
                <AuthStepProfile
                  field={next.key}
                  label={next.label}
                  onSave={handleProfileSave}
                  onBack={step === 2 ? undefined : goBack}
                />
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
