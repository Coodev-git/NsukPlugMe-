/* ============================================================
   NSUK PlugMe — Frontend API Client
   Connects the v2 website to the Node.js backend
   ============================================================ */

const API_BASE = 'http://localhost:5000/api';
const WS_URL   = 'http://localhost:5000';

// ── Token management ─────────────────────────────────────────
const Auth = {
  getToken:         () => localStorage.getItem('plugme_token'),
  getRefreshToken:  () => localStorage.getItem('plugme_refresh'),
  setTokens:        (token, refresh) => {
    localStorage.setItem('plugme_token', token);
    if (refresh) localStorage.setItem('plugme_refresh', refresh);
  },
  clear:            () => {
    localStorage.removeItem('plugme_token');
    localStorage.removeItem('plugme_refresh');
    localStorage.removeItem('plugme_user');
  },
  getUser:          () => JSON.parse(localStorage.getItem('plugme_user') || 'null'),
  setUser:          (user) => localStorage.setItem('plugme_user', JSON.stringify(user)),
  isLoggedIn:       () => !!localStorage.getItem('plugme_token'),
};

// ── Base fetch wrapper ────────────────────────────────────────
const api = async (endpoint, options = {}) => {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  // Auto-refresh token on 401
  if (res.status === 401 && Auth.getRefreshToken()) {
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: Auth.getRefreshToken() }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        Auth.setTokens(refreshData.data.token, refreshData.data.refreshToken);
        // Retry original request
        return api(endpoint, options);
      }
    } catch { /* fall through */ }
    Auth.clear();
    window.location.href = '/login.html';
    return;
  }

  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

// ── AUTH ─────────────────────────────────────────────────────
const authAPI = {
  register: (data) => api('/auth/register', { method: 'POST', body: data }),
  login:    (data) => api('/auth/login',    { method: 'POST', body: data }),
  logout:   ()     => api('/auth/logout',   { method: 'POST' }),
  me:       ()     => api('/auth/me'),
};

// ── JOBS ─────────────────────────────────────────────────────
const jobsAPI = {
  list:     (params = {}) => api('/jobs?' + new URLSearchParams(params)),
  get:      (id)           => api(`/jobs/${id}`),
  create:   (data)         => api('/jobs', { method: 'POST', body: data }),
  update:   (id, data)     => api(`/jobs/${id}`, { method: 'PATCH', body: data }),
  delete:   (id)           => api(`/jobs/${id}`, { method: 'DELETE' }),
  complete: (id)           => api(`/jobs/${id}/complete`, { method: 'PATCH' }),
  myJobs:   (params = {})  => api('/jobs/my/posted?' + new URLSearchParams(params)),
};

// ── OFFERS ───────────────────────────────────────────────────
const offersAPI = {
  submit:   (jobId, data)          => api(`/jobs/${jobId}/offers`, { method: 'POST', body: data }),
  list:     (jobId)                => api(`/jobs/${jobId}/offers`),
  accept:   (jobId, offerId)       => api(`/jobs/${jobId}/offers/${offerId}/accept`, { method: 'PATCH' }),
  reject:   (jobId, offerId)       => api(`/jobs/${jobId}/offers/${offerId}/reject`, { method: 'PATCH' }),
  withdraw: (offerId)              => api(`/offers/${offerId}/withdraw`, { method: 'DELETE' }),
  myOffers: (params = {})          => api('/offers/my?' + new URLSearchParams(params)),
};

// ── CHATS ─────────────────────────────────────────────────────
const chatsAPI = {
  list:        ()              => api('/chats'),
  getMessages: (chatId, p=1)  => api(`/chats/${chatId}?page=${p}`),
  send:        (chatId, data) => api(`/chats/${chatId}/send`, { method: 'POST', body: data }),
};

// ── USERS ─────────────────────────────────────────────────────
const usersAPI = {
  workers:              (params = {}) => api('/users/workers?' + new URLSearchParams(params)),
  profile:              (userId)      => api(`/users/${userId}`),
  updateProfile:        (data)        => api('/users/me/profile', { method: 'PATCH', body: data }),
  dashboard:            ()            => api('/users/dashboard'),
  notifications:        (params = {}) => api('/users/notifications?' + new URLSearchParams(params)),
  markNotificationsRead: (ids = [])   => api('/users/notifications/read', { method: 'PATCH', body: { ids } }),
};

