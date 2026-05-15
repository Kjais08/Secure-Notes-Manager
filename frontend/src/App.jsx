import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './App.css';

const getApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredUrl) return configuredUrl;

  return `http://${window.location.hostname}:8000`;
};

const API_BASE_URL = getApiBaseUrl();
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
const INDIA_TIME_ZONE = 'Asia/Kolkata';
const SENSITIVE_PATTERN = /\b(password|passcode|secret|token|api\s*key|otp|pin|private\s*key|credential)\b/i;

const isSensitiveText = (text) => SENSITIVE_PATTERN.test(text);

const getInitialShareToken = () => new URLSearchParams(window.location.search).get('share') || '';

const getShareUrl = (shareToken) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('share', shareToken);
  return url.toString();
};

const getSafeFileName = (value) => {
  const fileName = value.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase();
  return fileName || 'shared-note';
};

const formatTimer = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatDate = (value) => {
  if (!value) return 'Not recorded';

  const timestamp =
    typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)
      ? `${value}Z`
      : value;
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return 'Not recorded';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const getPasswordStrength = (value) => {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (!value) return { score: 0, label: 'Waiting', className: 'strength-empty' };
  if (score <= 1) return { score: 1, label: 'Weak', className: 'strength-weak' };
  if (score <= 3) return { score: 3, label: 'Good', className: 'strength-good' };
  return { score: 4, label: 'Strong', className: 'strength-strong' };
};

