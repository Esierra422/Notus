import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import {
  getOrg,
  getMembership,
  getOrgMembers,
  getPendingRequests,
  updateMembershipState,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { createOrgInvitation } from '../lib/invitationService'
import { getUserDoc, getDisplayName, getMemberDisplayLine } from '../lib/userService'
import { AppHeader, AppFooter } from '../components/app'
import '../styles/variables.css'
import './AppLayout.css'
import './OrgAdminPage.css'

export function OrgAdminPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [loading, setLoading] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login')
        return
      }
      setUser(u)
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!user || !orgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
      ])
      if (!orgData || !memData || memData.state !== 'active') {
        navigate(`/app/org/${orgId}`)
        return
      }
      if (!canManageOrg(memData)) {
        navigate(`/app/org/${orgId}`)
        return
      }
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, orgId, navigate])

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      const [membersData, pendingData] = await Promise.all([
        getOrgMembers(orgId),
        getPendingRequests(orgId),
      ])
      setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      setPending(pendingData)
      const userIds = [...new Set([
        ...membersData.map((m) => m.userId),
        ...pendingData.map((p) => p.userId),
      ])]
      const profiles = {}
      await Promise.all(userIds.map(async (uid) => {
        profiles[uid] = await getUserDoc(uid)
      }))
      setUserProfiles(profiles)
    }
    load()
  }, [orgId])

  const handleApprove = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateMembershipState(orgId, userId, MEMBERSHIP_STATES.active)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setMembers((m) => [...m, { userId, role: 'member', state: MEMBERSHIP_STATES.active }])
      const profile = await getUserDoc(userId)
      setUserProfiles((p) => ({ ...p, [userId]: profile }))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    const email = inviteEmail.trim()
    if (!email) {
      setInviteError('Enter an email address.')
      return
    }
    setInviteLoading(true)
    try {
      const inviterProfile = userProfiles[user.uid] || null
      const inviterLabel = getMemberDisplayLine(inviterProfile, user.uid, user, null)
      await createOrgInvitation(
        orgId,
        email,
        user.uid,
        inviterLabel || getDisplayName(inviterProfile, user.uid),
        inviterProfile?.email || user.email || '',
        org.name
      )
      setInviteSuccess(`Invitation sent to ${email}.`)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err.message || 'Failed to send invitation.')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleReject = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateMembershipState(orgId, userId, MEMBERSHIP_STATES.rejected)
      setPending((p) => p.filter((m) => m.userId !== userId))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  if (!org || !membership) return null

  const navExtra = (
    <Link to={`/app/org/${orgId}`} className="app-nav-link">← {org.name}</Link>
  )

  return (
    <div className="app-layout">
      <AppHeader user={user} navExtra={navExtra} />
      <main className="app-main org-admin-main">
        <h2>Admin</h2>

        <section className="org-admin-section">
          <h3>Invite by email</h3>
          <form onSubmit={handleInvite} className="org-admin-invite-form">
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="org-admin-invite-input"
              disabled={inviteLoading}
            />
            <button type="submit" className="org-admin-btn org-admin-btn-approve" disabled={inviteLoading}>
              {inviteLoading ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
          {inviteError && <p className="org-admin-error">{inviteError}</p>}
          {inviteSuccess && <p className="org-admin-success">{inviteSuccess}</p>}
        </section>

        <section className="org-admin-section">
          <h3>Pending join requests</h3>
          {pending.length === 0 ? (
            <p className="app-muted">No pending requests.</p>
          ) : (
            <ul className="org-admin-list">
              {pending.map((req) => (
                <li key={req.userId} className="org-admin-list-item">
                  <span>{getMemberDisplayLine(userProfiles[req.userId], req.userId, req.userId === user?.uid ? user : null, 'pending')}</span>
                  <div className="org-admin-actions">
                    <button
                      className="org-admin-btn org-admin-btn-approve"
                      onClick={() => handleApprove(req.userId)}
                      disabled={loading[req.userId]}
                    >
                      {loading[req.userId] ? '…' : 'Approve'}
                    </button>
                    <button
                      className="org-admin-btn org-admin-btn-reject"
                      onClick={() => handleReject(req.userId)}
                      disabled={loading[req.userId]}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="org-admin-section">
          <h3>Members</h3>
          <ul className="org-admin-list">
            {members.map((m) => (
              <li key={m.userId} className="org-admin-list-item">
                <span>{getMemberDisplayLine(userProfiles[m.userId], m.userId, m.userId === user?.uid ? user : null, m.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <AppFooter />
    </div>
  )
}
