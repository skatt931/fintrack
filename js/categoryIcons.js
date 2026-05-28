/**
 * categoryIcons.js
 *
 * Maps category names to emoji icons using keyword matching.
 * Covers English and Czech personal-finance category names.
 * getCategoryIcon(name) → emoji string
 * getCategoryColor(name) → hex colour string (matches the emoji feel)
 */

// Keyword → emoji.  Order matters: more specific terms first.
const KEYWORD_MAP = [
  // ── Food & Drink ──────────────────────────────────────────────────────────
  ['coffee|café|kavárna|café|latte|espresso|cappucino',        '☕'],
  ['restaurant|restaurace|dining|bistro|sushi|pizza|burger|pub|bar|ramen', '🍽️'],
  ['groceries|potraviny|supermarket|grocery|albert|billa|lidl|tesco|kaufland|penny|coop', '🛒'],
  ['food|jídlo|meal|lunch|dinner|breakfast|snack|bakery|pekárna', '🍔'],
  ['alcohol|beer|wine|pivo|víno',                               '🍺'],

  // ── Transport ─────────────────────────────────────────────────────────────
  ['taxi|uber|bolt|liftago|cabify|rideshare',                   '🚕'],
  ['metro|subway|underground|tram|tramvaj',                     '🚇'],
  ['bus|autobus|coach',                                          '🚌'],
  ['train|vlak|rail|railway|ido|cd\.cz|regiojet|leo express',   '🚆'],
  ['flight|airplane|airline|ryanair|wizz|travel air',            '✈️'],
  ['fuel|benzin|petrol|gasoline|čerpací|pump|shell|orlen|mol',   '⛽'],
  ['parking|parkování|garage|park',                              '🅿️'],
  ['bike|kolo|cycling|cyklo|scooter|koloběžka',                  '🚲'],
  ['car|auto|vehicle|doprava|transport|mobility',                 '🚗'],

  // ── Housing & Utilities ───────────────────────────────────────────────────
  ['rent|nájem|nájemné',                                         '🏠'],
  ['mortgage|hypotéka|loan|půjčka',                              '🏦'],
  ['electricity|elektřina|electric|energy|cez|eon|e\.on|innogy|pražská energetika', '⚡'],
  ['water|voda|vodné|vodárna',                                    '💧'],
  ['gas|plyn|heating|teplo|topení|rwe|innogy gas',               '🔥'],
  ['internet|wifi|wi-fi|broadband|o2|t-mobile|vodafone|cetin',   '📡'],
  ['phone|telefon|mobile|mobil|sim',                              '📱'],
  ['tv|television|cable|satellite|televize',                      '📺'],
  ['home|house|domácnost|housing|repair|oprava|renovation|rekonstrukce|ikea|möbelix', '🏠'],
  ['cleaning|úklid|laundry|prádlo|cleaning',                     '🧹'],
  ['utilities|bills|poplatky|services|utility',                   '🔌'],

  // ── Health & Wellness ─────────────────────────────────────────────────────
  ['pharmacy|lékárna|medicine|léky|drug|pills|vitamin',          '💊'],
  ['doctor|lékař|hospital|nemocnice|clinic|klinika|dentist|zubař|medical|zdravotní|medic', '🏥'],
  ['gym|fitness|workout|cvičení|sport centrum',                   '💪'],
  ['health|zdraví|wellness|therapy|terapie|physio',               '❤️'],

  // ── Sport & Recreation ────────────────────────────────────────────────────
  ['sport|sports|soccer|football|fotbal|tennis|tenis|swimming|plavání|running|yoga|pilates|climbing', '⚽'],

  // ── Entertainment ────────────────────────────────────────────────────────
  ['cinema|kino|movie|film|imax',                                '🎬'],
  ['theater|divadlo|theatre|opera|concert|koncert|festival',     '🎭'],
  ['game|gaming|games|steam|playstation|xbox|nintendo',          '🎮'],
  ['music|hudba|spotify|apple music|deezer|soundcloud',          '🎵'],
  ['book|kniha|kindle|literatura|reading',                       '📚'],
  ['entertainment|zábava|leisure|volný čas',                     '🎉'],

  // ── Subscriptions & Digital ───────────────────────────────────────────────
  ['netflix|disney|hbo|max|hulu|apple tv|streaming|video',       '🎬'],
  ['subscription|předplatné|membership|members',                  '📋'],
  ['software|saas|cloud|google|microsoft|adobe|dropbox|notion',  '💻'],
  ['apple|app store|google play|itunes',                         '📱'],

  // ── Shopping & Clothes ────────────────────────────────────────────────────
  ['clothes|clothing|oblečení|fashion|zara|h&m|primark|lindex|outfit|dress|shoes|boty', '👗'],
  ['shopping|nákupy|mall|obchodní|amazon|alza|mall\.cz|czc',     '🛍️'],
  ['electronics|elektronika|tech|technology|computer|laptop|phone|alza|datart|electro', '💻'],
  ['furniture|nábytek|interior|ikea|kika|möbelix|home goods',    '🛋️'],

  // ── Personal Care & Beauty ───────────────────────────────────────────────
  ['beauty|cosmetics|kosmetika|makeup|parfum|sephora|dm|rossmann', '💄'],
  ['hair|vlasy|barber|kadeřník|salon',                           '💇'],
  ['personal care|péče|hygiene|hygiena',                         '🧴'],

  // ── Travel ───────────────────────────────────────────────────────────────
  ['hotel|hostel|airbnb|booking|accommodation|ubytování',        '🏨'],
  ['travel|cestování|trip|voyage|holiday|dovolená|vacation|výlet|tour', '🗺️'],

  // ── Education ────────────────────────────────────────────────────────────
  ['school|škola|university|university|college|course|kurz|education|vzdělání|tuition|školné|studia', '🎓'],
  ['books|book|literatura|library|knihovna',                     '📖'],

  // ── Finance & Insurance ──────────────────────────────────────────────────
  ['insurance|pojištění|pojistné|allianz|kooperativa|generali|csob pojišt', '🛡️'],
  ['investment|investice|stocks|fond|etf|broker|portfolio|degiro|trading', '📈'],
  ['savings|úspory|saving|piggy|spoření',                        '🐷'],
  ['loan|credit|půjčka|leasing|splátka|úvěr|debt',              '💳'],
  ['tax|daň|daňový|vat|dph',                                    '🧾'],

  // ── Income ───────────────────────────────────────────────────────────────
  ['salary|plat|mzda|wage|payroll|income|příjem|payment received', '💰'],
  ['freelance|invoice|faktura|honorář|bonus',                    '💼'],
  ['dividend|interest|úrok|passive',                             '📈'],

  // ── Gifts & Social ────────────────────────────────────────────────────────
  ['gift|dárek|dárky|present|birthday|narozeniny',              '🎁'],
  ['charity|donation|dar|dobročinnost|ngo',                      '❤️'],
  ['kids|děti|children|baby|dítě|school supply',                 '👶'],
  ['pets|zvířata|vet|veterinář|pet food|krmivo',                '🐾'],

  // ── Other ────────────────────────────────────────────────────────────────
  ['atm|cash|hotovost|výběr',                                    '🏧'],
  ['fee|poplatek|charge|bank fee|bankovní',                      '🧾'],
  ['transfer|převod|transaction',                                '↔️'],
];

