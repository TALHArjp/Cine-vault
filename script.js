// ============================================================
//  CineVault — FINAL
// ============================================================

const TMDB_KEY = 'b2d36d528b369b3817adcc1c6f732840';
const TMDB     = 'https://api.themoviedb.org/3';
const IMG      = 'https://image.tmdb.org/t/p/';
const ARCHIVE  = 'https://archive.org';

let user          = JSON.parse(localStorage.getItem('cv_user')  || 'null');
let users         = JSON.parse(localStorage.getItem('cv_users') || '[]');
let watchlist     = JSON.parse(localStorage.getItem('cv_wl')    || '[]');
let reviews       = JSON.parse(localStorage.getItem('cv_rv')    || '{}');
let browsePageNum = 1;
let browseGenre   = '';
let starPick      = 0;
let detailMovieId = null;
let infiniteBusy  = false;
let heroMovies    = [];
let heroSwiperInst= null;

// ── Static seed: Archive.org public domain (always playable) ──
const ARCHIVE_MOVIES = [
  { title:"Nosferatu",               year:1922, archiveId:"nosferatu",                   source:"archive" },
  { title:"Metropolis",              year:1927, archiveId:"Metropolis_1927",              source:"archive" },
  { title:"The General",             year:1926, archiveId:"the-general-1926_202002",      source:"archive" },
  { title:"City Lights",             year:1931, archiveId:"city-lights-1931",             source:"archive" },
  { title:"His Girl Friday",         year:1940, archiveId:"His_Girl_Friday",              source:"archive" },
  { title:"Night of Living Dead",    year:1968, archiveId:"night_of_the_living_dead",     source:"archive" },
  { title:"Sherlock Jr.",            year:1924, archiveId:"Sherlock_Jr_1924",             source:"archive" },
  { title:"The Kid",                 year:1921, archiveId:"the-kid-chaplin",              source:"archive" },
  { title:"Phantom of the Opera",    year:1925, archiveId:"ThePhantomOfTheOpera1925",     source:"archive" },
  { title:"Safety Last!",            year:1923, archiveId:"SafetyLast",                   source:"archive" },
  { title:"Cabinet of Dr. Caligari", year:1920, archiveId:"the-cabinet-of-dr.-caligari", source:"archive" },
  { title:"Modern Times",            year:1936, archiveId:"ModernTimesCharlesChaplin",    source:"archive" },
  { title:"Battleship Potemkin",     year:1925, archiveId:"BattleshipPotemkin",           source:"archive" },
  { title:"The Gold Rush",           year:1925, archiveId:"TheGoldRush",                  source:"archive" },
  { title:"Sunrise",                 year:1927, archiveId:"Sunrise.A.Song.of.Two.Humans", source:"archive" },
  { title:"The Birth of a Nation",   year:1915, archiveId:"the-birth-of-a-nation",        source:"archive" },
  { title:"Way Down East",           year:1920, archiveId:"WayDownEast",                  source:"archive" },
  { title:"Intolerance",             year:1916, archiveId:"Intolerance1916",               source:"archive" },
  { title:"The Lodger",              year:1927, archiveId:"TheLodger",                    source:"archive" },
  { title:"Spies",                   year:1928, archiveId:"Spies1928",                    source:"archive" },
];

// FREE_MOVIES will be built dynamically — see loadFreeMoviesDB()
let FREE_MOVIES = [...ARCHIVE_MOVIES.map(a => ({
  ...a,
  desc: '',
  search: `${a.title} ${a.year}`,
  watchUrl: `https://archive.org/details/${a.archiveId}`,
}))];

// Source label map
const SOURCE_LABELS = {
  archive: { label:'Archive.org', icon:'🏛️', color:'#1abc9c' },
  youtube: { label:'YouTube',     icon:'▶️',  color:'#ff4444' },
  tubi:    { label:'Tubi TV',     icon:'📺',  color:'#fa7900' },
};

// ── TMDB ─────────────────────────────────────────────────
async function tmdb(path, params = {}) {
  const u = new URL(`${TMDB}${path}`);
  u.searchParams.set('api_key', TMDB_KEY);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  try { const r = await fetch(u); return r.json(); } catch { return null; }
}

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupCursor();
  restoreUser();
  startLoader();
  await loadHome();
  finishLoader();
  setupReveal();
  setupInfiniteScroll();

  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('opaque', scrollY > 60);
  });
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchMovies();
  });
});

// ── LOADER ───────────────────────────────────────────────
function startLoader() {
  let p = 0;
  const fill = document.getElementById('loaderFill');
  const iv = setInterval(() => { p = Math.min(p + Math.random() * 18, 90); fill.style.width = p + '%'; }, 200);
  window._loaderIv = iv;
}
function finishLoader() {
  clearInterval(window._loaderIv);
  document.getElementById('loaderFill').style.width = '100%';
  setTimeout(() => {
    document.getElementById('pageLoader').classList.add('gone');
    document.body.classList.remove('loading');
    setTimeout(() => startOnboarding(), 800);
  }, 500);
}

// ── HOME ─────────────────────────────────────────────────
async function loadHome() {
  const [trending, popular, topRated] = await Promise.all([
    tmdb('/trending/movie/week'),
    tmdb('/movie/popular'),
    tmdb('/movie/top_rated'),
  ]);

  if (trending?.results?.length) {
    heroMovies = trending.results.slice(0, 8);
    await buildHeroSwiper(heroMovies);
    buildMovieSwiper('trendingWrapper', 'trendingSwiper', trending.results.slice(0, 20), 'HOT', false, false, 4000);
  }
  if (popular?.results) {
    buildMovieSwiper('popularWrapper', 'popularSwiper', popular.results.slice(0, 20), null, false, true, 6300);
  }
  if (topRated?.results) {
    buildMovieSwiper('topRatedWrapper', 'topRatedSwiper', topRated.results.slice(0, 20), null, true, false, 5100);
  }
  spawnParticles();
  loadFreeSwiper();
  loadWatchFreeNow(); // New "Watch Free Now" grid on home
}

