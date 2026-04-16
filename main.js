/* ============================================================
   NSUK PLUGME v2 — MAIN JAVASCRIPT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Navbar scroll ── */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });


  /* ── Mobile menu ── */
  const hamburger   = document.getElementById('hamburger');
  const mobileMenu  = document.getElementById('mobileMenu');
  const mobileClose = document.getElementById('mobileClose');

  const openMobile = () => {
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
    hamburger.setAttribute('aria-expanded', 'true');
  };
  const closeMobile = () => {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger?.addEventListener('click', openMobile);
  mobileClose?.addEventListener('click', closeMobile);
  mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));


  /* ── Intersection Observer (scroll reveals) ── */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const delay = parseInt(entry.target.dataset.delay || 0);
        setTimeout(() => entry.target.classList.add('visible'), delay);
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll(
    '.reveal, .reveal-left, .reveal-right, .feature-card, .adv-card, .how-step, .flow-step'
  ).forEach((el, i) => {
    el.dataset.delay = (i % 4) * 90;
    revealObserver.observe(el);
  });


  /* ── Active nav link ── */
  const navLinks = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('section[id]');

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link =>
            link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)
          );
        }
      });
    },
    { threshold: 0.45 }
  );
  sections.forEach(s => sectionObserver.observe(s));


  /* ── Animated counters ── */
  function counter(el, target, suffix = '') {
    let start = null;
    const duration = 1800;
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el     = entry.target;
        const target = parseInt(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        counter(el, target, suffix);
        counterObserver.unobserve(el);
      });
    },
    { threshold: 0.9 }
  );
  document.querySelectorAll('[data-target]').forEach(el => counterObserver.observe(el));


  /* ── Smooth scroll ── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });


  /* ── Hero parallax dots ── */
  const heroDots = document.querySelector('.hero-dots');
  window.addEventListener('scroll', () => {
    if (heroDots) heroDots.style.transform = `translateY(${window.scrollY * 0.12}px)`;
  }, { passive: true });


  /* ── Phone card rotation ── */
  const phoneCards = document.querySelectorAll('.phone-card');
  let activeIdx = 0;
  if (phoneCards.length) {
    phoneCards.forEach((c, i) => { c.style.opacity = i === 0 ? '1' : '0.35'; });
    setInterval(() => {
      phoneCards.forEach(c => c.style.opacity = '0.35');
      phoneCards[activeIdx % phoneCards.length].style.opacity = '1';
      activeIdx++;
    }, 2200);
  }


  /* ── Typewriter badge ── */
  const typeTarget = document.getElementById('typeTarget');
  const words = ['NSUK Students', 'Campus Workers', 'Smart Earners', 'Job Hunters'];
  let wIdx = 0, cIdx = 0, deleting = false;

  function type() {
    if (!typeTarget) return;
    const word = words[wIdx];
    if (!deleting) {
      typeTarget.textContent = word.slice(0, cIdx + 1);
      cIdx++;
      if (cIdx === word.length) { deleting = true; setTimeout(type, 1700); return; }
    } else {
      typeTarget.textContent = word.slice(0, cIdx - 1);
      cIdx--;
      if (cIdx === 0) { deleting = false; wIdx = (wIdx + 1) % words.length; }
    }
    setTimeout(type, deleting ? 58 : 88);
  }
  setTimeout(type, 900);


  /* ── Contact Unlock Mockup Demo ── */
  const unlockBtn     = document.getElementById('unlockBtn');
  const lockedState   = document.getElementById('lockedState');
  const unlockedState = document.getElementById('unlockedState');

  if (unlockBtn && lockedState && unlockedState) {
    unlockBtn.addEventListener('click', () => {
      // Simulate payment processing
      unlockBtn.textContent = '⏳ Processing...';
      unlockBtn.disabled = true;
      setTimeout(() => {
        lockedState.style.display = 'none';
        unlockedState.classList.add('show');
      }, 1400);
    });
  }


  /* ── Scroll-to-top (optional) ── */
  const scrollTopBtn = document.getElementById('scrollTop');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      scrollTopBtn.style.opacity = window.scrollY > 400 ? '1' : '0';
      scrollTopBtn.style.pointerEvents = window.scrollY > 400 ? 'auto' : 'none';
    }, { passive: true });
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

});
