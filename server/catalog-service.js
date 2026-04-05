const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'scripts', 'catalog-data.js');

function loadRuntime() {
  const source = fs.readFileSync(DATA_FILE, 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: DATA_FILE });
  return sandbox.window.REMOVI_DATA;
}

const runtime = loadRuntime();
const {
  ALL_CARDS,
  CATEGORY_THEMES,
  DEFAULT_MESSAGES,
  FILTERS,
  SETTINGS,
  normalizeText
} = runtime;

const DATE_ORDER = [
  '2 часа назад',
  '5 часов назад',
  'вчера',
  '2 дня назад',
  '3 дня назад',
  'неделю назад',
  '2 недели назад',
  'месяц назад',
  '2 месяца назад'
];

const DATE_RANK = new Map(DATE_ORDER.map((label, index) => [label, index]));

const CHANNEL_BIO_BANK = {
  ambient: {
    openers: ['Собираю мягкие эмбиент-релизы и люблю писать музыку, в которой воздух важнее темпа.', 'Мне ближе спокойные композиции с длинным послевкусием и почти незаметным движением внутри трека.', 'Обычно выкладываю тихие атмосферные работы, которые работают не давлением, а пространством.'],
    middles: ['Чаще всего тянусь к длинным пэдам, хрупким гармониям и медленному свету в звуке.', 'Интереснее всего теплый дрон, далекие текстуры и ощущение пустой комнаты после удара дождя.', 'Нравится, когда трек держится на оттенках, дыхании и очень аккуратной динамике.'],
    closers: ['Хочу, чтобы каждая композиция оставляла после себя тишину, а не только финальный хвост ревёрба.', 'Люблю музыку, в которой можно надолго потеряться без единой резкой точки.', 'Ищу звук, который не спорит с пространством, а растворяется в нем.']
  },
  phonk: {
    openers: ['Собираю жесткие phonk-релизы и люблю треки, которые пахнут асфальтом, ночью и перегретой кассетой.', 'Мне интересен звук, где грязный бас и уличная энергия ощущаются уже на первой секунде.', 'Обычно публикую мрачные композиции с плотным качем и поздним городским давлением.'],
    middles: ['Чаще всего работаю с мемфис-хуками, сырым низом и ломаным drive-вибром.', 'Нравится, когда трек одновременно грубый, липкий и очень физический по ощущению.', 'Люблю сочетание кассетной пыли, перегруза и коротких запоминающихся хуков.'],
    closers: ['Хочу, чтобы каждая работа включала ночной режим еще до первого drop.', 'Для меня хороший phonk держится не на громкости, а на уличном характере.', 'Ищу звук, который не просит внимания, а сразу забирает его силой.']
  },
  hyperpop: {
    openers: ['Собираю яркие hyperpop-релизы и люблю треки, в которых перегруз — это часть красоты.', 'Мне нравится музыка, которая одновременно хрупкая, глянцевая и слишком быстрая для спокойного прослушивания.', 'Обычно выкладываю поп-композиции на грани цифрового хаоса и прилипчивого хука.'],
    middles: ['Чаще всего тянусь к сияющим синтам, резким вокальным слоям и сахарному distortion.', 'Интересно смешивать хрупкую мелодику с очень ярким, почти агрессивным блеском.', 'Люблю, когда трек кажется слишком ярким, но при этом остается точным и музыкальным.'],
    closers: ['Хочу, чтобы каждая композиция давала вспышку настроения, а не просто эффектный момент.', 'Для меня hyperpop живет там, где мелодия не боится выглядеть искусственной.', 'Ищу звук, который работает как цифровой шок, но оставляет после себя настоящий хук.']
  },
  house: {
    openers: ['Собираю house-релизы и люблю музыку, которая держит тело в движении без лишней суеты.', 'Мне ближе теплый клубный звук с ровным грувом и ощущением длинной ночи.', 'Обычно публикую треки, которые работают через ритм, пространство и мягкую уверенность подачи.'],
    middles: ['Чаще всего тянусь к упругому басу, чистой бочке и стеклянным аккордам.', 'Нравится, когда композиция дышит легко, но при этом держит танцпол до самого конца.', 'Люблю теплую перкуссию, короткие вокальные тени и плавный кач без перегруза.'],
    closers: ['Хочу, чтобы каждый релиз звучал как готовый поздний сет, а не как черновик идеи.', 'Для меня хороший house — это когда трек движется мягко, но уверенно.', 'Ищу звук, который не давит, а постепенно забирает все пространство вокруг.']
  },
  trap: {
    openers: ['Собираю trap-композиции и люблю треки, которые живут на тяжелом 808 и напряженной паузе.', 'Мне интересна музыка позднего города: холодная, сухая и очень точная по удару.', 'Обычно публикую темные релизы, где бас держит драму сильнее, чем слова.'],
    middles: ['Чаще всего работаю с длинным сабом, разреженным хэтом и очень собранной мелодикой.', 'Нравится, когда в треке много воздуха, но каждый удар все равно ощущается телом.', 'Люблю сухую атаку, темный верх и спокойную уверенность тяжелого ритма.'],
    closers: ['Хочу, чтобы каждая работа оставляла после себя давление, а не только запоминалась припевом.', 'Для меня trap работает там, где пауза между ударами почти важнее самих ударов.', 'Ищу звук, который держит напряжение даже на минимальном количестве элементов.']
  },
  cinematic: {
    openers: ['Собираю cinematic-релизы и люблю композиции, которые звучат как саундтрек к несуществующему фильму.', 'Мне ближе музыка с большим размахом, ясной драмой и ощущением сцены даже без изображения.', 'Обычно публикую треки, в которых слышно пространство, масштаб и движение сюжета.'],
    middles: ['Чаще всего тянусь к струнным подъемам, медным акцентам и широкому оркестровому воздуху.', 'Интереснее всего, когда трек сразу создает кадр, конфликт и эмоциональную дугу.', 'Люблю большие кульминации, медленные сборки и ясный кинематографический вес каждой темы.'],
    closers: ['Хочу, чтобы каждая композиция звучала как финальный cue, который зритель запоминает после титров.', 'Для меня хороший cinematic живет там, где один аккорд уже разворачивает целую сцену.', 'Ищу звук, который не просто украшает историю, а сам становится историей.']
  },
  lofi: {
    openers: ['Собираю lo-fi-релизы и люблю треки, которые сразу делают комнату теплее.', 'Мне близка музыка для позднего вечера, переписки, тетрадей и мягкого лампового света.', 'Обычно публикую спокойные композиции, которые не отвлекают, но создают точное настроение.'],
    middles: ['Чаще всего тянусь к шороху ленты, мягкому Rhodes и очень домашнему биту.', 'Нравится, когда трек дышит тихо, но в нем все равно есть свой внутренний грув.', 'Люблю пленочную пыль, джазовые аккорды и ощущение закрытого безопасного пространства.'],
    closers: ['Хочу, чтобы каждая работа звучала как личный маленький вечер, который можно поставить на повтор.', 'Для меня хороший lo-fi начинается с простого чувства уюта и времени для себя.', 'Ищу звук, который остается рядом, не требуя от слушателя ничего лишнего.']
  },
  techno: {
    openers: ['Собираю techno-релизы и люблю музыку, которая работает как прямой импульс без украшательств.', 'Мне интересен жесткий индустриальный ритм и ощущение механики, которая не останавливается.', 'Обычно выкладываю треки, построенные на давлении секвенции, повторе и сухой энергии.'],
    middles: ['Чаще всего тянусь к стальному кику, сверлящим синтам и плотной секвенции.', 'Нравится, когда композиция гипнотизирует не мелодией, а чистым моторным ходом.', 'Люблю индустриальный шум, жесткую перкуссию и уверенное прямое движение без лишних отступлений.'],
    closers: ['Хочу, чтобы каждая работа звучала как уже открытая дверь в темный клубный зал.', 'Для меня хороший techno строится на терпении, повторе и давлении, которое не ослабевает.', 'Ищу звук, который держит внимание не вспышкой, а постоянным ритмическим нажимом.']
  },
  synthwave: {
    openers: ['Собираю synthwave-релизы и люблю треки, в которых неон слышен так же ясно, как бас.', 'Мне ближе музыка ночного шоссе, розовых горизонтов и красивой цифровой ностальгии.', 'Обычно публикую композиции, которые звучат как поездка сквозь выдуманный город после заката.'],
    middles: ['Чаще всего тянусь к теплым пэдам, ретро-барабанам и ясной синт-линии впереди трека.', 'Интересно сочетать ностальгический мелодизм с плотным современным ударом.', 'Люблю длинное afterglow, арпеджио и ощущение бесконечной дороги в темноте.'],
    closers: ['Хочу, чтобы каждая работа оставляла после себя чувство красивого движения сквозь пустой город.', 'Для меня хороший synthwave — это когда трек сразу рисует свет, скорость и ночь.', 'Ищу звук, который делает ностальгию не музейной, а живой и очень телесной.']
  }
};

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDateRank(label) {
  return DATE_RANK.has(label) ? DATE_RANK.get(label) : Number.MAX_SAFE_INTEGER;
}