// ════════════════════════════════════════════════════════════
//  HERO SWIPER — each slide has its own backdrop + trailer bg
// ════════════════════════════════════════════════════════════
async function buildHeroSwiper(movies) {
  const wrapper = document.getElementById('heroSwiperWrapper');
  const details = await Promise.all(movies.map(m => tmdb(`/movie/${m.id}`)));

  wrapper.innerHTML = movies.map((m, i) => {
    const d       = details[i];
    const genres  = (d?.genres || []).slice(0, 3).map(g => `<span class="hero-pill">${g.name}</span>`).join('');
    const synopsis= (m.overview || '').slice(0, 180) + ((m.overview?.length > 180) ? '…' : '');
    const score   = m.vote_average?.toFixed(1) ?? '—';
    const year    = m.release_date?.slice(0, 4) ?? '—';
    const lang    = (m.original_language || '—').toUpperCase();
    const bg      = m.backdrop_path ? `${IMG}original${m.backdrop_path}` : '';

    return `
    <div class="swiper-slide hero-slide" data-idx="${i}" data-id="${m.id}">

      <!-- 1. Poster background (always visible) -->
      <div class="hero-slide-bg" style="background-image:url('${bg}')"></div>

      <!-- 2. Trailer iframe (muted, no controls) — shown after 2s if available -->
      <div class="hero-trailer-wrap" id="hTrailer_${i}">
        <iframe
          id="hIframe_${i}"
          src=""
          frameborder="0"
          allow="autoplay; encrypted-media"
          allowfullscreen="false"
          tabindex="-1"
          aria-hidden="true">
        </iframe>
      </div>

      <!-- 3. Vignettes on top -->
      <div class="hero-slide-vignette"></div>

      <!-- 4. Content -->
      <div class="hero-content">
        <div class="hero-eyebrow"><span class="eyebrow-dot"></span><span>Now Trending</span></div>
        <h1 class="hero-title">${m.title}</h1>
        <div class="hero-pills">${genres}</div>
        <p class="hero-synopsis">${synopsis}</p>
        <div class="hero-stats">
          <div class="stat-item"><span class="stat-val">${score}</span><span class="stat-label">IMDb</span></div>
          <div class="stat-div"></div>
          <div class="stat-item"><span class="stat-val">${year}</span><span class="stat-label">Year</span></div>
          <div class="stat-div"></div>
          <div class="stat-item"><span class="stat-val">${lang}</span><span class="stat-label">Lang</span></div>
        </div>
        <div class="hero-cta">
          <button class="cta-play" onclick="openTrailer(${m.id})"><span class="play-ico">▶</span> Watch Trailer</button>
          <button class="cta-list" onclick="toggleWatchlistRaw(${JSON.stringify(m).replace(/"/g,'&quot;')})">+ My List</button>
          <button class="cta-info" onclick="openDetail(${m.id})">More Info</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Init hero Swiper — SLIDE effect (visible left→right movement)
  heroSwiperInst = new Swiper('.heroSwiper', {
    loop: true,
    speed: 900,
    autoplay: { delay: 8000, disableOnInteraction: false },
    pagination: { el: '.heroSwiper-pagination', clickable: true, dynamicBullets: true },
    navigation: { prevEl: '.hero-prev', nextEl: '.hero-next' },
    effect: 'slide',
    on: {
      init(sw)                        { playHeroTrailer(sw.realIndex); },
      slideChangeTransitionStart()    { clearHeroTrailer(); },
      slideChangeTransitionEnd(sw)    { playHeroTrailer(sw.realIndex); }
    }
  });
}

// Start playing trailer for given slide index (after 2s delay)
function playHeroTrailer(idx) {
  clearTimeout(window._htt);
  window._htt = setTimeout(async () => {
    const m = heroMovies[idx];
    if (!m) return;
    const data = await tmdb(`/movie/${m.id}/videos`);
    const t = data?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')
            || data?.results?.find(v => v.site === 'YouTube');
    if (!t) return;

    const iframe = document.getElementById(`hIframe_${idx}`);
    const wrap   = document.getElementById(`hTrailer_${idx}`);
    if (!iframe || !wrap) return;

    // controls=0 hides ALL YouTube controls
    iframe.src = [
      `https://www.youtube.com/embed/${t.key}`,
      `?autoplay=1&mute=1&loop=1&playlist=${t.key}`,
      `&controls=0&disablekb=1&fs=0`,
      `&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`,
      `&playsinline=1`
    ].join('');
    wrap.classList.add('active');
  }, 2000);
}

// Stop all trailers (called before slide transition)
function clearHeroTrailer() {
  clearTimeout(window._htt);
  document.querySelectorAll('.hero-trailer-wrap').forEach(w => {
    w.classList.remove('active');
    const iframe = w.querySelector('iframe');
    if (iframe) iframe.src = '';
  });
}

// ════════════════════════════════════════════════════════════
//  MOVIE SWIPER RAILS
//  rtl=true  → slides auto-scroll right-to-left
//  delay     → unique per rail so they never sync
// ════════════════════════════════════════════════════════════
function buildMovieSwiper(wrapperId, swiperId, movies, badge, numbered, rtl, delay) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  wrapper.innerHTML = movies.map((m, i) =>
    `<div class="swiper-slide">${movieCardHTML(m, badge || (numbered ? `#${i+1}` : null))}</div>`
  ).join('');

  new Swiper(`#${swiperId}`, {
    slidesPerView: 'auto',
    spaceBetween: 18,
    loop: true,
    speed: 700,
    // reverseDirection makes autoplay go the other way without flipping card text
    autoplay: {
      delay: delay || 4000,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
      reverseDirection: !!rtl,
    },
    navigation: {
      prevEl: `#${swiperId} .swiper-button-prev`,
      nextEl: `#${swiperId} .swiper-button-next`,
    },
    grabCursor: true,
  });
}

// ── FREE SWIPER (RTL, 7s — different from all others) ────
async function loadFreeSwiper() {
  const enriched = await Promise.all(FREE_MOVIES.slice(0, 12).map(enrichFreePoster));

  const wrapper = document.getElementById('freeWrapper');
  wrapper.innerHTML = enriched.map(fm => `<div class="swiper-slide">${freeCardHTML(fm)}</div>`).join('');

  new Swiper('#freeSwiper', {
    slidesPerView: 'auto',
    spaceBetween: 18,
    loop: true,
    speed: 700,
    autoplay: { delay: 7000, disableOnInteraction: false, pauseOnMouseEnter: true, reverseDirection: true },
    navigation: {
      prevEl: '#freeSwiper .swiper-button-prev',
      nextEl: '#freeSwiper .swiper-button-next',
    },
    grabCursor: true,
  });
}

// ════════════════════════════════════════════════════════════
//  FREE MOVIES — Dynamic 1000+ from TMDB + Archive.org
//  Strategy: TMDB /discover/movie with watch_region=US and
//  with_watch_monetization_types=free|ads (Tubi, Pluto, etc.)
// ════════════════════════════════════════════════════════════

// Free provider IDs on TMDB (US region free/AVOD services)
// 73=Tubi, 300=Pluto TV, 386=Peacock Free, 613=Plex, 387=Peacock Premium,
// 531=Paramount+ with Showtime, 174=HBO Max (ads), 537=Discovery+
const FREE_PROVIDER_IDS = '73|300|386|613|192|531';

let freePageNum   = 1;
let freeGenreId   = 0;
let freeSourceF   = 'all';
let freeBusy      = false;
let freeTotalPages= 50; // will be updated

