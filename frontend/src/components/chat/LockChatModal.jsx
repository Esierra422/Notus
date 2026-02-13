/**
 * Modal for creating or entering PIN to lock/unlock chat.
 */
import { useState } from 'react'
import { LockIcon, XIcon } from '../ui/Icons'
import { Button } from '../ui/Button'
import './LockChatModal.css'

export function LockChatModal({ mode, onClose, onSubmit, error: externalError }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const err = externalError || error

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    const p = pin.replace(/\D/g, '')
    if (mode === 'create') {
      if (p.length < 4) {
        setError('PIN must be at least 4 digits')
        return
      }
      if (p !== confirmPin.replace(/\D/g, '')) {
        setError('PINs do not match')
        return
      }
    } else {
      if (!p) {
        setError('Enter your PIN')
        return
      }
    }
    setLoading(true)
    try {
      await onSubmit(mode === 'create' ? p : p)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lock-chat-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lock-chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lock-chat-header">
          <LockIcon size={24} className="lock-chat-icon" />
          <h3>{mode === 'create' ? 'Create PIN' : 'Enter PIN'}</h3>
          <button type="button" className="lock-chat-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="lock-chat-body">
          <p className="lock-chat-desc">
            {mode === 'create'
              ? 'Create a PIN (4+ digits) to lock chats on this device.'
              : 'Enter your PIN to unlock this chat.'}
          </p>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="auth-input lock-chat-pin"
            maxLength={8}
            autoFocus
          />
          {mode === 'create' && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="auth-input lock-chat-pin"
              maxLength={8}
            />
          )}
          {err && <p className="auth-error lock-chat-error">{err}</p>}
          <div className="lock-chat-actions">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? '…' : mode === 'create' ? 'Create' : 'Unlock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