function sortByFreshness(cards) {
  return [...cards].sort((left, right) => {
    const leftRank = getDateRank(left.date);
    const rightRank = getDateRank(right.date);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return right.id - left.id;
  });
}

function stableCatalogSort(cards) {
  return [...cards].sort((left, right) => {
    const leftHash = hashString(`catalog:${left.id}:${left.title}`);
    const rightHash = hashString(`catalog:${right.id}:${right.title}`);
    return leftHash - rightHash;
  });
}

function seededCatalogSort(cards, seed) {
  if (!seed) return stableCatalogSort(cards);
  return [...cards].sort((left, right) => {
    const leftHash = hashString(`catalog:${seed}:${left.id}:${left.title}`);
    const rightHash = hashString(`catalog:${seed}:${right.id}:${right.title}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return left.id - right.id;
  });
}

function serializeCard(card, options = {}) {
  const includeExcerpt = options.includeExcerpt === true;
  const previewStatic = String(card.previewStatic).startsWith('/') ? card.previewStatic : `/${card.previewStatic}`;
  const previewFallbackStatic = String(card.previewFallbackStatic).startsWith('/') ? card.previewFallbackStatic : `/${card.previewFallbackStatic}`;
  return {
    id: card.id,
    title: card.title,
    author: card.author,
    avatar: card.avatar,
    duration: card.duration,
    views: card.views,
    date: card.date,
    quality: card.quality,
    category: card.category,
    categoryLabel: card.categoryLabel,
    previewStatic,
    previewFallbackStatic,
    ...(includeExcerpt ? { playerExcerpt: card.playerExcerpt } : {})
  };
}

function scoreCard(card, query) {
  const haystack = normalizeText(`${card.title} ${card.author} ${card.categoryLabel} ${card.category}`);
  const author = normalizeText(card.author);
  const title = normalizeText(card.title);
  const categoryLabel = normalizeText(card.categoryLabel);
  const category = normalizeText(card.category);
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  let score = 0;
  tokens.forEach((token) => {
    if (author === token) score += 10;
    if (author.startsWith(token)) score += 7;
    if (title.includes(token)) score += 5;
    if (author.includes(token)) score += 6;
    if (categoryLabel.includes(token) || category.includes(token)) score += 2;
    if (haystack.includes(token)) score += 1;
  });
  return score;
}

function getCatalogCards(filter, query, seed = '') {
  let cards = seededCatalogSort(ALL_CARDS, seed);

  if (filter && filter !== 'all') {
    cards = cards.filter((card) => card.category === filter);
  }

  if (!query) return cards;

  return cards
    .map((card) => ({ card, score: scoreCard(card, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftHash = hashString(`search:${seed}:${left.card.id}:${left.card.title}`);
      const rightHash = hashString(`search:${seed}:${right.card.id}:${right.card.title}`);
      if (leftHash !== rightHash) return leftHash - rightHash;
      return left.card.id - right.card.id;
    })
    .map((entry) => entry.card);
}

function getCatalogPage({ filter = 'all', query = '', offset = 0, limit = SETTINGS.initial, seed = '' } = {}) {
  const cards = getCatalogCards(filter, query, seed);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(60, Number(limit) || SETTINGS.initial));
  const items = cards.slice(safeOffset, safeOffset + safeLimit).map((card) => serializeCard(card));
  return {
    items,
    total: cards.length,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < cards.length
  };
}

function findExactCard(cardId) {
  return ALL_CARDS.find((card) => String(card.id) === String(cardId)) || null;
}

function buildChannelDescription(author, cards) {
  if (!cards.length) return 'В этом профиле пока нет опубликованных релизов.';
  const seed = hashString(`${author}-${cards.map((card) => card.id).join('|')}`);
  const categoryCount = new Map();
  cards.forEach((card) => categoryCount.set(card.category, (categoryCount.get(card.category) || 0) + 1));
  const dominantCategory = [...categoryCount.entries()].sort((left, right) => right[1] - left[1])[0][0];
  const bank = CHANNEL_BIO_BANK[dominantCategory] || CHANNEL_BIO_BANK.ambient;
  const opener = bank.openers[seed % bank.openers.length];
  const middle = bank.middles[(seed >>> 3) % bank.middles.length];
  const closer = bank.closers[(seed >>> 6) % bank.closers.length];
  return `${opener} ${middle} ${closer}`;
}

function getVideoPayload(cardId) {
  const card = findExactCard(cardId);
  if (!card) return null;

  const related = sortByFreshness(
    ALL_CARDS.filter((entry) => entry.id !== card.id && entry.category === card.category)
  )
    .slice(0, 4)
    .map((entry) => serializeCard(entry));

  return {
    video: serializeCard(card, { includeExcerpt: true }),
    related
  };
}

function getChannelPayload(author) {
  const cards = sortByFreshness(ALL_CARDS.filter((card) => card.author === author));
  if (!cards.length) {
    return {
      found: false,
      author,
      description: 'В этом профиле пока нет опубликованных релизов.',
      stats: {
        videoCount: 0,
        viewCount: '0',
        categoryCount: 0,
        latestVideoDate: '—',
        avatar: 'R'
      },
      videos: []
    };
  }

  const categories = new Set(cards.map((card) => card.categoryLabel));
  const totalViews = cards.reduce((sum, card) => sum + Number(String(card.views).replace(/\s+/g, '')), 0);
  const latestCard = cards[0];

  return {
    found: true,
    author,
    description: buildChannelDescription(author, cards),
    stats: {
      videoCount: cards.length,
      viewCount: new Intl.NumberFormat('ru-RU').format(totalViews),
      categoryCount: categories.size,
      latestVideoDate: latestCard.date,
      avatar: author.match(/[A-Za-zА-Яа-я0-9]/u)?.[0]?.toUpperCase() || 'R'
    },
    videos: cards.map((card) => serializeCard(card))
  };
}

module.exports = {
  CATEGORY_THEMES,
  DEFAULT_MESSAGES,
  FILTERS,
  SETTINGS,
  getCatalogPage,
  getChannelPayload,
  getVideoPayload
};