// TMDB genre list for free page
const FREE_GENRES = [
  {id:0,   name:'All'},
  {id:28,  name:'Action'},
  {id:35,  name:'Comedy'},
  {id:27,  name:'Horror'},
  {id:18,  name:'Drama'},
  {id:878, name:'Sci-Fi'},
  {id:53,  name:'Thriller'},
  {id:10749,name:'Romance'},
  {id:16,  name:'Animation'},
  {id:99,  name:'Documentary'},
  {id:80,  name:'Crime'},
];

async function loadFreePage() {
  const el = document.getElementById('freeGrid');
  if (!el) return;

  // Build genre bar
  buildFreeGenreBar();

  // Reset state
  freePageNum = 1;
  freeBusy    = false;
  el.innerHTML = '';

  // Show loader
  const loader = document.getElementById('freeLoader');
  if (loader) loader.style.display = 'flex';

  await fetchFreeMovies(true);
  setupFreeInfiniteScroll();

  if (loader) loader.style.display = 'none';
}

function buildFreeGenreBar() {
  const bar = document.getElementById('freeGenreBar');
  if (!bar || bar.children.length) return;
  bar.innerHTML = FREE_GENRES.map((g,i) =>
    `<button class="genre-chip ${i===0?'on':''}" onclick="filterFreeGenre(${g.id},this)">${g.name}</button>`
  ).join('');
}

async function filterFreeGenre(gid, btn) {
  document.querySelectorAll('#freeGenreBar .genre-chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  freeGenreId = gid;
  freePageNum = 1;
  document.getElementById('freeGrid').innerHTML = '';
  const loader = document.getElementById('freeLoader');
  if (loader) loader.style.display = 'flex';
  await fetchFreeMovies(true);
  if (loader) loader.style.display = 'none';
}

async function fetchFreeMovies(reset = false) {
  if (freeBusy) return;
  freeBusy = true;

  const grid = document.getElementById('freeGrid');

  // Params for TMDB free movies
  const params = {
    sort_by: 'popularity.desc',
    page: freePageNum,
    watch_region: 'US',
    with_watch_monetization_types: 'free|ads',
    'vote_count.gte': 10,
  };
  if (freeGenreId) params.with_genres = freeGenreId;

  const data = await tmdb('/discover/movie', params);
  freeTotalPages = Math.min(data?.total_pages || 50, 500);

  // Combine: TMDB free results + archive movies (on first page)
  let movies = data?.results || [];

  if (reset && freePageNum === 1) {
    // Prepend archive movies enriched with TMDB posters
    const archiveEnriched = await Promise.all(
      ARCHIVE_MOVIES.slice(0, 12).map(async a => {
        const res = await tmdb('/search/movie', { query: a.title, year: a.year });
        const hit = res?.results?.[0];
        return {
          // Make it look like a TMDB movie card
          id: hit?.id || null,
          title: a.title,
          poster_path: hit?.poster_path || null,
          backdrop_path: hit?.backdrop_path || null,
          overview: hit?.overview || '',
          vote_average: hit?.vote_average || 0,
          release_date: `${a.year}-01-01`,
          original_language: 'en',
          _freeSource: 'archive',
          _watchUrl: `https://archive.org/details/${a.archiveId}`,
          _sourceLabel: '🏛️ Archive.org',
          _sourceColor: '#1abc9c',
        };
      })
    );
    movies = [...archiveEnriched, ...movies];
  }

  // Tag TMDB movies with Tubi watch link
  const tagged = movies.map(m => {
    if (m._freeSource) return m; // already archive
    return {
      ...m,
      _freeSource: 'tubi',
      _watchUrl: `https://tubitv.com/search/${encodeURIComponent(m.title)}`,
      _sourceLabel: '📺 Tubi / Free',
      _sourceColor: '#fa7900',
    };
  });

  if (tagged.length) {
    const frag  = document.createDocumentFragment();
    const cards = [];
    tagged.forEach(m => {
      const div = document.createElement('div');
      div.innerHTML = freeMovieCardHTML(m);
      const card = div.firstElementChild;
      card.style.opacity   = '0';
      card.style.transform = 'translateY(22px)';
      card.style.transition= 'none';
      frag.appendChild(card);
      cards.push(card);
    });
    grid.appendChild(frag);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        setTimeout(() => {
          card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          card.style.opacity    = '1';
          card.style.transform  = 'translateY(0)';
        }, i * 30);
      });
    }));
  }

  freePageNum++;
  freeBusy = false;
}

// Card HTML for free movies page
function freeMovieCardHTML(m) {
  const poster = m.poster_path
    ? `${IMG}w342${m.poster_path}`
    : `https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent((m.title||'').slice(0,12))}`;
  const year  = m.release_date?.slice(0,4) || '';
  const score = m.vote_average?.toFixed(1) || '—';
  const safeUrl   = encodeURIComponent(m._watchUrl || '');
  const safeTitle = encodeURIComponent(m.title || '');
  const color = m._sourceColor || '#fa7900';
  const label = m._sourceLabel || '📺 Free';

  return `<div class="movie-card free-movie-item" onclick="openFreeMovieDirect('${safeUrl}','${safeTitle}')">
    <div class="card-badge free">FREE</div>
    <div class="card-poster-wrap">
      <img class="card-poster" src="${poster}" alt="${m.title}" loading="lazy"
           onerror="this.src='https://placehold.co/342x513/0d1117/1abc9c?text=Free'"/>
      <div class="card-hover-layer">
        <button class="card-play-btn" onclick="event.stopPropagation();openFreeMovieDirect('${safeUrl}','${safeTitle}')">▶</button>
        <div class="free-source-chip" style="background:${color}22;border:1px solid ${color}55;color:${color}">${label}</div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${m.title}</div>
      <div class="card-bottom">
        <span class="card-score" style="color:${color}">▶ Free</span>
        <span class="card-year">${year}</span>
      </div>
    </div>
  </div>`;
}

function setupFreeInfiniteScroll() {
  const sentinel = document.getElementById('freeSentinel');
  if (!sentinel || sentinel._observed) return;
  sentinel._observed = true;
  const obs = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return;
    if (!document.getElementById('freePage').classList.contains('active')) return;
    if (freeBusy || freePageNum > freeTotalPages) return;
    const loader = document.getElementById('freeLoader');
    if (loader) loader.style.display = 'flex';
    await fetchFreeMovies();
    if (loader) loader.style.display = 'none';
  }, { rootMargin: '400px' });
  obs.observe(sentinel);
}

// ── FREE PAGE ─────────────────────────────────────────── (old fn replaced above)