// Colour accent per category (background tint for the icon badge)
const COLOR_MAP = [
  ['coffee|café|kavárna',                                        '#92400e'],
  ['restaurant|restaurace|dining|food|jídlo|groceries|potraviny|supermarket|grocery', '#b45309'],
  ['taxi|uber|bolt|car|auto|doprava|transport|fuel|benzin|parking|bike', '#1d4ed8'],
  ['metro|bus|train|vlak|tram',                                  '#1e40af'],
  ['flight|airplane|travel|cestování|holiday|dovolená|hotel',    '#0369a1'],
  ['rent|nájem|home|house|domácnost|mortgage|furniture|cleaning|utilities', '#059669'],
  ['electricity|elektřina|water|voda|gas|plyn|internet|phone',   '#0891b2'],
  ['health|zdraví|doctor|pharmacy|léky|gym|fitness|sport',       '#dc2626'],
  ['entertainment|zábava|cinema|kino|music|game|theater',        '#7c3aed'],
  ['netflix|subscription|předplatné|software|streaming',         '#be185d'],
  ['shopping|nákupy|clothes|oblečení|electronics|beauty|cosmetics', '#9333ea'],
  ['education|vzdělání|school|škola|books',                      '#0f766e'],
  ['insurance|pojištění|investment|investice|savings|tax',       '#1e40af'],
  ['salary|plat|income|příjem|freelance',                        '#047857'],
  ['gift|dárek|charity|kids|děti|pets|zvířata',                  '#db2777'],
];

/**
 * Returns the emoji icon best matching the given category name.
 * Falls back to a generic grid icon.
 */
export function getCategoryEmoji(name) {
  if (!name) return '📊';
  const lower = name.toLowerCase().trim();
  for (const [pattern, emoji] of KEYWORD_MAP) {
    if (new RegExp(pattern, 'i').test(lower)) return emoji;
  }
  return '📊';
}

/**
 * Returns a dark background colour for the category icon badge.
 */
export function getCategoryColor(name) {
  if (!name) return '#374151';
  const lower = name.toLowerCase().trim();
  for (const [pattern, color] of COLOR_MAP) {
    if (new RegExp(pattern, 'i').test(lower)) return color;
  }
  return '#374151'; // default: neutral dark
}

/**
 * Returns an HTML string for a category icon badge:
 * a small rounded square with emoji + tinted background.
 *
 * size: 'sm' (32px, for list rows) | 'md' (40px, for cards)
 */
export function categoryBadge(name, size = 'sm') {
  const emoji = getCategoryEmoji(name);
  const color = getCategoryColor(name);
  const dim   = size === 'md' ? 40 : 32;
  const fs    = size === 'md' ? 20 : 16;
  return `<span class="cat-badge" style="width:${dim}px;height:${dim}px;font-size:${fs}px;background:${color}22;border:1px solid ${color}44;">${emoji}</span>`;
}
