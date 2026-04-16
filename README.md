# NSUK PlugMe — Website v2

## 📁 Structure
```
plugme-web-v2/
├── index.html        ← Open this in browser
├── css/
│   └── style.css     ← Full design system
├── js/
│   └── main.js       ← Animations, demo interactions, counters
└── README.md
```

## 🚀 How to Run

### Termux / Acode (phone)
Open index.html in Acode → Preview in browser.
Or: `npx serve .` → visit http://localhost:3000

### VS Code (laptop)
Install Live Server extension → Right-click index.html → Open with Live Server

## 🆕 What's New in v2 (vs v1)

| Feature | v1 | v2 |
|---|---|---|
| Contact Unlock ₦99 section | ❌ | ✅ |
| Interactive unlock demo card | ❌ | ✅ |
| System Flow (backend visual) | ❌ | ✅ |
| Critical backend reminder | ❌ | ✅ |
| Scroll-to-top button | ❌ | ✅ |
| Reveal-left / reveal-right animations | ❌ | ✅ |
| Nav link: ₦99 Unlock + System | ❌ | ✅ |
| Footer unlock badge | ❌ | ✅ |

## 📐 All Sections (in order)
1. Navbar (sticky, mobile-ready)
2. Hero (phone mockup, floating cards, typewriter)
3. How It Works (student vs worker flow)
4. Core Features (6 cards)
5. Why This Exists (dark section)
6. Who It's For (student vs worker panels)
7. **Contact Unlock ₦99** (interactive demo card)
8. Advanced Features (9 cards)
9. **System Flow** (5-step backend pipeline visual)
10. Trust Section (4 pillars)
11. CTA (final action section)
12. Footer

## 💡 Contact Unlock Demo
The unlock card in section 7 is interactive:
- Click "Unlock for ₦99" to simulate the payment flow
- After ~1.4s, the phone number appears (demo only)
- In production: wire this to your payment gateway + backend unlock API

## 🔑 Backend Critical Flow
```
Student posts job
     ↓
Worker sends offer
     ↓
Student ACCEPTS
     ↓
✅ Backend auto-creates chat room
✅ Both users redirected immediately
```
This is the single most important logic in your Node.js/Express backend.
The accept-offer route MUST trigger:
1. offer.status = 'accepted'
2. job.status = 'in_progress'
3. job.assignedWorker = workerId
4. Create new Chat document with [studentId, workerId, jobId]
5. Emit socket event to both users → redirect to chat

---
NSUK PlugMe v2 · 2025