// Enrich a FREE_MOVIES entry with a TMDB poster
async function enrichFreePoster(fm) {
  // Search with title + year for accuracy
  const res = await tmdb('/search/movie', { query: fm.title, year: fm.year });
  const results = res?.results || [];
  // Find best match: same year or closest
  const hit = results.find(r => r.release_date?.startsWith(String(fm.year)))
           || results.find(r => Math.abs((r.release_date?.slice(0,4)||0) - fm.year) <= 3)
           || results[0];
  const poster = hit?.poster_path
    ? `${IMG}w342${hit.poster_path}`
    : `https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent(fm.title)}`;
  return { ...fm, poster, tmdbId: hit?.id || null };
}

// ── CARD HTML ────────────────────────────────────────────
function movieCardHTML(movie, badge = null) {
  const poster = movie.poster_path
    ? `${IMG}w342${movie.poster_path}`
    : `https://placehold.co/342x513/13131e/44445a?text=No+Poster`;
  const year  = movie.release_date?.slice(0, 4) || '';
  const score = movie.vote_average?.toFixed(1) || '—';
  const inWL  = watchlist.some(w => w.id === movie.id);
  const mStr  = encodeURIComponent(JSON.stringify({
    id: movie.id, title: movie.title, poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path, overview: movie.overview,
    vote_average: movie.vote_average, release_date: movie.release_date,
    original_language: movie.original_language
  }));

  return `<div class="movie-card" onclick="openDetail(${movie.id})">
    ${badge ? `<div class="card-badge">${badge}</div>` : ''}
    ${inWL  ? `<div class="card-wl-mark">✓</div>` : ''}
    <div class="card-poster-wrap">
      <img class="card-poster" src="${poster}" alt="${movie.title}" loading="lazy"
           onerror="this.src='https://placehold.co/342x513/13131e/44445a?text=No+Poster'"/>
      <div class="card-hover-layer">
        <button class="card-play-btn" onclick="event.stopPropagation();openTrailer(${movie.id})">▶</button>
        <button class="card-add-btn" onclick="event.stopPropagation();doToggleWL(${movie.id},this,'${mStr}')">
          ${inWL ? '✓ Saved' : '+ My List'}
        </button>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${movie.title}</div>
      <div class="card-bottom">
        <span class="card-score">★ ${score}</span>
        <span class="card-year">${year}</span>
      </div>
    </div>
  </div>`;
}

function freeCardHTML(fm) {
  const poster = fm.poster || `https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent(fm.title)}`;
  const src = SOURCE_LABELS[fm.source] || SOURCE_LABELS.archive;
  const safeUrl   = encodeURIComponent(fm.watchUrl || '');
  const safeTitle = encodeURIComponent(fm.title);
  return `<div class="free-card-item" onclick="openFreeMovieDirect('${safeUrl}','${safeTitle}')">
    <div class="fci-badge-row">
      <span class="fci-free-badge">FREE</span>
      <span class="fci-source" style="background:${src.color}18;border-color:${src.color}50;color:${src.color}">${src.icon} ${src.label}</span>
    </div>
    <div class="fci-poster-wrap">
      <img src="${poster}" alt="${fm.title}" loading="lazy"
           onerror="this.src='https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent(fm.title)}'"/>
      <div class="fci-hover">
        <button class="fci-play-btn">▶ Watch Free</button>
      </div>
    </div>
    <div class="fci-info">
      <div class="fci-title">${fm.title}</div>
      <div class="fci-meta">
        <span style="color:${src.color};font-weight:700;font-size:11px">FREE</span>
        <span class="fci-year">${fm.year}</span>
      </div>
    </div>
  </div>`;
}