// ── UNLOCK ────────────────────────────────────────────────────
const unlockAPI = {
  initiate: (workerId) => api(`/unlock/worker/${workerId}/initiate`, { method: 'POST' }),
  verify:   (ref)      => api(`/unlock/verify/${ref}`),
  check:    (workerId) => api(`/unlock/worker/${workerId}/status`),
};

// ── REVIEWS ───────────────────────────────────────────────────
const reviewsAPI = {
  submit: (jobId, data) => api(`/reviews/job/${jobId}`, { method: 'POST', body: data }),
  user:   (userId)      => api(`/reviews/user/${userId}`),
};

// ── Socket.IO client (lazy-loaded) ───────────────────────────
let socket = null;

const initSocket = () => {
  if (!Auth.isLoggedIn()) return null;
  if (socket?.connected) return socket;

  // Dynamically load Socket.IO client
  const script  = document.createElement('script');
  script.src    = `${WS_URL}/socket.io/socket.io.js`;
  script.onload = () => {
    socket = window.io(WS_URL, {
      auth:       { token: Auth.getToken() },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect',           () => console.log('🔌 Socket connected:', socket.id));
    socket.on('disconnect',        (r) => console.warn('🔌 Socket disconnected:', r));
    socket.on('notification',      (n) => handleNotification(n));
    socket.on('offer_accepted',    (d) => handleOfferAccepted(d));
    socket.on('new_message',       (m) => handleNewMessage(m));
    socket.on('user_typing',       (d) => handleTyping(d));
    socket.on('user_stopped_typing',(d) => handleStoppedTyping(d));
  };
  document.head.appendChild(script);
  return socket;
};

// ── Global socket event handlers (override in page scripts) ──
let handleNotification  = (n) => console.log('Notification:', n);
let handleOfferAccepted = (d) => console.log('Offer accepted:', d);
let handleNewMessage    = (m) => console.log('New message:', m);
let handleTyping        = (d) => console.log('Typing:', d);
let handleStoppedTyping = (d) => console.log('Stopped typing:', d);

const onNotification      = (fn) => { handleNotification  = fn; };
const onOfferAccepted     = (fn) => { handleOfferAccepted = fn; };
const onNewMessage        = (fn) => { handleNewMessage    = fn; };
const onTyping            = (fn) => { handleTyping        = fn; };
const onStoppedTyping     = (fn) => { handleStoppedTyping = fn; };

// ── Unlock demo: interactive card handler ────────────────────
const setupUnlockDemo = () => {
  const btn     = document.getElementById('unlockBtn');
  const locked  = document.getElementById('lockedState');
  const unlocked = document.getElementById('unlockedState');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) {
      // Demo mode (not logged in)
      btn.textContent = '⏳ Processing ₦99...';
      btn.disabled    = true;
      setTimeout(() => {
        locked.style.display = 'none';
        unlocked.classList.add('show');
      }, 1500);
      return;
    }
    // Real mode
    try {
      btn.textContent = '⏳ Initiating payment...';
      btn.disabled    = true;
      const workerId  = btn.dataset.workerId;
      const result    = await unlockAPI.initiate(workerId);
      if (result.data.alreadyUnlocked) {
        locked.style.display = 'none';
        unlocked.classList.add('show');
        document.querySelector('.uwc-phone-num').textContent = result.data.phone;
      } else {
        window.open(result.data.paymentUrl, '_blank');
      }
    } catch (err) {
      btn.textContent = '🔓 Unlock for ₦99';
      btn.disabled    = false;
      alert(err.message);
    }
  });
};

// Run unlock demo setup on DOM ready
document.addEventListener('DOMContentLoaded', setupUnlockDemo);

// ── Exports ──────────────────────────────────────────────────
window.PlugMe = {
  Auth,
  authAPI,
  jobsAPI,
  offersAPI,
  chatsAPI,
  usersAPI,
  unlockAPI,
  reviewsAPI,
  initSocket,
  onNotification,
  onOfferAccepted,
  onNewMessage,
  onTyping,
  onStoppedTyping,
};