function App() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [notes, setNotes] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeView, setActiveView] = useState('notes');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [revealedNotes, setRevealedNotes] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [pendingDeleteNote, setPendingDeleteNote] = useState(null);
  const [sharingNote, setSharingNote] = useState(null);
  const [sharePassword, setSharePassword] = useState('');
  const [shareResult, setShareResult] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sharedToken] = useState(getInitialShareToken);
  const [sharedPassword, setSharedPassword] = useState('');
  const [sharedNote, setSharedNote] = useState(null);
  const [sharedMessage, setSharedMessage] = useState('');
  const [timeUntilLogout, setTimeUntilLogout] = useState(INACTIVITY_LIMIT_MS);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [timeSpent, setTimeSpent] = useState(0);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showSecurityAnswer, setShowSecurityAnswer] = useState(false);
  const [showRecoveryAnswer, setShowRecoveryAnswer] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSharePassword, setShowSharePassword] = useState(false);
  const [showSharedPassword, setShowSharedPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isUnlockingSharedNote, setIsUnlockingSharedNote] = useState(false);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const handleLogout = useCallback((reason) => {
    setToken('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setPassword('');
    setNotes([]);
    setAuditLogs([]);
    setShowTitleInput(false);
    setNoteTitle('');
    setNewNoteContent('');
    setRevealedNotes({});
    setEditingNoteId(null);
    setEditTitle('');
    setEditContent('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSettingsMessage('');
    setTimeUntilLogout(INACTIVITY_LIMIT_MS);
    setTimeSpent(0);
    setSessionStartedAt(Date.now());
    setActiveView('notes');
    setMessage(typeof reason === 'string' ? reason : '');
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/notes`, {
        headers: authHeaders,
      });
      setNotes(response.data);
    } catch (error) {
      console.error('Failed to fetch notes', error);
      if (error.response?.status === 401) handleLogout('Session expired. Please log in again.');
      else setMessage('Could not load notes from the vault.');
    }
  }, [authHeaders, handleLogout]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/audit-logs`, {
        headers: authHeaders,
      });
      setAuditLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
      if (error.response?.status === 401) handleLogout('Session expired. Please log in again.');
    }
  }, [authHeaders, handleLogout]);

  useEffect(() => {
    if (token) {
      // Fetching here restores the vault when a saved token exists.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchNotes();
    }
  }, [fetchNotes, token]);

  useEffect(() => {
    if (token && activeView === 'audit') {
      // Audit is an authenticated server view, loaded only when opened.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAuditLogs();
    }
  }, [activeView, fetchAuditLogs, token]);

  useEffect(() => {
    if (!token) return undefined;

    let timeoutId;
    let intervalId;
    let expiresAt = Date.now() + INACTIVITY_LIMIT_MS;

    const updateTimer = () => {
      const now = Date.now();
      setTimeUntilLogout(expiresAt - now);
      setTimeSpent(now - sessionStartedAt);
    };

    const resetTimer = () => {
      expiresAt = Date.now() + INACTIVITY_LIMIT_MS;
      updateTimer();
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleLogout('Auto logged out after 10 minutes of inactivity.');
      }, INACTIVITY_LIMIT_MS);
    };

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer));
    resetTimer();
    intervalId = window.setInterval(updateTimer, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [handleLogout, sessionStartedAt, token]);

  const registerStrength = getPasswordStrength(password);
  const newPasswordStrength = getPasswordStrength(newPassword);
  const recoveryPasswordStrength = getPasswordStrength(recoveryNewPassword);
  const newNoteIsSensitive = isSensitiveText(`${noteTitle} ${newNoteContent}`);

  const filteredNotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return notes.filter((note) => {
      const noteIsSensitive = isSensitiveText(`${note.title} ${note.content}`);
      const matchesFilter =
        filterMode === 'all' ||
        (filterMode === 'sensitive' && noteIsSensitive) ||
        (filterMode === 'encrypted' && !noteIsSensitive);
      const matchesSearch =
        !query ||
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [filterMode, notes, searchTerm]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      if (isLoginMode) {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await axios.post(`${API_BASE_URL}/login`, formData);
        const accessToken = response.data.access_token;
        setToken(accessToken);
        localStorage.setItem('token', accessToken);
        localStorage.setItem('username', username);
        setSessionStartedAt(Date.now());
        setTimeSpent(0);
        setPassword('');
      } else {
        await axios.post(`${API_BASE_URL}/register`, {
          username,
          password,
          security_question: securityQuestion,
          security_answer: securityAnswer,
        });
        setMessage('Account created. You can enter the vault now.');
        setIsLoginMode(true);
        setPassword('');
        setSecurityQuestion('');
        setSecurityAnswer('');
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Authentication failed.');
    }
  };

  const handleRequestRecoveryQuestion = async (e) => {
    e.preventDefault();
    setRecoveryMessage('');
    setRecoveryQuestion('');

    try {
      const response = await axios.post(`${API_BASE_URL}/recovery/question`, {
        username: recoveryUsername,
      });
      setRecoveryQuestion(response.data.security_question);
    } catch (error) {
      setRecoveryMessage(error.response?.data?.detail || 'Could not find a recovery question.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setRecoveryMessage('');

    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryMessage('New password and confirmation do not match.');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/recovery/reset-password`, {
        username: recoveryUsername,
        security_answer: recoveryAnswer,
        new_password: recoveryNewPassword,
      });
      setRecoveryMessage('Password reset successfully. You can log in now.');
      setPassword('');
      setIsRecoveryMode(false);
      setIsLoginMode(true);
      setUsername(recoveryUsername);
      setRecoveryQuestion('');
      setRecoveryAnswer('');
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
    } catch (error) {
      setRecoveryMessage(error.response?.data?.detail || 'Could not reset password.');
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    setIsSaving(true);
    setMessage('');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/notes`,
        {
          title: noteTitle.trim() || 'Untitled note',
          content: newNoteContent.trim(),
        },
        { headers: authHeaders },
      );
      setNotes((currentNotes) => [response.data, ...currentNotes]);
      setNoteTitle('');
      setNewNoteContent('');
      setShowTitleInput(false);
    } catch (error) {
      console.error('Failed to save note', error);
      setMessage(error.response?.data?.detail || 'Could not save your note.');
    } finally {
      setIsSaving(false);
    }
  };

  const clearComposer = () => {
    setNoteTitle('');
    setNewNoteContent('');
    setShowTitleInput(false);
  };

  const toggleReveal = (noteId) => {
    setRevealedNotes((current) => ({
      ...current,
      [noteId]: !current[noteId],
    }));
  };

  const startEdit = (note) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setRevealedNotes((current) => ({
      ...current,
      [note.id]: true,
    }));
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleUpdateNote = async (noteId) => {
    if (!editContent.trim()) return;

    setIsUpdating(true);
    setMessage('');

    try {
      const response = await axios.put(
        `${API_BASE_URL}/notes/${noteId}`,
        {
          title: editTitle.trim() || 'Untitled note',
          content: editContent.trim(),
        },
        { headers: authHeaders },
      );
      setNotes((currentNotes) => currentNotes.map((note) => (
        note.id === noteId ? response.data : note
      )));
      cancelEdit();
    } catch (error) {
      console.error('Failed to update note', error);
      setMessage(error.response?.data?.detail || 'Could not update this note.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    setMessage('');

    try {
      await axios.delete(`${API_BASE_URL}/notes/${noteId}`, {
        headers: authHeaders,
      });
      setNotes((currentNotes) => currentNotes.filter((note) => note.id !== noteId));
      setRevealedNotes((current) => {
        const next = { ...current };
        delete next[noteId];
        return next;
      });
      if (editingNoteId === noteId) cancelEdit();
      setPendingDeleteNote(null);
    } catch (error) {
      console.error('Failed to delete note', error);
      setMessage(error.response?.data?.detail || 'Could not delete this note.');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSettingsMessage('');

    if (newPassword !== confirmPassword) {
      setSettingsMessage('New password and confirmation do not match.');
      return;
    }

    setIsChangingPassword(true);

    try {
      await axios.put(
        `${API_BASE_URL}/users/me/password`,
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
        { headers: authHeaders },
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSettingsMessage('Password changed successfully.');
      fetchAuditLogs();
    } catch (error) {
      console.error('Failed to change password', error);
      setSettingsMessage(error.response?.data?.detail || 'Could not change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const openShareDialog = (note) => {
    setSharingNote(note);
    setSharePassword('');
    setShareResult('');
    setShareMessage('');
  };

  const closeShareDialog = () => {
    setSharingNote(null);
    setSharePassword('');
    setShareResult('');
    setShareMessage('');
  };

  const handleCreateShareLink = async (e) => {
    e.preventDefault();
    if (!sharingNote) return;

    setIsSharing(true);
    setShareMessage('');
    setShareResult('');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/notes/${sharingNote.id}/share`,
        { password: sharePassword },
        { headers: authHeaders },
      );
      setShareResult(getShareUrl(response.data.share_token));
      setShareMessage('Share link created. Send the link and password separately.');
      fetchAuditLogs();
    } catch (error) {
      setShareMessage(error.response?.data?.detail || 'Could not create share link.');
    } finally {
      setIsSharing(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult);
      setShareMessage('Share link copied.');
    } catch {
      setShareMessage('Copy failed. Select and copy the link manually.');
    }
  };

  const downloadNoteFile = (note) => {
    if (!note) return;

    const noteText = [
      note.title,
      '',
      note.content,
      '',
      `Created: ${formatDate(note.created_at)}`,
      `Updated: ${formatDate(note.updated_at || note.created_at)}`,
    ].join('\n');
    const blob = new Blob([noteText], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${getSafeFileName(note.title)}.txt`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const handleUnlockSharedNote = async (e) => {
    e.preventDefault();
    setSharedMessage('');
    setIsUnlockingSharedNote(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/shared-notes/${sharedToken}/unlock`, {
        password: sharedPassword,
      });
      setSharedNote(response.data);
      setSharedPassword('');
    } catch (error) {
      setSharedMessage(error.response?.data?.detail || 'Could not unlock this shared note.');
    } finally {
      setIsUnlockingSharedNote(false);
    }
  };

  if (sharedToken) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-panel shared-panel">
          <div className="brand-block">
            <p className="eyebrow">Protected share</p>
            <h1>Unlock shared note</h1>
            <p className="auth-copy">Enter the share password given by the note owner.</p>
          </div>

          {!sharedNote ? (
            <form className="auth-form" onSubmit={handleUnlockSharedNote}>
              <label>
                <span>Share password</span>
                <div className="password-field">
                  <input
                    type={showSharedPassword ? 'text' : 'password'}
                    placeholder="Enter share password"
                    value={sharedPassword}
                    onChange={(e) => setSharedPassword(e.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowSharedPassword(!showSharedPassword)}>
                    {showSharedPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <button className="primary-button" disabled={isUnlockingSharedNote}>
                {isUnlockingSharedNote ? 'Unlocking...' : 'Unlock note'}
              </button>
            </form>
          ) : (
            <article className="shared-note-card">
              <span className="secure-badge">Unlocked</span>
              <h2>{sharedNote.title}</h2>
              <p>{sharedNote.content}</p>
              <div className="note-meta">
                <span>Created {formatDate(sharedNote.created_at)}</span>
                <span>Updated {formatDate(sharedNote.updated_at || sharedNote.created_at)}</span>
              </div>
              <button type="button" className="primary-button" onClick={() => downloadNoteFile(sharedNote)}>
                Download note
              </button>
            </article>
          )}

          {sharedMessage && <p className="form-message error">{sharedMessage}</p>}
        </section>
      </main>
    );
  }

  if (token) {
    return (
      <main className="app-shell dashboard-shell">
        <section className="dashboard-panel">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Encrypted command center</p>
              <h1>The vault is open</h1>
              <p className="dashboard-copy">Create, reveal, edit, search, share, and audit encrypted notes from one secure dashboard.</p>
            </div>

            <div className="user-actions">
              <span className="secure-badge">Secure session</span>
              <span className="session-timer">Time spent {formatTimer(timeSpent)}</span>
              <span className="session-user">Signed in as {username || 'user'}</span>
              <button className="ghost-button danger-button" onClick={() => handleLogout()}>Logout</button>
            </div>
          </header>

          <nav className="dashboard-tabs" aria-label="Dashboard views">
            <button className={activeView === 'notes' ? 'tab-button active' : 'tab-button'} onClick={() => setActiveView('notes')}>Notes</button>
            <button className={activeView === 'audit' ? 'tab-button active' : 'tab-button'} onClick={() => setActiveView('audit')}>Audit log</button>
            <button className={activeView === 'settings' ? 'tab-button active' : 'tab-button'} onClick={() => setActiveView('settings')}>Security</button>
          </nav>

          {activeView === 'notes' && (
            <>
              <section className="vault-grid">
                <aside className="status-panel">
                  <p className="eyebrow">System status</p>
                  <div className="status-row">
                    <span>API link</span>
                    <strong>Online</strong>
                  </div>
                  <div className="status-row">
                    <span>Encryption</span>
                    <strong>Fernet AES</strong>
                  </div>
                  <div className="status-row">
                    <span>Stored notes</span>
                    <strong>{notes.length}</strong>
                  </div>
                  <div className="status-row">
                    <span>Auto logout</span>
                    <strong>{formatTimer(timeUntilLogout)}</strong>
                  </div>
                </aside>

                <section className="compose-area" aria-label="Create secure note">
                  <div className="section-title-row">
                    <div>
                      <p className="eyebrow">New encrypted entry</p>
                      <h2>Write a sensitive note</h2>
                    </div>
                  </div>

                  <form onSubmit={handleCreateNote} className="note-form">
                    {showTitleInput ? (
                      <div className="title-input-row">
                        <input
                          type="text"
                          placeholder="Add note title"
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="ghost-button compact-button"
                          onClick={() => {
                            setShowTitleInput(false);
                            setNoteTitle('');
                          }}
                        >
                          Remove title
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="add-title-button"
                        onClick={() => setShowTitleInput(true)}
                      >
                        + Add title
                      </button>
                    )}
                    <textarea
                      placeholder="Type a private note..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      required
                      rows="5"
                    />
                    <div className={newNoteIsSensitive ? 'sensitivity-alert is-sensitive' : 'sensitivity-alert'}>
                      {newNoteIsSensitive
                        ? 'Sensitive text detected. It will stay hidden until revealed.'
                        : 'No sensitive keyword detected yet.'}
                    </div>
                    <div className="form-actions">
                      <button type="button" className="ghost-button" onClick={clearComposer}>Clear text</button>
                      <button type="submit" className="primary-button" disabled={isSaving}>
                        {isSaving ? 'Encrypting...' : 'Encrypt and save'}
                      </button>
                    </div>
                  </form>

                  {message && <p className="form-message error">{message}</p>}
                </section>
              </section>

              <section className="notes-section">
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">Sensitive records</p>
                    <h2>Note dashboard</h2>
                  </div>
                  <span className="note-count">
                    {filteredNotes.length} shown / {notes.length} total
                  </span>
                </div>

                <div className="toolbar">
                  <input
                    type="search"
                    placeholder="Search titles or hidden content"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
                    <option value="all">All notes</option>
                    <option value="sensitive">Sensitive only</option>
                    <option value="encrypted">Encrypted only</option>
                  </select>
                </div>

                {filteredNotes.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon" aria-hidden="true">+</span>
                    <h3>No notes match this view</h3>
                    <p>Create a note or adjust your search and filter.</p>
                  </div>
                ) : (
                  <div className="notes-grid">
                    {filteredNotes.map((note, index) => {
                      const isRevealed = Boolean(revealedNotes[note.id]);
                      const isEditing = editingNoteId === note.id;
                      const noteIsSensitive = isSensitiveText(`${note.title} ${note.content}`);

                      return (
                        <article key={note.id} className="note-card">
                          <div className="note-card-header">
                            <span className={noteIsSensitive ? 'sensitive-badge' : 'secure-badge'}>
                              {noteIsSensitive ? 'Sensitive' : 'Encrypted'}
                            </span>
                            <span className="note-id">#{index + 1}</span>
                          </div>

                          {isEditing ? (
                            <div className="edit-stack">
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                              />
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows="5"
                              />
                              <div className="note-actions">
                                <button
                                  type="button"
                                  className="primary-button compact-button"
                                  onClick={() => handleUpdateNote(note.id)}
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? 'Saving...' : 'Save edit'}
                                </button>
                                <button type="button" className="ghost-button compact-button" onClick={cancelEdit}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="note-title">{note.title}</h3>
                              <p className={isRevealed ? 'note-content' : 'note-content hidden-note'}>
                                {isRevealed ? note.content : 'Sensitive text hidden'}
                              </p>
                              <div className="note-meta">
                                <span>Created {formatDate(note.created_at)}</span>
                                <span>Updated {formatDate(note.updated_at || note.created_at)}</span>
                              </div>
                              <div className="note-actions">
                                <button
                                  type="button"
                                  className="ghost-button compact-button"
                                  onClick={() => toggleReveal(note.id)}
                                >
                                  {isRevealed ? 'Hide' : 'Reveal'}
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button compact-button"
                                  onClick={() => startEdit(note)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button compact-button"
                                  onClick={() => openShareDialog(note)}
                                >
                                  Share
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button danger-button compact-button"
                                  onClick={() => setPendingDeleteNote(note)}
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {activeView === 'audit' && (
            <section className="audit-panel">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Account activity</p>
                  <h2>Audit log</h2>
                </div>
                <button className="ghost-button compact-button" onClick={fetchAuditLogs}>Refresh</button>
              </div>

              <div className="audit-list">
                {auditLogs.length === 0 ? (
                  <div className="empty-state">
                    <h3>No audit activity yet</h3>
                    <p>Logins, note changes, deletes, shares, and password changes will show here.</p>
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div className="audit-row" key={log.id}>
                      <span>{log.action.replaceAll('_', ' ')}</span>
                      <strong>{formatDate(log.timestamp)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="settings-panel">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Security controls</p>
                  <h2>Account protection</h2>
                </div>
              </div>

              <form className="auth-form settings-form" onSubmit={handleChangePassword}>
                <label>
                  <span>Current password</span>
                  <div className="password-field">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  <span>New password</span>
                  <div className="password-field">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <div className={`strength-meter ${newPasswordStrength.className}`}>
                  <span style={{ width: `${newPasswordStrength.score * 25}%` }} />
                </div>
                <p className="strength-label">Strength: {newPasswordStrength.label}</p>
                <label>
                  <span>Confirm new password</span>
                  <div className="password-field">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <button type="submit" className="primary-button" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Updating...' : 'Update password'}
                </button>
              </form>

              {settingsMessage && (
                <p className={`form-message ${settingsMessage.includes('success') ? 'success' : 'error'}`}>
                  {settingsMessage}
                </p>
              )}
            </section>
          )}
        </section>

        {pendingDeleteNote && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Confirm delete">
              <p className="eyebrow">Delete confirmation</p>
              <h2>Delete this note?</h2>
              <p>This permanently removes "{pendingDeleteNote.title}" and any share links for it.</p>
              <div className="form-actions">
                <button className="ghost-button" onClick={() => setPendingDeleteNote(null)}>Cancel</button>
                <button className="primary-button danger-primary" onClick={() => handleDeleteNote(pendingDeleteNote.id)}>
                  Delete note
                </button>
              </div>
            </section>
          </div>
        )}

        {sharingNote && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Share note">
              <p className="eyebrow">Protected sharing</p>
              <h2>Share "{sharingNote.title}"</h2>
              <form className="auth-form" onSubmit={handleCreateShareLink}>
                <label>
                  <span>Share password</span>
                  <div className="password-field">
                    <input
                      type={showSharePassword ? 'text' : 'password'}
                      placeholder="Password required to open link"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowSharePassword(!showSharePassword)}>
                      {showSharePassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <div className="form-actions">
                  <button type="button" className="ghost-button" onClick={closeShareDialog}>Close</button>
                  <button className="primary-button" disabled={isSharing}>
                    {isSharing ? 'Creating...' : 'Create link'}
                  </button>
                </div>
              </form>

              {shareResult && (
                <>
                  <div className="share-result">
                    <input readOnly value={shareResult} />
                    <button className="ghost-button compact-button" onClick={copyShareLink}>Copy</button>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => downloadNoteFile(sharingNote)}
                    >
                      Download
                    </button>
                  </div>
                  <p className="share-network-note">
                    For another device, open this app with your computer's Wi-Fi IP address before creating the link.
                  </p>
                </>
              )}
              {shareMessage && <p className="form-message success">{shareMessage}</p>}
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-panel">
        <div className="login-visual" aria-hidden="true">
          <div className="scan-line" />
          <span>AUTH</span>
        </div>

        <div className="brand-block">
          <p className="eyebrow">Secure Notes</p>
          <h1>{isRecoveryMode ? 'Recover account' : isLoginMode ? 'Access the vault' : 'Create your vault'}</h1>
          <p className="auth-copy">
            Encrypted notes, password login, private recovery, and protected sharing for sensitive text.
          </p>
        </div>

        {isRecoveryMode ? (
          <div className="recovery-panel">
            {!recoveryQuestion ? (
              <form onSubmit={handleRequestRecoveryQuestion} className="auth-form">
                <label>
                  <span>User ID</span>
                  <input
                    type="text"
                    placeholder="Enter username"
                    value={recoveryUsername}
                    onChange={(e) => setRecoveryUsername(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" className="primary-button">Show security question</button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="auth-form">
                <div className="question-card">
                  <span>Security question</span>
                  <strong>{recoveryQuestion}</strong>
                </div>
                <label>
                  <span>Security answer</span>
                  <div className="password-field">
                    <input
                      type={showRecoveryAnswer ? 'text' : 'password'}
                      placeholder="Enter your answer"
                      value={recoveryAnswer}
                      onChange={(e) => setRecoveryAnswer(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowRecoveryAnswer(!showRecoveryAnswer)}>
                      {showRecoveryAnswer ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  <span>New password</span>
                  <div className="password-field">
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      placeholder="New password"
                      value={recoveryNewPassword}
                      onChange={(e) => setRecoveryNewPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}>
                      {showRecoveryPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <div className={`strength-meter ${recoveryPasswordStrength.className}`}>
                  <span style={{ width: `${recoveryPasswordStrength.score * 25}%` }} />
                </div>
                <p className="strength-label">Strength: {recoveryPasswordStrength.label}</p>
                <label>
                  <span>Confirm new password</span>
                  <input
                    type={showRecoveryPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={recoveryConfirmPassword}
                    onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" className="primary-button">Reset password</button>
              </form>
            )}

            {recoveryMessage && (
              <p className={`form-message ${recoveryMessage.includes('success') ? 'success' : 'error'}`}>
                {recoveryMessage}
              </p>
            )}
            <button
              type="button"
              className="switch-button"
              onClick={() => {
                setIsRecoveryMode(false);
                setRecoveryMessage('');
                setRecoveryQuestion('');
              }}
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <label>
                <span>Username</span>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>

              <label>
                <span>Password</span>
                <div className="password-field">
                  <input
                    type={showAuthPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowAuthPassword(!showAuthPassword)}>
                    {showAuthPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              {!isLoginMode && (
                <>
                  <div className={`strength-meter ${registerStrength.className}`}>
                    <span style={{ width: `${registerStrength.score * 25}%` }} />
                  </div>
                  <p className="strength-label">Strength: {registerStrength.label}</p>
                  <label>
                    <span>Custom security question</span>
                    <input
                      type="text"
                      placeholder="Example: What was your first school?"
                      value={securityQuestion}
                      onChange={(e) => setSecurityQuestion(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Security answer</span>
                    <div className="password-field">
                      <input
                        type={showSecurityAnswer ? 'text' : 'password'}
                        placeholder="Answer for account recovery"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        required
                      />
                      <button type="button" onClick={() => setShowSecurityAnswer(!showSecurityAnswer)}>
                        {showSecurityAnswer ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>
                </>
              )}

              <button type="submit" className="primary-button">
                {isLoginMode ? 'Unlock dashboard' : 'Create secure account'}
              </button>
            </form>

            {message && (
              <p className={`form-message ${isLoginMode ? 'error' : 'success'}`}>
                {message}
              </p>
            )}

            {isLoginMode && (
              <button
                type="button"
                className="switch-button"
                onClick={() => {
                  setIsRecoveryMode(true);
                  setRecoveryUsername(username);
                  setMessage('');
                }}
              >
                Forgot password?
              </button>
            )}

            <button
              type="button"
              className="switch-button"
              onClick={() => { setIsLoginMode(!isLoginMode); setMessage(''); }}
            >
              {isLoginMode ? "Need access? Register here." : 'Already registered? Login here.'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