// Open free movie directly (new tab)
function openFreeMovieDirect(encodedUrl, encodedTitle) {
  if (!requireLogin()) return;
  const url   = decodeURIComponent(encodedUrl);
  const title = decodeURIComponent(encodedTitle);
  if (!url) { showToast('No link available'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
  showToast(`🎬 Opening "${title}" — enjoy!`);
}

// ── WATCH FREE NOW (home grid) ────────────────────────────
async function loadWatchFreeNow() {
  const grid = document.getElementById('watchFreeGrid');
  if (!grid) return;
  const picks    = FREE_MOVIES.slice(0, 8);
  const enriched = await Promise.all(picks.map(enrichFreePoster));
  grid.innerHTML = enriched.map(fm => watchFreeCardHTML(fm)).join('');
}

function watchFreeCardHTML(fm) {
  const poster = fm.poster || `https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent(fm.title)}`;
  const src = SOURCE_LABELS[fm.source] || SOURCE_LABELS.archive;
  const safeUrl   = encodeURIComponent(fm.watchUrl || '');
  const safeTitle = encodeURIComponent(fm.title);
  return `
    <div class="wf-card" onclick="openFreeMovieDirect('${safeUrl}','${safeTitle}')">
      <div class="wf-card-poster">
        <img src="${poster}" alt="${fm.title}" loading="lazy"
             onerror="this.src='https://placehold.co/342x513/0d1117/1abc9c?text=${encodeURIComponent(fm.title)}'"/>
        <div class="wf-card-overlay">
          <button class="wf-play-btn">▶ Watch Free</button>
        </div>
        <div class="wf-source-chip" style="background:${src.color}22;border-color:${src.color}55;color:${src.color}">
          ${src.icon} ${src.label}
        </div>
      </div>
      <div class="wf-card-info">
        <div class="wf-card-title">${fm.title}</div>
        <div class="wf-card-year">${fm.year}</div>
      </div>
    </div>`;
}

// ── PARTICLES ────────────────────────────────────────────
function spawnParticles() {
  const c = document.getElementById('heroParticles');
  c.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;bottom:${Math.random()*25}%;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;animation-duration:${7+Math.random()*9}s;animation-delay:${Math.random()*7}s`;
    c.appendChild(p);
  }
}

// ── SCROLL REVEAL ────────────────────────────────────────
function setupReveal() {
  const run = () => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
  };
  run();
  window._revealFn = run;
}

// ════════════════════════════════════════════════════════════
//  INFINITE SCROLL — smooth staggered card append
// ════════════════════════════════════════════════════════════
function setupInfiniteScroll() {
  const sentinel = document.getElementById('infiniteSentinel');
  if (!sentinel) return;

  const obs = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return;
    if (!document.getElementById('moviesPage').classList.contains('active')) return;
    if (infiniteBusy) return;
    await infiniteLoadMore();
  }, { rootMargin: '400px' }); // trigger 400px before bottom

  obs.observe(sentinel);
}

async function infiniteLoadMore() {
  infiniteBusy = true;
  const loader = document.getElementById('infiniteLoader');
  loader.style.display = 'flex';

  browsePageNum++;
  const params = { sort_by: 'popularity.desc', page: browsePageNum };
  if (browseGenre) params.with_genres = browseGenre;
  const data = await tmdb('/discover/movie', params);
  const grid = document.getElementById('browseGrid');

  if (data?.results?.length) {
    const frag = document.createDocumentFragment();
    const cards = [];

    data.results.forEach(m => {
      const div = document.createElement('div');
      div.innerHTML = movieCardHTML(m);
      const card = div.firstElementChild;
      // Start invisible, slightly below
      card.style.opacity   = '0';
      card.style.transform = 'translateY(28px)';
      card.style.transition= 'none';
      frag.appendChild(card);
      cards.push(card);
    });

    grid.appendChild(frag);

    // Stagger fade-in after browser has painted them
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cards.forEach((card, i) => {
          setTimeout(() => {
            card.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
            card.style.opacity    = '1';
            card.style.transform  = 'translateY(0)';
          }, i * 40);
        });
      });
    });
  }

  loader.style.display = 'none';
  infiniteBusy = false;
}

// ── BROWSE ───────────────────────────────────────────────
const GENRES = [
  {id:28,name:'Action'},{id:12,name:'Adventure'},{id:16,name:'Animation'},
  {id:35,name:'Comedy'},{id:80,name:'Crime'},{id:18,name:'Drama'},
  {id:27,name:'Horror'},{id:9648,name:'Mystery'},{id:10749,name:'Romance'},
  {id:878,name:'Sci-Fi'},{id:53,name:'Thriller'},{id:10752,name:'War'},
];

function buildGenreBar() {
  const el = document.getElementById('genreBar');
  if (!el || el.children.length) return;
  el.innerHTML = `<button class="genre-chip on" onclick="pickGenre(0,this)">All</button>` +
    GENRES.map(g => `<button class="genre-chip" onclick="pickGenre(${g.id},this)">${g.name}</button>`).join('');
}

async function pickGenre(gid, btn) {
  document.querySelectorAll('.genre-chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  browseGenre = gid; browsePageNum = 1;
  await fetchBrowse(true);
}

async function fetchBrowse(reset = false) {
  const params = { sort_by: 'popularity.desc', page: browsePageNum };
  if (browseGenre) params.with_genres = browseGenre;
  const data = await tmdb('/discover/movie', params);
  const grid = document.getElementById('browseGrid');
  if (reset) grid.innerHTML = '';
  if (data?.results) {
    const frag  = document.createDocumentFragment();
    const cards = [];
    data.results.forEach(m => {
      const div  = document.createElement('div');
      div.innerHTML = movieCardHTML(m);
      const card = div.firstElementChild;
      card.style.opacity   = '0';
      card.style.transform = 'translateY(24px)';
      card.style.transition= 'none';
      frag.appendChild(card);
      cards.push(card);
    });
    grid.appendChild(frag);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        setTimeout(() => {
          card.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
          card.style.opacity    = '1';
          card.style.transform  = 'translateY(0)';
        }, i * 35);
      });
    }));
  }
}

// ── SEARCH ───────────────────────────────────────────────
async function searchMovies() {
  if (!requireLogin()) return;
  const desktop = document.getElementById('searchInput').value.trim();
  const mobile  = document.getElementById('mobileSearchInput')?.value.trim() || '';
  const q = desktop || mobile;
  if (!q) return;
  // Keep both inputs in sync
  document.getElementById('searchInput').value = q;
  showPage('search');
  document.getElementById('searchQueryEl').textContent = q;
  const data = await tmdb('/search/movie', { query: q });
  const el   = document.getElementById('searchGrid');
  el.innerHTML = data?.results?.length
    ? data.results.map(m => movieCardHTML(m)).join('')
    : `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No results</h3><p>Try another title</p></div>`;
}

// ── FREE PLAYER ──────────────────────────────────────────
function playFreeMovie(archiveId, encodedTitle, encodedDesc) {
  const title = decodeURIComponent(encodedTitle);
  const desc  = decodeURIComponent(encodedDesc);
  document.getElementById('playerMovieTitle').textContent = title;
  document.getElementById('playerSourceTag').textContent  = 'Archive.org — Free & Legal';
  document.getElementById('youtubePlayerArea').style.display  = 'none';
  document.getElementById('archivePlayerArea').style.display  = 'block';

  const vid = document.getElementById('archiveVideo');
  const src = document.getElementById('archiveSource');
  src.src  = `${ARCHIVE}/download/${archiveId}/${archiveId}.mp4`;
  src.type = 'video/mp4';
  vid.load();

  vid.onerror = () => {
    src.src = `${ARCHIVE}/download/${archiveId}/${archiveId}_512kb.mp4`;
    vid.load();
    vid.onerror = () => {
      showToast('Opening on Archive.org…');
      setTimeout(() => { window.open(`${ARCHIVE}/details/${archiveId}`, '_blank'); closePlayer(); }, 1200);
    };
  };
  document.getElementById('playerOverlay').classList.add('open');
  clearHeroTrailer();
}

function closePlayer() {
  document.getElementById('playerOverlay').classList.remove('open');
  const vid = document.getElementById('archiveVideo');
  vid.pause(); vid.src = '';
  document.getElementById('archiveSource').src = '';
  document.getElementById('ytFrame').src = '';
}

// ── TRAILER ──────────────────────────────────────────────
async function openTrailer(movieId) {
  if (!requireLogin()) return;
  const data = await tmdb(`/movie/${movieId}/videos`);
  const t = data?.results?.find(v => v.type==='Trailer' && v.site==='YouTube')
          || data?.results?.find(v => v.site==='YouTube');
  if (!t) { showToast('No trailer available'); return; }

  const info = await tmdb(`/movie/${movieId}`);
  document.getElementById('playerMovieTitle').textContent = info?.title || 'Trailer';
  document.getElementById('playerSourceTag').textContent  = 'YouTube Trailer';
  document.getElementById('archivePlayerArea').style.display = 'none';
  document.getElementById('youtubePlayerArea').style.display = 'block';
  document.getElementById('ytFrame').src = `https://www.youtube.com/embed/${t.key}?autoplay=1&rel=0`;
  document.getElementById('playerOverlay').classList.add('open');
  clearHeroTrailer();
}

// ── DETAIL MODAL ─────────────────────────────────────────
async function openDetail(movieId) {
  if (!requireLogin()) return;
  detailMovieId = movieId;
  const [details, credits, videos, providers] = await Promise.all([
    tmdb(`/movie/${movieId}`),
    tmdb(`/movie/${movieId}/credits`),
    tmdb(`/movie/${movieId}/videos`),
    tmdb(`/movie/${movieId}/watch/providers`),
  ]);
  if (!details) return;
  document.getElementById('detailModal').classList.add('open');

  document.getElementById('detailBackdrop').style.backgroundImage =
    details.backdrop_path ? `url(${IMG}w1280${details.backdrop_path})` : 'none';
  document.getElementById('detailPoster').src =
    details.poster_path ? `${IMG}w342${details.poster_path}` : '';
  document.getElementById('detailTitle').textContent      = details.title;
  document.getElementById('detailRating').textContent     = `★ ${details.vote_average?.toFixed(1)}`;
  document.getElementById('detailYear').textContent       = details.release_date?.slice(0,4) || '—';
  document.getElementById('detailRuntime').textContent    = details.runtime ? `${details.runtime} min` : '';
  document.getElementById('detailLang').textContent       = (details.original_language||'').toUpperCase();
  document.getElementById('detailOverview').textContent   = details.overview;
  document.getElementById('detailGenres').innerHTML       =
    (details.genres||[]).map(g=>`<span class="genre-pill">${g.name}</span>`).join('');
  document.getElementById('detailCast').innerHTML         =
    (credits?.cast||[]).slice(0,8).map(c=>
      `<div class="cast-chip"><strong>${c.name}</strong><span>${c.character}</span></div>`
    ).join('');

  const trailer = videos?.results?.find(v=>v.type==='Trailer'&&v.site==='YouTube')
                || videos?.results?.find(v=>v.site==='YouTube');

  document.getElementById('detailPlayBtn').onclick = () => {
    closeDetailModal();
    if (trailer) {
      document.getElementById('playerMovieTitle').textContent = details.title;
      document.getElementById('playerSourceTag').textContent  = 'YouTube Trailer';
      document.getElementById('archivePlayerArea').style.display = 'none';
      document.getElementById('youtubePlayerArea').style.display = 'block';
      document.getElementById('ytFrame').src = `https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`;
      document.getElementById('playerOverlay').classList.add('open');
      clearHeroTrailer();
    } else showToast('No trailer available');
  };

  // ── FREE AVAILABILITY BADGE + WATCH BUTTON ────────────────
  const badge    = document.getElementById('freeAvailBadge');
  const watchBtn = document.getElementById('detailWatchBtn');

  // Reset to checking state
  badge.className = 'free-avail-badge free-avail-checking';
  badge.innerHTML = '<span class="fab-dot"></span><span class="fab-text">Checking availability…</span>';
  watchBtn.style.display = 'block';
  watchBtn.textContent   = '🎬 Watch Online Free';
  watchBtn.disabled      = false;

  // Resolve free link from providers
  const regionData = providers?.results || {};
  const regionPriority = ['US', 'GB', 'CA', 'AU', 'IN', 'PK'];
  let freeLink = null;
  for (const region of regionPriority) {
    const rd = regionData[region];
    if (!rd) continue;
    if ((rd.free?.length || rd.ads?.length) && rd.link) { freeLink = rd.link; break; }
  }
  if (!freeLink) {
    for (const [, rd] of Object.entries(regionData)) {
      if ((rd.free?.length || rd.ads?.length) && rd.link) { freeLink = rd.link; break; }
    }
  }

  // Also check FREE_MOVIES list (archive/youtube/tubi)
  const localFree = FREE_MOVIES.find(fm =>
    fm.title.toLowerCase() === details.title.toLowerCase() ||
    fm.search.toLowerCase().includes(details.title.toLowerCase().slice(0, 8))
  );

  if (freeLink || localFree) {
    // ✅ FREE AVAILABLE
    const src = localFree ? (SOURCE_LABELS[localFree.source] || SOURCE_LABELS.archive) : null;
    const label = src ? `${src.icon} Free on ${src.label}` : '🟢 Free streaming available';
    badge.className = 'free-avail-badge free-avail-yes';
    badge.innerHTML = `<span class="fab-dot"></span><span class="fab-text">${label}</span>`;
    watchBtn.textContent = '🎬 Watch Free Now';
    watchBtn.onclick = () => {
      const url = localFree?.watchUrl || freeLink;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('🎬 Opening free stream…');
    };
  } else {
    // ❌ NOT FREE
    badge.className = 'free-avail-badge free-avail-no';
    badge.innerHTML = '<span class="fab-dot"></span><span class="fab-text">Not available for free</span>';
    watchBtn.textContent = '🔒 Not Free — See Options';
    watchBtn.onclick = () => showNotAvailableFree(details.title);
  }

  const wlBtn = document.getElementById('detailListBtn');
  wlBtn.textContent = watchlist.some(w=>w.id===movieId) ? '✓ Saved' : '+ My List';
  wlBtn.onclick = () => {
    toggleWatchlistRaw(details);
    wlBtn.textContent = watchlist.some(w=>w.id===movieId) ? '✓ Saved' : '+ My List';
  };

  renderReviews(movieId);
  document.getElementById('writeReviewArea').style.display = user ? 'block' : 'none';
}

function closeDetailModal() { document.getElementById('detailModal').classList.remove('open'); }

// ── WATCHLIST ────────────────────────────────────────────
function toggleWatchlistRaw(movie) {
  if (typeof movie === 'string') movie = JSON.parse(movie);
  if (!user) { openAuth('login'); showToast('Sign in to save films'); return; }
  const idx = watchlist.findIndex(w=>w.id===movie.id);
  if (idx>=0) { watchlist.splice(idx,1); showToast('Removed from your list'); }
  else         { watchlist.push(movie);   showToast('Added to your list ✓'); }
  localStorage.setItem('cv_wl', JSON.stringify(watchlist));
  updateCounts();
}

function doToggleWL(id, btn, mStr) {
  if (!requireLogin()) return;
  try {
    const movie = JSON.parse(decodeURIComponent(mStr));
    toggleWatchlistRaw(movie);
    btn.textContent = watchlist.some(w=>w.id===id) ? '✓ Saved' : '+ My List';
  } catch(e) { console.warn(e); }
}

function loadWatchlistPage() {
  const g = document.getElementById('watchlistGrid');
  const e = document.getElementById('emptyList');
  if (!watchlist.length) { g.innerHTML=''; e.style.display='block'; }
  else { e.style.display='none'; g.innerHTML = watchlist.map(m=>movieCardHTML(m)).join(''); }
}

// ── REVIEWS ──────────────────────────────────────────────
function renderReviews(movieId) {
  const list = reviews[movieId]||[];
  const el   = document.getElementById('detailReviewsList');
  el.innerHTML = list.length
    ? list.map(r => `
        <div class="review-item">
          <div class="review-top">
            <span class="review-author">${r.author}</span>
            <span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
          </div>
          <p class="review-text">${r.text}</p>
        </div>`).join('')
    : `<p style="color:var(--textM);font-size:13px;margin-bottom:12px">No reviews yet — be first!</p>`;
}

function pickStar(n) {
  starPick = n;
  document.querySelectorAll('#starRow span').forEach((s,i) => s.classList.toggle('lit', i<n));
}

function submitReview() {
  if (!user)    { showToast('Sign in to post a review'); return; }
  const text = document.getElementById('reviewTextarea').value.trim();
  if (!text)    { showToast('Write something first!'); return; }
  if (!starPick){ showToast('Pick a rating'); return; }
  if (!reviews[detailMovieId]) reviews[detailMovieId]=[];
  reviews[detailMovieId].unshift({ author:user.name, text, rating:starPick });
  localStorage.setItem('cv_rv', JSON.stringify(reviews));
  document.getElementById('reviewTextarea').value='';
  pickStar(0);
  renderReviews(detailMovieId);
  updateCounts();
  showToast('Review posted ✍️');
}

// ── AUTH ─────────────────────────────────────────────────
function openAuth(tab) { switchAuth(tab); document.getElementById('authModal').classList.add('open'); }
function closeAuth()   { document.getElementById('authModal').classList.remove('open'); }
function switchAuth(tab) {
  document.getElementById('loginForm').style.display  = tab==='login'  ? 'block':'none';
  document.getElementById('signupForm').style.display = tab==='signup' ? 'block':'none';
  document.getElementById('li-err').textContent='';
  document.getElementById('su-err').textContent='';
}
function doLogin() {
  const u=document.getElementById('li-user').value.trim();
  const p=document.getElementById('li-pass').value;
  const e=document.getElementById('li-err');
  if (!u||!p) { e.textContent='Fill all fields'; return; }
  const found=users.find(x=>x.username===u&&x.password===p);
  if (!found) { e.textContent='Wrong username or password'; return; }
  setUser(found); closeAuth(); showToast(`Welcome back, ${found.name}! 🎬`);
}
function doSignup() {
  const name =document.getElementById('su-name').value.trim();
  const uname=document.getElementById('su-user').value.trim();
  const email=document.getElementById('su-email').value.trim();
  const pass =document.getElementById('su-pass').value;
  const e    =document.getElementById('su-err');
  if (!name||!uname||!email||!pass) { e.textContent='Fill all fields'; return; }
  if (users.find(x=>x.username===uname)) { e.textContent='Username taken'; return; }
  if (pass.length<6) { e.textContent='Password min 6 chars'; return; }
  const newUser={name,username:uname,email,password:pass};
  users.push(newUser);
  localStorage.setItem('cv_users',JSON.stringify(users));
  setUser(newUser); closeAuth(); showToast(`Welcome to CineVault, ${name}! 🎉`);
}
function setUser(u) {
  user = u;
  localStorage.setItem('cv_user', JSON.stringify(u));
  // Desktop auth buttons → hide; avatar → show
  document.getElementById('authBtns').style.display      = 'none';
  document.getElementById('userMenu').style.display      = 'flex';
  document.getElementById('avatarEl').textContent        = u.name[0].toUpperCase();
  document.getElementById('profileAvLg').textContent     = u.name[0].toUpperCase();
  document.getElementById('profileNameEl').textContent   = u.name;
  document.getElementById('profileEmailEl').textContent  = u.email;
  // Drawer
  document.getElementById('drawerAuthBtns').style.display= 'none';
  document.getElementById('drawerUserInfo').style.display= 'block';
  document.getElementById('drawerAvatarEl').textContent  = u.name[0].toUpperCase();
  document.getElementById('drawerUserName').textContent  = u.name;
  updateCounts();
}
function restoreUser() { if (user) setUser(user); }

// ── AUTH GATE ─────────────────────────────────────────────
function requireLogin(action) {
  if (!user) {
    openAuth('login');
    showToast('Please sign in to continue');
    return false;
  }
  if (action) action();
  return true;
}

function logout() {
  user=null; localStorage.removeItem('cv_user');
  document.getElementById('authBtns').style.display       = 'flex';
  document.getElementById('userMenu').style.display       = 'none';
  document.getElementById('drawerAuthBtns').style.display = 'block';
  document.getElementById('drawerUserInfo').style.display = 'none';
  showPage('home'); showToast('Signed out');
}
function updateCounts() {
  document.getElementById('wlCountEl').textContent     = watchlist.length;
  const myR = Object.values(reviews).flatMap(a=>a).filter(r=>r.author===user?.name).length;
  document.getElementById('reviewCountEl').textContent = myR;
}

// ── MOBILE MENU ──────────────────────────────────────────
function toggleMobileMenu() {
  const drawer   = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const burger   = document.getElementById('hamburger');
  const open = drawer.classList.toggle('open');
  backdrop.classList.toggle('open', open);
  burger.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeMobileMenu() {
  document.getElementById('mobileDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.body.style.overflow = '';
}

// ── PAGE NAVIGATION ──────────────────────────────────────
function showPage(name) {
  // Gate non-home pages behind login
  const gatedPages = ['movies','free','watchlist','search'];
  if (gatedPages.includes(name) && !user) {
    openAuth('login');
    showToast('Please sign in to continue');
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const map = { home:'homePage', movies:'moviesPage', free:'freePage', watchlist:'watchlistPage', profile:'profilePage', search:'searchPage' };
  const el = document.getElementById(map[name]);
  if (el) el.classList.add('active');
  window.scrollTo({ top:0, behavior:'smooth' });

  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page===name);
  });

  if (name==='movies') {
    buildGenreBar();
    if (!document.getElementById('browseGrid').children.length) { browsePageNum=1; fetchBrowse(true); }
  }
  if (name==='free')      loadFreePage();
  if (name==='watchlist') loadWatchlistPage();
  if (name==='profile' && !user) { openAuth('login'); showPage('home'); return; }
  if (name !== 'home') clearHeroTrailer();

  setTimeout(() => { if (window._revealFn) window._revealFn(); }, 100);
}

// ── CURSOR ───────────────────────────────────────────────
function setupCursor() {
  // Simple cursor — hide custom ring/dot elements, use normal system cursor
  const cursor = document.getElementById('cursor');
  const dot    = document.getElementById('cursorDot');
  if (cursor) cursor.style.display = 'none';
  if (dot)    dot.style.display    = 'none';
}


// ── TOAST ────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

// ── NOT AVAILABLE FREE ────────────────────────────────────
function showNotAvailableFree(title) {
  const old = document.getElementById('notAvailableModal');
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = 'notAvailableModal';
  el.innerHTML = `
    <div class="na-backdrop" onclick="document.getElementById('notAvailableModal').remove()"></div>
    <div class="na-box" id="naBox">
      <div class="na-icon">😔</div>
      <h3 class="na-title">Not Available for Free</h3>
      <p class="na-msg">
        <strong>"${title}"</strong> is not available on any free streaming platform right now.<br><br>
        Upgrade to <strong>Pro</strong> to unlock rentals, purchases & premium streams.
      </p>
      <div class="na-actions">
        <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" class="na-btn-pro"
           onclick="document.getElementById('notAvailableModal').remove()">
          🚀 Buy Pro — Watch Anything
        </a>
        <button class="na-btn-close" onclick="document.getElementById('notAvailableModal').remove()">
          Maybe Later
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    const box = document.getElementById('naBox');
    if (box) box.classList.add('open');
  });
}

// ── MOBILE SEARCH ────────────────────────────────────────
function openMobileSearch() {
  const bar = document.getElementById('mobileSearchBar');
  const inp = document.getElementById('mobileSearchInput');
  if (!bar) return;
  bar.classList.add('open');
  setTimeout(() => inp && inp.focus(), 350);
}

function closeMobileSearch() {
  const bar = document.getElementById('mobileSearchBar');
  if (bar) bar.classList.remove('open');
}

// Wire up mobile search input on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('mobileSearchInput');
  if (inp) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        // Sync value to desktop input and search
        const desktopInput = document.getElementById('searchInput');
        if (desktopInput) desktopInput.value = inp.value;
        closeMobileSearch();
        searchMovies();
      }
      if (e.key === 'Escape') closeMobileSearch();
    });
  }
});

// ══════════════════════════════════════════════════════════════
//  ONBOARDING TOUR
// ══════════════════════════════════════════════════════════════
var OB_KEY = 'cv_onboarded_v1';
var _obStep = 0;
var _obResizeFn = null;

var OB_STEPS = [
  { type:'welcome', icon:'🎬', title:'Welcome to CineVault',
    desc:'Discover thousands of films, build your watchlist, and stream classics.\n\nLet us show you around in 4 quick steps.',
    btn:"Let's Go →" },
  { type:'spotlight', targetId:'searchInput', targetIdMobile:'mobileSearchBtn',
    icon:'🔍', stepLabel:'Step 1 of 4', title:'Search Any Film',
    desc:'Type any movie title and press Enter. Sign in first to unlock search.', btn:'Next →', arrow:'down' },
  { type:'spotlight', targetId:'authBtns', targetIdMobile:'hamburger',
    icon:'🔐', stepLabel:'Step 2 of 4', title:'Sign In or Join Free',
    desc:'Create a free account to unlock search, watchlist, trailers, and free movies.', btn:'Next →', arrow:'down' },
  { type:'spotlight', targetSelector:'[data-page="watchlist"]',
    icon:'📋', stepLabel:'Step 3 of 4', title:'Build Your Watchlist',
    desc:'Save movies to watch later. Click "+ My List" on any card.', btn:'Next →', arrow:'down' },
  { type:'spotlight', targetSelector:'.movie-card',
    icon:'🎥', stepLabel:'Step 4 of 4', title:'Click Any Movie',
    desc:'Tap any movie to see details, trailer, cast and stream free where available.', btn:'Done! 🎉', arrow:'up' },
];

function startOnboarding() {
  try {
    if (localStorage.getItem(OB_KEY)) return;
    _obStep = 0;
    var ov = document.getElementById('onboardingOverlay');
    if (!ov) return;
    ov.style.display = 'block';
    renderObStep();
  } catch(e) { console.warn('onboarding:', e); }
}

function renderObStep() {
  try {
    var step = OB_STEPS[_obStep];
    var card = document.getElementById('onboardingCard');
    var spot = document.getElementById('onboardingSpotlight');
    if (!card || !spot) return;
    if (_obResizeFn) window.removeEventListener('resize', _obResizeFn);

    var dots = OB_STEPS.map(function(_,i){
      return '<div class="ob-dot'+(i===_obStep?' active':'')+'"></div>';
    }).join('');

    card.innerHTML =
      '<div class="ob-icon-row">'+step.icon+'</div>'+
      (step.stepLabel?'<div class="ob-step-label">'+step.stepLabel+'</div>':'')+
      '<div class="ob-title">'+step.title+'</div>'+
      '<div class="ob-desc">'+(step.desc||'').replace(/\n/g,'<br>')+'</div>'+
      '<div class="ob-dots">'+dots+'</div>'+
      '<div class="ob-actions">'+
        '<button class="ob-btn-skip" onclick="finishOnboarding()">Skip tour</button>'+
        '<button class="ob-btn-next" onclick="obNext()">'+step.btn+'</button>'+
      '</div>';

    if (step.type === 'welcome') {
      card.className = 'ob-welcome';
      card.style.cssText = '';
      spot.style.display = 'none';
      // clicking outside welcome card = next step
      document.getElementById('onboardingMask').onclick = function(){ obNext(); };
      return;
    }

    // clicking outside spotlight = next step
    document.getElementById('onboardingMask').onclick = function(){ obNext(); };

    card.className = '';
    spot.style.display = 'block';

    var isMobile = window.innerWidth < 768;
    var target = null;
    if (isMobile && step.targetIdMobile) target = document.getElementById(step.targetIdMobile);
    if (!target && step.targetId) {
      target = document.getElementById(step.targetId);
      if (target && isMobile && target.offsetParent === null)
        target = step.targetIdMobile ? document.getElementById(step.targetIdMobile) : null;
    }
    if (!target && step.targetSelector) target = document.querySelector(step.targetSelector);

    if (!target || target.offsetParent === null) { obNext(); return; }

    positionOb(target, step, card, spot);
    _obResizeFn = function(){ positionOb(target, step, card, spot); };
    window.addEventListener('resize', _obResizeFn);
  } catch(e) { console.warn('renderObStep:', e); }
}

function positionOb(target, step, card, spot) {
  var PAD=10, MARGIN=14;
  var r = target.getBoundingClientRect();
  spot.style.left   = (r.left-PAD)+'px';
  spot.style.top    = (r.top-PAD)+'px';
  spot.style.width  = (r.width+PAD*2)+'px';
  spot.style.height = (r.height+PAD*2)+'px';

  var cardW = Math.min(320, window.innerWidth*0.88);
  var arrow = step.arrow||'up';
  var cardTop, cardLeft;

  if (arrow==='down') {
    cardTop  = r.bottom+PAD+MARGIN;
    cardLeft = Math.max(MARGIN, Math.min(r.left, window.innerWidth-cardW-MARGIN));
  } else {
    cardTop  = r.top-PAD-MARGIN-230;
    cardLeft = Math.max(MARGIN, Math.min(r.left, window.innerWidth-cardW-MARGIN));
    if (cardTop < 80) { cardTop = r.bottom+PAD+MARGIN; }
  }

  card.className = 'arrow-'+arrow;
  card.style.cssText = 'position:fixed;top:'+cardTop+'px;left:'+cardLeft+'px;width:'+cardW+'px;';
}

function obNext() {
  _obStep++;
  if (_obStep >= OB_STEPS.length) finishOnboarding();
  else renderObStep();
}

function finishOnboarding() {
  try {
    if (_obResizeFn) window.removeEventListener('resize', _obResizeFn);
    var ov = document.getElementById('onboardingOverlay');
    if (ov) {
      document.getElementById('onboardingMask').onclick = null;
      localStorage.setItem(OB_KEY,'1');
      ov.style.transition='opacity 0.4s';
      ov.style.opacity='0';
      setTimeout(function(){ ov.style.display='none'; ov.style.opacity=''; ov.style.transition=''; },420);
    }
  } catch(e){}
}
