/// Server-rendered HTML for every admin dashboard page. Pure string
/// builders — no Handlebars / EJS / view engine. We pull Tailwind from
/// the CDN so styling stays modern without a build pipeline.
///
/// The layout function takes a `body` block and decorates it with the
/// sidebar + top bar. Active nav item is computed from `current`.

/// HTML-escape user-controlled text so a clever displayName can't break
/// out of an attribute or run a script. Every value we interpolate
/// through these templates goes through this.
export function esc(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/// Indian-rupee formatting for stat cards. Matches the mobile client's
/// formatInr() output ("₹12,34,567.89"), abbreviated to L/Cr above 1 lakh.
export function inr(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '—';
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (abs >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    if (abs >= 1000) return `₹${(value / 1000).toFixed(2)} K`;
  }
  const neg = value < 0;
  const abs = Math.abs(value).toFixed(2);
  const [intStr, frac] = abs.split('.');
  let grouped: string;
  if (intStr.length <= 3) {
    grouped = intStr;
  } else {
    const last3 = intStr.slice(-3);
    let rest = intStr.slice(0, -3);
    const groups = [last3];
    while (rest.length > 2) {
      groups.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest.length) groups.unshift(rest);
    grouped = groups.join(',');
  }
  return `${neg ? '-' : ''}₹${grouped}.${frac}`;
}

export interface LayoutOpts {
  title: string;
  current:
    | 'dashboard'
    | 'users'
    | 'trading'
    | 'rooms'
    | 'referrals'
    | 'learning'
    | 'messages'
    | 'notifications'
    | 'health'
    | 'settings'
    | 'audit';
  adminEmail: string;
  body: string;
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Overview', href: '/admin', icon: '◉' },
  { key: 'users', label: 'Users', href: '/admin/users', icon: '◐' },
  { key: 'trading', label: 'Trading', href: '/admin/trading', icon: '⇄' },
  { key: 'rooms', label: 'Rooms', href: '/admin/rooms', icon: '◌' },
  { key: 'referrals', label: 'Referrals', href: '/admin/referrals', icon: '↗' },
  { key: 'learning', label: 'Learning', href: '/admin/learning', icon: '◆' },
  { key: 'messages', label: 'Messages', href: '/admin/messages', icon: '✉' },
  { key: 'notifications', label: 'Notifications', href: '/admin/notifications', icon: '✷' },
  { key: 'health', label: 'System health', href: '/admin/health', icon: '♥' },
  { key: 'settings', label: 'Settings', href: '/admin/settings', icon: '⚙' },
  { key: 'audit', label: 'Audit log', href: '/admin/audit', icon: '☰' },
] as const;

export function layout(opts: LayoutOpts): string {
  const nav = NAV_ITEMS.map((item) => {
    const active = item.key === opts.current;
    return `<a href="${item.href}" class="${navClass(active)}">
      <span class="text-zinc-500 mr-2">${item.icon}</span>${item.label}
    </a>`;
  }).join('');
  return `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(opts.title)} · StockVirtue admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={darkMode:'class',theme:{extend:{fontFamily:{sans:['Inter','system-ui','sans-serif']}}}}</script>
<style>
  body{font-family:Inter,system-ui,sans-serif}
  .nav-active{background:rgba(99,102,241,.18);color:#a5b4fc;border-left:3px solid #6366f1}
  .nav-idle{color:#a1a1aa;border-left:3px solid transparent}
  .nav-idle:hover{background:rgba(99,102,241,.08);color:#e4e4e7}
  table thead th{position:sticky;top:0;background:#18181b}
  .glow{box-shadow:0 0 0 1px rgba(99,102,241,.18),0 8px 32px -8px rgba(99,102,241,.25)}
</style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex">
  <aside class="w-60 shrink-0 bg-zinc-900/70 border-r border-zinc-800 flex flex-col">
    <div class="p-5 border-b border-zinc-800">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white font-black">N</div>
        <div>
          <div class="font-bold tracking-tight">StockVirtue</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-widest">Admin console</div>
        </div>
      </div>
    </div>
    <nav class="flex-1 py-4 flex flex-col">
      ${nav}
    </nav>
    <div class="p-4 border-t border-zinc-800 text-xs">
      <div class="text-zinc-500">Signed in as</div>
      <div class="font-semibold truncate">${esc(opts.adminEmail)}</div>
      <form method="post" action="/admin/logout" class="mt-3">
        <button class="w-full text-left text-zinc-400 hover:text-rose-400 transition">→ Log out</button>
      </form>
    </div>
  </aside>
  <main class="flex-1 overflow-y-auto">
    <header class="px-8 py-5 border-b border-zinc-800 flex items-center gap-4 sticky top-0 bg-zinc-950/85 backdrop-blur z-10">
      <h1 class="text-xl font-bold tracking-tight">${esc(opts.title)}</h1>
      <span class="text-zinc-600 text-xs">${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
    </header>
    <div class="p-8">${opts.body}</div>
  </main>
</body>
</html>`;
}

function navClass(active: boolean): string {
  const base =
    'flex items-center px-5 py-2.5 text-sm font-medium transition select-none';
  return `${base} ${active ? 'nav-active' : 'nav-idle'}`;
}

// ─── Login page ─────────────────────────────────────────────────────────

export function loginPage(opts: {
  error?: string | null;
  back?: string;
}): string {
  return `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>StockVirtue admin · sign in</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:Inter,system-ui,sans-serif}</style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center px-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white text-lg font-black">N</div>
        <div class="text-left">
          <div class="font-bold text-lg">StockVirtue</div>
          <div class="text-[11px] text-zinc-500 uppercase tracking-widest">Admin console</div>
        </div>
      </div>
    </div>
    <form method="post" action="/admin/login" class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-7">
      <h1 class="text-base font-bold mb-1">Sign in to continue</h1>
      <p class="text-xs text-zinc-500 mb-6">Only operators with the env-configured credentials can access this console.</p>
      <label class="block text-xs uppercase tracking-wider text-zinc-500 mb-1">Email</label>
      <input type="email" name="email" required autofocus
        class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 mb-4 focus:outline-none focus:border-indigo-500" />
      <label class="block text-xs uppercase tracking-wider text-zinc-500 mb-1">Password</label>
      <input type="password" name="password" required
        class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 mb-2 focus:outline-none focus:border-indigo-500" />
      <input type="hidden" name="back" value="${esc(opts.back ?? '/admin')}" />
      ${opts.error
        ? `<div class="mt-3 mb-2 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">${esc(opts.error)}</div>`
        : ''}
      <button type="submit" class="mt-5 w-full bg-indigo-500 hover:bg-indigo-400 transition text-white font-bold py-2.5 rounded-lg">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

// ─── Dashboard overview ─────────────────────────────────────────────────

interface Overview {
  users: {
    total: number;
    newToday: number;
    newThisWeek: number;
    active24h: number;
    blocked: number;
  };
  orders: {
    today: number;
    filledToday: number;
    pending: number;
    cancelledToday: number;
  };
  money: { totalCash: number; totalReserved: number; lifetimeFees: number };
  activity: {
    openPositions: number;
    rooms: number;
    liveTournaments: number;
    referralsCompleted: number;
  };
  lastSnapshot: { asOfDate: Date; createdAt: Date } | null;
}

export function dashboardBody(s: Overview): string {
  const cards = [
    statCard('Total users', s.users.total.toLocaleString(), {
      sub: `${s.users.newToday} today · ${s.users.newThisWeek} this week`,
      tint: 'from-indigo-500/30 to-indigo-500/5',
    }),
    statCard('Active (24h)', s.users.active24h.toLocaleString(), {
      sub: `${s.users.blocked} blocked`,
      tint: 'from-emerald-500/30 to-emerald-500/5',
    }),
    statCard('Orders today', s.orders.today.toLocaleString(), {
      sub: `${s.orders.filledToday} filled · ${s.orders.pending} pending`,
      tint: 'from-cyan-500/30 to-cyan-500/5',
    }),
    statCard('Open positions', s.activity.openPositions.toLocaleString(), {
      sub: `Across all users`,
      tint: 'from-amber-500/30 to-amber-500/5',
    }),
    statCard('Cash in wallets', inr(s.money.totalCash, { compact: true }), {
      sub: `+${inr(s.money.totalReserved, { compact: true })} reserved`,
      tint: 'from-fuchsia-500/30 to-fuchsia-500/5',
    }),
    statCard('Lifetime fees', inr(s.money.lifetimeFees, { compact: true }), {
      sub: 'Brokerage + STT + GST + …',
      tint: 'from-pink-500/30 to-pink-500/5',
    }),
    statCard('Trading rooms', s.activity.rooms.toLocaleString(), {
      sub: `${s.activity.liveTournaments} live tournaments`,
      tint: 'from-violet-500/30 to-violet-500/5',
    }),
    statCard(
      'Referrals completed',
      s.activity.referralsCompleted.toLocaleString(),
      {
        sub: 'Codes successfully redeemed',
        tint: 'from-rose-500/30 to-rose-500/5',
      },
    ),
  ].join('');

  const lastSnap = s.lastSnapshot
    ? `Last run for ${esc(
        s.lastSnapshot.asOfDate.toISOString().slice(0, 10),
      )} at ${esc(
        s.lastSnapshot.createdAt.toISOString().replace('T', ' ').slice(0, 19),
      )} UTC`
    : 'No snapshots have run yet';

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">${cards}</div>
    <section class="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 lg:col-span-2">
        <h2 class="font-bold mb-1">Daily portfolio snapshot</h2>
        <p class="text-xs text-zinc-500 mb-4">Runs at 00:05 IST. Backs the calendar heatmap, period leaderboards, and room baselines.</p>
        <div class="text-sm">${esc(lastSnap)}</div>
        <form method="post" action="/admin/snapshot/run" class="mt-4">
          <button class="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/40">Run snapshot now</button>
        </form>
      </div>
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h2 class="font-bold mb-3">Quick links</h2>
        <ul class="text-sm space-y-1.5 text-zinc-300">
          <li>→ <a class="hover:text-indigo-400" href="/admin/users">Users (search, detail)</a></li>
          <li>→ <a class="hover:text-indigo-400" href="/admin/trading">Recent orders</a></li>
          <li>→ <a class="hover:text-indigo-400" href="/admin/rooms">Rooms + tournaments</a></li>
          <li>→ <a class="hover:text-indigo-400" href="/admin/referrals">Top referrers</a></li>
          <li>→ <a class="hover:text-indigo-400" href="/admin/health">System health</a></li>
        </ul>
      </div>
    </section>
  `;
}

function statCard(
  label: string,
  value: string,
  opts: { sub?: string; tint?: string } = {},
): string {
  const tint = opts.tint ?? 'from-indigo-500/30 to-indigo-500/5';
  return `<div class="relative overflow-hidden bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
    <div class="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${tint} blur-2xl"></div>
    <div class="relative">
      <div class="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">${esc(label)}</div>
      <div class="text-3xl font-black mt-1 tracking-tight">${esc(value)}</div>
      ${opts.sub ? `<div class="text-xs text-zinc-500 mt-1">${esc(opts.sub)}</div>` : ''}
    </div>
  </div>`;
}

// ─── Users list ─────────────────────────────────────────────────────────

export function usersBody(list: {
  page: number;
  pages: number;
  total: number;
  q: string;
  rows: Array<{
    id: string;
    phone: string | null;
    email: string | null;
    displayName: string | null;
    status: string;
    referralCode: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    balance: number;
    orderCount: number;
    positionCount: number;
    referralCount: number;
  }>;
}): string {
  const rows = list.rows
    .map((u) => {
      const statusTone =
        u.status === 'ACTIVE'
          ? 'bg-emerald-500/15 text-emerald-300'
          : u.status === 'BLOCKED'
            ? 'bg-rose-500/15 text-rose-300'
            : 'bg-amber-500/15 text-amber-300';
      return `<tr class="border-b border-zinc-800 hover:bg-zinc-900/60">
        <td class="px-3 py-3"><a href="/admin/users/${esc(u.id)}" class="font-medium text-indigo-300 hover:underline">${esc(u.displayName ?? '—')}</a><div class="text-[11px] text-zinc-500">${esc(u.phone ?? '')}</div></td>
        <td class="px-3 py-3 text-zinc-300">${esc(u.email ?? '—')}</td>
        <td class="px-3 py-3"><span class="text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider ${statusTone}">${esc(u.status)}</span></td>
        <td class="px-3 py-3 text-right">${esc(inr(u.balance, { compact: true }))}</td>
        <td class="px-3 py-3 text-right">${u.orderCount}</td>
        <td class="px-3 py-3 text-right">${u.positionCount}</td>
        <td class="px-3 py-3 text-right">${u.referralCount}</td>
        <td class="px-3 py-3 font-mono text-[11px] text-zinc-500">${esc(u.referralCode ?? '—')}</td>
        <td class="px-3 py-3 text-[11px] text-zinc-500">${esc(u.createdAt.slice(0, 10))}</td>
      </tr>`;
    })
    .join('');
  const search = `<form method="get" class="flex items-center gap-2 mb-4">
    <input type="text" name="q" value="${esc(list.q)}" placeholder="Search by name, phone, email, ID or referral code"
      class="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
    <button class="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm rounded-lg">Search</button>
    ${list.q ? `<a href="/admin/users" class="text-zinc-500 text-sm">Clear</a>` : ''}
  </form>`;
  const pager = renderPager(
    list.page,
    list.pages,
    (p) => `/admin/users?page=${p}${list.q ? `&q=${encodeURIComponent(list.q)}` : ''}`,
  );
  return `
    ${search}
    <div class="text-xs text-zinc-500 mb-2">${list.total.toLocaleString()} user${list.total === 1 ? '' : 's'} match</div>
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
          <tr>
            <th class="px-3 py-3 text-left">User</th>
            <th class="px-3 py-3 text-left">Email</th>
            <th class="px-3 py-3 text-left">Status</th>
            <th class="px-3 py-3 text-right">Balance</th>
            <th class="px-3 py-3 text-right">Orders</th>
            <th class="px-3 py-3 text-right">Positions</th>
            <th class="px-3 py-3 text-right">Invited</th>
            <th class="px-3 py-3 text-left">Code</th>
            <th class="px-3 py-3 text-left">Joined</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="9" class="px-3 py-12 text-center text-zinc-500">No users match this query.</td></tr>`}</tbody>
      </table>
    </div>
    ${pager}
  `;
}

function renderPager(
  page: number,
  pages: number,
  href: (p: number) => string,
): string {
  if (pages <= 1) return '';
  const prev = page > 1
    ? `<a href="${href(page - 1)}" class="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm hover:bg-zinc-800">← Prev</a>`
    : `<span class="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-900 text-sm text-zinc-700">← Prev</span>`;
  const next = page < pages
    ? `<a href="${href(page + 1)}" class="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm hover:bg-zinc-800">Next →</a>`
    : `<span class="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-900 text-sm text-zinc-700">Next →</span>`;
  return `<div class="flex items-center gap-2 mt-4">
    ${prev}<span class="text-sm text-zinc-500">Page ${page} of ${pages}</span>${next}
  </div>`;
}

// ─── User detail ────────────────────────────────────────────────────────

export function userDetailBody(u: NonNullable<UserDetailLike>): string {
  const positionRows = u.positionsPretty
    .map(
      (p) => `<tr class="border-b border-zinc-800">
        <td class="px-3 py-2 font-medium">${esc(p.symbol)}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${esc(p.exchange)} · ${esc(p.product)}</td>
        <td class="px-3 py-2 text-right">${p.quantity}</td>
        <td class="px-3 py-2 text-right">${esc(inr(p.avgPrice))}</td>
        <td class="px-3 py-2 text-right ${p.realizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${esc(inr(p.realizedPnL))}</td>
      </tr>`,
    )
    .join('');
  const orderRows = u.ordersPretty
    .map(
      (o) => `<tr class="border-b border-zinc-800">
        <td class="px-3 py-2"><span class="font-medium">${esc(o.symbol)}</span> <span class="text-[10px] text-zinc-500">${esc(o.side)} ${esc(o.type)}</span></td>
        <td class="px-3 py-2">${orderStatusTag(o.status)}</td>
        <td class="px-3 py-2 text-right">${o.quantity}</td>
        <td class="px-3 py-2 text-right">${o.fillPrice ? esc(inr(o.fillPrice)) : o.limitPrice ? esc(inr(o.limitPrice)) : '—'}</td>
        <td class="px-3 py-2 text-right text-zinc-400">${esc(inr(o.fees))}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${esc(o.createdAt.slice(0, 16).replace('T', ' '))}</td>
      </tr>`,
    )
    .join('');
  const referredBy = u.referredBy
    ? `<a class="text-indigo-300 hover:underline" href="/admin/users/${esc(u.referredBy.id)}">${esc(u.referredBy.displayName ?? u.referredBy.email ?? 'Unknown')}</a>`
    : '<span class="text-zinc-500">—</span>';
  const isBlocked = u.status === 'BLOCKED';
  const blockAction = isBlocked
    ? `<form method="post" action="/admin/users/${esc(u.id)}/unblock" class="inline">
        <button class="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 font-bold">↑ Unblock</button>
      </form>`
    : `<form method="post" action="/admin/users/${esc(u.id)}/block" class="inline" onsubmit="return confirm('Block this user? They will be signed out and unable to log back in until you unblock them.');">
        <button class="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-bold">↓ Block account</button>
      </form>`;
  return `
    <div class="flex items-center justify-between">
      <a href="/admin/users" class="text-sm text-zinc-400 hover:text-indigo-300">← Back to all users</a>
      <div>${blockAction}</div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 lg:col-span-2">
        <h2 class="text-lg font-bold">${esc(u.displayName ?? '—')}</h2>
        <div class="text-xs text-zinc-500 mt-0.5">${esc(u.phone ?? '')} · ${esc(u.emailAlias ?? 'no email')}</div>
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Status</div><div class="mt-1 text-sm font-bold">${esc(u.status)}</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Joined</div><div class="mt-1 text-sm">${esc(u.createdAt.toISOString().slice(0, 10))}</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Last login</div><div class="mt-1 text-sm">${esc(u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : '—')}</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Referral code</div><div class="mt-1 text-sm font-mono">${esc(u.referralCode ?? '—')}</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Referred by</div><div class="mt-1 text-sm">${referredBy}</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-zinc-500">Invited</div><div class="mt-1 text-sm font-bold">${u.referralsCount}</div></div>
        </div>
      </div>
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h3 class="font-bold mb-3">Wallet</h3>
        <div class="text-3xl font-black tracking-tight">${esc(inr(u.balanceRupees, { compact: true }))}</div>
        <div class="text-xs text-zinc-500 mt-2">Reserved ${esc(inr(u.reservedRupees, { compact: true }))} · Margin ${esc(inr(u.marginRupees, { compact: true }))}</div>
        <div class="text-xs text-zinc-500 mt-1">${u.roomsCount} room${u.roomsCount === 1 ? '' : 's'}</div>
      </div>
    </div>
    <section class="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 class="font-bold">Positions</h3>
        <span class="text-xs text-zinc-500">${u.positionsPretty.length} row${u.positionsPretty.length === 1 ? '' : 's'}</span>
      </div>
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500"><tr>
          <th class="px-3 py-2 text-left">Symbol</th>
          <th class="px-3 py-2 text-left">Where</th>
          <th class="px-3 py-2 text-right">Qty</th>
          <th class="px-3 py-2 text-right">Avg</th>
          <th class="px-3 py-2 text-right">Realized P&amp;L</th>
        </tr></thead>
        <tbody>${positionRows || `<tr><td colspan="5" class="px-3 py-8 text-center text-zinc-500">No positions.</td></tr>`}</tbody>
      </table>
    </section>
    <section class="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 class="font-bold">Recent orders</h3>
        <span class="text-xs text-zinc-500">Latest 50</span>
      </div>
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500"><tr>
          <th class="px-3 py-2 text-left">Symbol</th>
          <th class="px-3 py-2 text-left">Status</th>
          <th class="px-3 py-2 text-right">Qty</th>
          <th class="px-3 py-2 text-right">Price</th>
          <th class="px-3 py-2 text-right">Fees</th>
          <th class="px-3 py-2 text-left">Placed</th>
        </tr></thead>
        <tbody>${orderRows || `<tr><td colspan="6" class="px-3 py-8 text-center text-zinc-500">No orders.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

export interface UserDetailLike {
  id: string;
  phone: string | null;
  emailAlias: string | null;
  displayName: string | null;
  status: string;
  referralCode: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  referredBy: { id: string; displayName: string | null; email: string | null } | null;
  balanceRupees: number;
  reservedRupees: number;
  marginRupees: number;
  referralsCount: number;
  roomsCount: number;
  positionsPretty: Array<{
    symbol: string;
    exchange: string;
    product: string;
    quantity: number;
    avgPrice: number;
    realizedPnL: number;
  }>;
  ordersPretty: Array<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    product: string;
    status: string;
    quantity: number;
    fillPrice: number | null;
    limitPrice: number | null;
    fees: number;
    createdAt: string;
  }>;
}

function orderStatusTag(status: string): string {
  const tones: Record<string, string> = {
    FILLED: 'bg-emerald-500/15 text-emerald-300',
    PENDING: 'bg-amber-500/15 text-amber-300',
    CANCELLED: 'bg-zinc-500/15 text-zinc-400',
    REJECTED: 'bg-rose-500/15 text-rose-300',
  };
  const tone = tones[status] ?? 'bg-zinc-700/30 text-zinc-300';
  return `<span class="text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider ${tone}">${esc(status)}</span>`;
}

// ─── Trading feed ───────────────────────────────────────────────────────

export function tradingBody(opts: {
  status: string;
  rows: Array<{
    id: string;
    userId: string;
    userName: string;
    symbol: string;
    side: string;
    type: string;
    product: string;
    status: string;
    quantity: number;
    fillPrice: number | null;
    limitPrice: number | null;
    fees: number;
    createdAt: string;
    filledAt: string | null;
  }>;
}): string {
  const statuses = ['ALL', 'FILLED', 'PENDING', 'CANCELLED', 'REJECTED'];
  const filters = statuses
    .map((s) => {
      const active = s === opts.status;
      const cls = active
        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200';
      return `<a href="/admin/trading?status=${s}" class="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider ${cls}">${s}</a>`;
    })
    .join('');
  const rows = opts.rows
    .map(
      (o) => `<tr class="border-b border-zinc-800 hover:bg-zinc-900/60">
        <td class="px-3 py-2 text-[11px] text-zinc-500"><a href="/admin/users/${esc(o.userId)}" class="hover:text-indigo-300">${esc(o.userName)}</a></td>
        <td class="px-3 py-2 font-medium">${esc(o.symbol)}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${esc(o.side)} ${esc(o.type)} · ${esc(o.product)}</td>
        <td class="px-3 py-2">${orderStatusTag(o.status)}</td>
        <td class="px-3 py-2 text-right">${o.quantity}</td>
        <td class="px-3 py-2 text-right">${o.fillPrice ? esc(inr(o.fillPrice)) : o.limitPrice ? esc(inr(o.limitPrice)) : '—'}</td>
        <td class="px-3 py-2 text-right text-zinc-400">${esc(inr(o.fees))}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${esc(o.createdAt.slice(0, 16).replace('T', ' '))}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="flex flex-wrap items-center gap-2 mb-4">${filters}</div>
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><tr>
          <th class="px-3 py-3 text-left">Trader</th>
          <th class="px-3 py-3 text-left">Symbol</th>
          <th class="px-3 py-3 text-left">Side</th>
          <th class="px-3 py-3 text-left">Status</th>
          <th class="px-3 py-3 text-right">Qty</th>
          <th class="px-3 py-3 text-right">Price</th>
          <th class="px-3 py-3 text-right">Fees</th>
          <th class="px-3 py-3 text-left">Placed</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="px-3 py-12 text-center text-zinc-500">No orders match this filter.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ─── Rooms ─────────────────────────────────────────────────────────────

export function roomsBody(rows: Array<{
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  isTournament: boolean;
  memberCount: number;
  maxMembers: number;
  ownerName: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}>): string {
  const body = rows
    .map((r) => {
      const visibility = r.isPublic
        ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold tracking-wider">PUBLIC</span>`
        : `<span class="text-[10px] px-2 py-0.5 rounded-md bg-zinc-700/30 text-zinc-300 font-bold tracking-wider">PRIVATE</span>`;
      const tourney = r.isTournament
        ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-bold tracking-wider">TOURNEY</span>`
        : '';
      const window = r.isTournament && r.startsAt && r.endsAt
        ? `${esc(r.startsAt.slice(0, 10))} → ${esc(r.endsAt.slice(0, 10))}`
        : '—';
      const limit = r.maxMembers === 0 ? '∞' : r.maxMembers;
      return `<tr class="border-b border-zinc-800">
        <td class="px-3 py-3"><div class="font-medium">${esc(r.name)}</div><div class="text-[11px] font-mono text-zinc-500">${esc(r.code)}</div></td>
        <td class="px-3 py-3">${visibility} ${tourney}</td>
        <td class="px-3 py-3 text-right font-bold">${r.memberCount} / ${limit}</td>
        <td class="px-3 py-3 text-zinc-300">${esc(r.ownerName)}</td>
        <td class="px-3 py-3 text-[11px] text-zinc-500">${esc(window)}</td>
        <td class="px-3 py-3 text-[11px] text-zinc-500">${esc(r.createdAt.slice(0, 10))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><tr>
          <th class="px-3 py-3 text-left">Room</th>
          <th class="px-3 py-3 text-left">Flags</th>
          <th class="px-3 py-3 text-right">Members</th>
          <th class="px-3 py-3 text-left">Host</th>
          <th class="px-3 py-3 text-left">Tournament window</th>
          <th class="px-3 py-3 text-left">Created</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="6" class="px-3 py-12 text-center text-zinc-500">No rooms have been created yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ─── Referrals ─────────────────────────────────────────────────────────

export function referralsBody(rows: Array<{
  userId: string;
  displayName: string;
  email: string | null;
  referralCode: string | null;
  count: number;
}>): string {
  const body = rows
    .map(
      (r, i) => `<tr class="border-b border-zinc-800">
        <td class="px-3 py-3 text-right text-zinc-500 font-bold w-12">${i + 1}</td>
        <td class="px-3 py-3"><a href="/admin/users/${esc(r.userId)}" class="font-medium hover:text-indigo-300">${esc(r.displayName)}</a><div class="text-[11px] text-zinc-500">${esc(r.email ?? '')}</div></td>
        <td class="px-3 py-3 font-mono text-[11px] text-zinc-500">${esc(r.referralCode ?? '—')}</td>
        <td class="px-3 py-3 text-right"><span class="text-base font-black tracking-tight">${r.count}</span> <span class="text-[10px] text-zinc-500 ml-1">invited</span></td>
      </tr>`,
    )
    .join('');
  return `
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><tr>
          <th class="px-3 py-3 text-right w-12">#</th>
          <th class="px-3 py-3 text-left">Referrer</th>
          <th class="px-3 py-3 text-left">Code</th>
          <th class="px-3 py-3 text-right">Invites</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="4" class="px-3 py-12 text-center text-zinc-500">No completed referrals yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ─── Settings (auth methods / feature flags) ────────────────────────────

export function settingsBody(opts: {
  mobileOtp: { key: string; enabled: boolean };
  tradingHalted: { key: string; enabled: boolean };
}): string {
  return `
    <div class="max-w-2xl space-y-6">
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h2 class="font-bold mb-1">Authentication methods</h2>
        <p class="text-xs text-zinc-500 mb-5">Control which sign-in options the mobile app offers. Changes take effect the next time the app launches or refreshes its config.</p>
        ${authMethodRow('Email &amp; password', 'Server-managed accounts with email-OTP verification. Always on.', true, null)}
        ${authMethodRow('Google sign-in', 'Federated sign-in via Firebase. Always on.', true, null)}
        ${authMethodRow('Mobile OTP (phone)', 'Phone-number login via Firebase SMS. Pause to hide it in the app.', opts.mobileOtp.enabled, opts.mobileOtp.key)}
      </div>
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h2 class="font-bold mb-1">Platform controls</h2>
        <p class="text-xs text-zinc-500 mb-5">Emergency levers — use with care.</p>
        ${killSwitchRow(opts.tradingHalted)}
      </div>
    </div>
  `;
}

/// Trading kill-switch row. Inverted semantics vs. the auth toggles: "enabled"
/// means HALTED (bad), so it gets danger styling and a confirm on halt.
function killSwitchRow(flag: { key: string; enabled: boolean }): string {
  const halted = flag.enabled;
  const badge = halted
    ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-bold tracking-wider">HALTED</span>`
    : `<span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold tracking-wider">LIVE</span>`;
  const confirm = halted
    ? ''
    : `onsubmit="return confirm('Halt ALL order placement across the app right now?');"`;
  return `<div class="flex items-center gap-3 py-3.5">
    <div class="min-w-0">
      <div class="font-medium text-sm flex items-center gap-2">Order placement ${badge}</div>
      <div class="text-xs text-zinc-500 mt-0.5">When halted, the backend rejects all new orders (existing pending orders are untouched). Takes effect immediately.</div>
    </div>
    <form method="post" action="/admin/settings/feature-flag" class="ml-auto shrink-0" ${confirm}>
      <input type="hidden" name="key" value="${esc(flag.key)}" />
      <input type="hidden" name="enabled" value="${halted ? 'false' : 'true'}" />
      <button class="text-xs px-3 py-1.5 rounded-lg border font-bold ${
        halted
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
      }">${halted ? 'Resume trading' : 'Halt trading'}</button>
    </form>
  </div>`;
}

function authMethodRow(
  label: string,
  desc: string,
  enabled: boolean,
  toggleKey: string | null,
): string {
  const badge = enabled
    ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold tracking-wider">ENABLED</span>`
    : `<span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-bold tracking-wider">PAUSED</span>`;
  const action = toggleKey
    ? `<form method="post" action="/admin/settings/feature-flag" class="ml-auto shrink-0">
        <input type="hidden" name="key" value="${esc(toggleKey)}" />
        <input type="hidden" name="enabled" value="${enabled ? 'false' : 'true'}" />
        <button class="text-xs px-3 py-1.5 rounded-lg border font-bold ${
          enabled
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
        }">${enabled ? 'Pause' : 'Resume'}</button>
      </form>`
    : `<span class="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-md bg-zinc-700/30 text-zinc-400 font-bold tracking-wider">LOCKED</span>`;
  return `<div class="flex items-center gap-3 py-3.5 border-b border-zinc-800 last:border-0">
    <div class="min-w-0">
      <div class="font-medium text-sm flex items-center gap-2">${label} ${badge}</div>
      <div class="text-xs text-zinc-500 mt-0.5">${desc}</div>
    </div>
    ${action}
  </div>`;
}

// ─── Notifications ──────────────────────────────────────────────────────

export function notificationsBody(opts: {
  sent: { recipients: number } | null;
}): string {
  const input =
    'w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500';
  const label = 'block text-xs font-medium text-zinc-400 mb-1.5';
  return `
    <div class="max-w-2xl space-y-6">
      ${
        opts.sent
          ? `<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-300">Notification sent to ${opts.sent.recipients} recipient${opts.sent.recipients === 1 ? '' : 's'}.</div>`
          : ''
      }
      <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h2 class="font-bold mb-1">Send a push notification</h2>
        <p class="text-xs text-zinc-500 mb-5">Delivers instantly to open apps over the realtime socket, stores a copy in each recipient's in-app inbox, and pushes via FCM for background delivery.</p>
        <form method="post" action="/admin/notifications/send" class="space-y-4" onsubmit="return confirm('Send this notification now?');">
          <div>
            <label class="${label}">Audience</label>
            <select name="audience" class="${input}">
              <option value="all">All users</option>
              <option value="user">A single user (by user id)</option>
            </select>
          </div>
          <div>
            <label class="${label}">User id <span class="text-zinc-600">(only when targeting a single user)</span></label>
            <input name="userId" class="${input}" placeholder="clxxxxxxxx…" />
          </div>
          <div>
            <label class="${label}">Title</label>
            <input name="title" maxlength="80" required class="${input}" placeholder="e.g. New feature: options chain" />
          </div>
          <div>
            <label class="${label}">Message</label>
            <textarea name="body" maxlength="300" required rows="3" class="${input}" placeholder="What do you want to tell your users?"></textarea>
          </div>
          <button class="text-sm px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 font-bold hover:bg-indigo-500/30">Send notification</button>
        </form>
      </div>
    </div>
  `;
}

// ─── Audit log ──────────────────────────────────────────────────────────

export function auditBody(
  rows: Array<{
    adminEmail: string;
    action: string;
    target: string | null;
    detail: string | null;
    ip: string | null;
    createdAt: Date;
  }>,
): string {
  const body = rows
    .map(
      (r) => `<tr class="border-b border-zinc-800">
        <td class="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">${esc(r.createdAt.toISOString().replace('T', ' ').slice(0, 19))}</td>
        <td class="px-3 py-2">${esc(r.adminEmail)}</td>
        <td class="px-3 py-2"><span class="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 font-bold tracking-wider">${esc(r.action)}</span></td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-400">${esc(r.target ?? '—')}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-400">${esc(r.detail ?? '')}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${esc(r.ip ?? '')}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="text-xs text-zinc-500 mb-2">Most recent ${rows.length} privileged actions.</div>
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><tr>
          <th class="px-3 py-3 text-left">When (UTC)</th>
          <th class="px-3 py-3 text-left">Admin</th>
          <th class="px-3 py-3 text-left">Action</th>
          <th class="px-3 py-3 text-left">Target</th>
          <th class="px-3 py-3 text-left">Detail</th>
          <th class="px-3 py-3 text-left">IP</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="6" class="px-3 py-12 text-center text-zinc-500">No admin actions logged yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ─── Learning & achievements (read-only stats) ──────────────────────────

export function learningBody(opts: {
  learn: {
    completions: number;
    learners: number;
    quizAttempts: number;
    quizPassRate: number;
    totalLessons: number;
  };
  achievements: {
    totalUnlocks: number;
    learners: number;
    perBadge: { id: string; name: string; count: number }[];
  };
}): string {
  const { learn, achievements } = opts;
  const stat = (label: string, value: string, sub = ''): string => `
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl px-4 py-4">
      <div class="text-[11px] uppercase tracking-wider text-zinc-500">${esc(label)}</div>
      <div class="text-2xl font-black tracking-tight mt-1">${esc(value)}</div>
      ${sub ? `<div class="text-[11px] text-zinc-500 mt-0.5">${esc(sub)}</div>` : ''}
    </div>`;
  const passPct = `${(learn.quizPassRate * 100).toFixed(0)}%`;
  const maxCount = achievements.perBadge.reduce((m, b) => Math.max(m, b.count), 0);
  const badgeRows = achievements.perBadge
    .map((b) => {
      const pct = maxCount === 0 ? 0 : Math.round((b.count / maxCount) * 100);
      return `<tr class="border-b border-zinc-800">
        <td class="px-3 py-2">${esc(b.name)}</td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-500">${esc(b.id)}</td>
        <td class="px-3 py-2 w-1/2">
          <div class="flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden"><div class="h-full bg-indigo-500/70" style="width:${pct}%"></div></div>
            <span class="text-sm font-bold tabular-nums w-10 text-right">${b.count}</span>
          </div>
        </td>
      </tr>`;
    })
    .join('');
  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      ${stat('Lesson completions', String(learn.completions), `${learn.totalLessons} lessons live`)}
      ${stat('Learners', String(learn.learners), 'distinct users with progress')}
      ${stat('Quiz attempts', String(learn.quizAttempts), `${passPct} perfect-score rate`)}
      ${stat('Badges unlocked', String(achievements.totalUnlocks), `${achievements.learners} earners`)}
    </div>
    <div class="text-xs text-zinc-500 mb-2">Achievement unlocks by badge.</div>
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><tr>
          <th class="px-3 py-3 text-left">Badge</th>
          <th class="px-3 py-3 text-left">Id</th>
          <th class="px-3 py-3 text-left">Unlocks</th>
        </tr></thead>
        <tbody>${badgeRows || `<tr><td colspan="3" class="px-3 py-12 text-center text-zinc-500">No badges unlocked yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ─── Health ─────────────────────────────────────────────────────────────

export function healthBody(blocks: Array<{
  label: string;
  ok: boolean;
  detail: string;
}>): string {
  return `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${blocks
    .map((b) => {
      const tone = b.ok
        ? 'border-emerald-500/40 bg-emerald-500/5'
        : 'border-rose-500/40 bg-rose-500/5';
      const dot = b.ok ? 'bg-emerald-400' : 'bg-rose-400';
      const dotShadow = b.ok ? 'shadow-emerald-400/60' : 'shadow-rose-400/60';
      return `<div class="border ${tone} rounded-2xl p-5">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full ${dot} shadow ${dotShadow}"></span>
          <h3 class="font-bold">${esc(b.label)}</h3>
          <span class="ml-auto text-[10px] uppercase tracking-wider font-bold ${b.ok ? 'text-emerald-300' : 'text-rose-300'}">${b.ok ? 'Healthy' : 'Degraded'}</span>
        </div>
        <div class="text-xs text-zinc-400 mt-2">${esc(b.detail)}</div>
      </div>`;
    })
    .join('')}</div>`;
}

// ─── Contact messages ───────────────────────────────────────────────────

interface ContactRow {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: string;
  createdAt: string;
  repliedAt: string | null;
}

function statusTone(status: string): string {
  switch (status) {
    case 'NEW':
      return 'bg-indigo-500/15 text-indigo-300';
    case 'READ':
      return 'bg-amber-500/15 text-amber-300';
    case 'REPLIED':
      return 'bg-emerald-500/15 text-emerald-300';
    default:
      return 'bg-zinc-600/20 text-zinc-400';
  }
}

export function messagesBody(list: {
  rows: ContactRow[];
  total: number;
  newCount: number;
  page: number;
  pages: number;
  status: string;
}): string {
  const statuses = ['ALL', 'NEW', 'READ', 'REPLIED', 'ARCHIVED'];
  const filters = statuses
    .map((s) => {
      const active = (list.status || 'ALL') === s;
      const cls = active
        ? 'bg-indigo-500 text-white'
        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800';
      return `<a href="/admin/messages?status=${s}" class="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider ${cls}">${s}${s === 'NEW' && list.newCount ? ` (${list.newCount})` : ''}</a>`;
    })
    .join('');
  const rows = list.rows.length
    ? list.rows
        .map((m) => {
          const snippet =
            m.message.length > 90 ? m.message.slice(0, 90) + '…' : m.message;
          return `<tr class="border-b border-zinc-800 hover:bg-zinc-900/60">
        <td class="px-3 py-3">
          <a href="/admin/messages/${esc(m.id)}" class="font-medium text-indigo-300 hover:underline">${esc(m.name)}</a>
          <div class="text-[11px] text-zinc-500">${esc(m.email)}</div>
        </td>
        <td class="px-3 py-3 text-zinc-300">${esc(m.subject || '—')}<div class="text-[11px] text-zinc-500">${esc(snippet)}</div></td>
        <td class="px-3 py-3"><span class="text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider ${statusTone(m.status)}">${esc(m.status)}</span></td>
        <td class="px-3 py-3 text-[11px] text-zinc-500 whitespace-nowrap">${esc(m.createdAt.slice(0, 16).replace('T', ' '))}</td>
        <td class="px-3 py-3 text-right"><a href="/admin/messages/${esc(m.id)}" class="text-xs text-indigo-300 hover:underline">Open →</a></td>
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="px-3 py-10 text-center text-zinc-500">No messages${list.status !== 'ALL' ? ` with status ${esc(list.status)}` : ''}.</td></tr>`;
  const pager = renderPager(
    list.page,
    list.pages,
    (p) => `/admin/messages?page=${p}&status=${list.status}`,
  );
  return `
    <div class="flex items-center gap-2 mb-4 flex-wrap">${filters}</div>
    <div class="text-xs text-zinc-500 mb-2">${list.total.toLocaleString()} message${list.total === 1 ? '' : 's'}</div>
    <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
          <tr>
            <th class="px-3 py-3 text-left">From</th>
            <th class="px-3 py-3 text-left">Subject / preview</th>
            <th class="px-3 py-3 text-left">Status</th>
            <th class="px-3 py-3 text-left">Received</th>
            <th class="px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${pager}`;
}

export function messageDetailBody(m: ContactRow & { reply: string | null }): string {
  const statusBtn = (s: string, label: string) =>
    `<button name="status" value="${s}" class="px-3 py-1.5 rounded-lg text-xs font-bold border border-zinc-700 hover:border-indigo-500 hover:text-indigo-300">${label}</button>`;
  return `
    <a href="/admin/messages" class="text-sm text-zinc-400 hover:text-indigo-300">← Back to messages</a>
    <div class="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <div class="flex items-center gap-3 flex-wrap">
            <h2 class="text-lg font-bold">${esc(m.subject || 'No subject')}</h2>
            <span class="text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider ${statusTone(m.status)}">${esc(m.status)}</span>
          </div>
          <div class="text-sm text-zinc-400 mt-1">
            From <span class="text-zinc-200 font-medium">${esc(m.name)}</span>
            &lt;<a href="mailto:${esc(m.email)}" class="text-indigo-300 hover:underline">${esc(m.email)}</a>&gt;
            · ${esc(m.createdAt.slice(0, 16).replace('T', ' '))} UTC
          </div>
          <div class="mt-5 whitespace-pre-wrap text-zinc-200 leading-relaxed">${esc(m.message)}</div>
        </div>
        ${
          m.reply
            ? `<div class="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6">
                <div class="text-xs uppercase tracking-wider text-emerald-300 font-bold mb-2">Your reply${m.repliedAt ? ` · ${esc(m.repliedAt.slice(0, 16).replace('T', ' '))} UTC` : ''}</div>
                <div class="whitespace-pre-wrap text-zinc-200">${esc(m.reply)}</div>
              </div>`
            : ''
        }
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Reply by email</h3>
          <form method="post" action="/admin/messages/${esc(m.id)}/reply">
            <textarea name="reply" rows="6" required placeholder="Type your reply — it will be emailed to ${esc(m.email)}"
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">${esc(m.reply ?? '')}</textarea>
            <button class="mt-3 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm rounded-lg">Send reply &amp; mark replied</button>
          </form>
        </div>
      </div>
      <div class="space-y-4">
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
          <h3 class="font-bold mb-3 text-sm">Set status</h3>
          <form method="post" action="/admin/messages/${esc(m.id)}/status" class="flex flex-wrap gap-2">
            ${statusBtn('NEW', 'New')}
            ${statusBtn('READ', 'Read')}
            ${statusBtn('REPLIED', 'Replied')}
            ${statusBtn('ARCHIVED', 'Archive')}
          </form>
        </div>
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-sm">
          <a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + (m.subject || 'Your message to StockVirtue'))}"
            class="text-indigo-300 hover:underline">Open in mail client ↗</a>
        </div>
      </div>
    </div>`;
}
