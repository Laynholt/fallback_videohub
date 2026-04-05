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
  travel: {
    openers: [
      'Собираю видео о маршрутах, дальних точках и местах, которых нет на обычной карте.',
      'Люблю придумывать пространства, в которые хочется уехать сразу после первого кадра.',
      'Здесь у меня все крутится вокруг дороги, воздуха и ощущения большой дистанции.'
    ],
    middles: [
      'Чаще всего тянусь к туману, пустым горизонтам и медленному движению внутри кадра.',
      'Мне важны масштаб, погода и чувство, что маршрут продолжается за пределами экрана.',
      'Стараюсь, чтобы в роликах чувствовались направление, пространство и собственный ритм пути.'
    ],
    closers: [
      'Сохраняю только те сцены, где движение ощущается почти физически.',
      'Люблю, когда кадр держится не на событии, а на состоянии дороги.',
      'Ищу в видео не географию, а настроение, ради которого хочется смотреть дальше.'
    ]
  },
  tech: {
    openers: [
      'Делаю видео о системах, интерфейсах и технике, которая кажется уже существующей.',
      'Собираю сцены про цифровую среду и машины из ближайшего будущего.',
      'Мне интересно показывать технологии так, будто они давно стали частью повседневности.'
    ],
    middles: [
      'Обычно работаю через холодный свет, точные формы и ощущение собранной системы.',
      'Люблю чистые панели, инженерную геометрию и уверенное поведение интерфейсов.',
      'Для меня важнее всего правдоподобие среды и логика самой системы внутри кадра.'
    ],
    closers: [
      'Хочу, чтобы каждый ролик выглядел как фрагмент уже работающего мира.',
      'Собираю такие сцены, где технология читается без лишних объяснений.',
      'Интереснее всего момент, когда вымышленная техника начинает казаться бытовой.'
    ]
  },
  music: {
    openers: [
      'Собираю клипы и музыкальные сцены, где картинка работает как часть ритма.',
      'Люблю видео, в которых свет, темп и монтаж звучат наравне со звуком.',
      'Здесь у меня синтетические лайвы, несуществующие релизы и визуальные джемы.'
    ],
    middles: [
      'Обычно ищу плотный пульс, сценический воздух и чувство большого пространства вокруг музыки.',
      'Мне интересны неон, дым, повтор, пауза и момент перед сильным акцентом.',
      'Стараюсь, чтобы у каждого ролика был свой внутренний темп и узнаваемая пластика.'
    ],
    closers: [
      'Люблю, когда даже тихая сцена ощущается как выступление.',
      'Для меня хороший музыкальный ролик начинается там, где монтаж становится почти мелодией.',
      'Сохраняю только те работы, у которых есть собственный ритм даже без звука.'
    ]
  },
  art: {
    openers: [
      'Собираю визуальные работы на стыке генеративного искусства, фактуры и выставочной подачи.',
      'Мне нравится превращать отдельные образы в цельные художественные серии.',
      'Здесь я веду поток цифровых сцен, похожих на найденные экспозиции.'
    ],
    middles: [
      'Для меня важны форма, цвет, пластика и ощущение собранной композиции.',
      'Люблю кадры, где фактура читается так же сильно, как сам образ.',
      'Чаще думаю не о событии, а о том, как работает поверхность, свет и тишина изображения.'
    ],
    closers: [
      'Ищу изображения, которые держатся на настроении и точной форме.',
      'Сохраняю сцены, в которых есть собственная выставочная логика.',
      'Мне нравится, когда работа выглядит законченной уже на уровне одного взгляда.'
    ]
  },
  science: {
    openers: [
      'Делаю видео о моделях, лабораториях и научных средах из другой версии реальности.',
      'Собираю синтетические ролики про космос, эксперименты и исследовательскую фантазию.',
      'Люблю сцены, где теория, масштаб и точность визуального языка работают вместе.'
    ],
    middles: [
      'Обычно тянусь к холодной ясности, наблюдательному тону и аккуратной структуре кадра.',
      'Для меня важны ощущение модели, чистая среда и внутренняя логика мира.',
      'Стараюсь держать подачу спокойной, чтобы любая странная идея выглядела убедительно.'
    ],
    closers: [
      'Интереснее всего ролики, в которых фантазия выглядит почти как доклад.',
      'Хочу, чтобы даже вымышленная наука ощущалась собранной и точной.',
      'Сохраняю сцены, где исследование чувствуется раньше, чем эффект.'
    ]
  },
  cinema: {
    openers: [
      'Собираю короткие кинематографические сцены, трейлеры и фрагменты несуществующих фильмов.',
      'Люблю ролики, которые ощущаются как вырезка из большого, но невидимого фильма.',
      'Здесь все строится вокруг постановки, жанра и точного кадра.'
    ],
    middles: [
      'Чаще всего работаю через свет, монтаж, паузу и ощущение уверенной режиссуры.',
      'Для меня важны темп, мизансцена и то, как камера ведет зрителя внутри сцены.',
      'Нравится, когда даже короткий эпизод имеет собственный тон и законченную форму.'
    ],
    closers: [
      'Стараюсь, чтобы каждый ролик выглядел как фрагмент уже смонтированного мира.',
      'Интереснее всего тот момент, когда постановка начинает говорить сама за себя.',
      'Сохраняю сцены, в которых кино ощущается еще до того, как что-то происходит.'
    ]
  },
  sport: {
    openers: [
      'Собираю динамичные ролики о скорости, рывке и чистом движении.',
      'Люблю видео, где энергия считывается раньше любого сюжета.',
      'Здесь все держится на импульсе, траектории и коротком моменте риска.'
    ],
    middles: [
      'Обычно ищу высокий темп, резкую кинетику и ясный вектор движения внутри кадра.',
      'Мне важны напряжение момента, скорость входа и ощущение контроля на пределе.',
      'Чаще всего работаю через резкий свет, воздух перед рывком и плотную траекторию.'
    ],
    closers: [
      'Интереснее всего сцены, где движение само становится драматургией.',
      'Сохраняю только тот экшен, в котором есть ритм и чистая геометрия.',
      'Люблю, когда видео держится на одном мощном импульсе от начала до конца.'
    ]
  },
  food: {
    openers: [
      'Собираю гастрономические видео, где вкус, свет и подача работают как единая сцена.',
      'Люблю придумывать кухни, блюда и теплые пространства с сильным визуальным аппетитом.',
      'Здесь хранятся ролики о еде, атмосфере и деталях, которые хочется разглядывать медленно.'
    ],
    middles: [
      'Чаще всего меня цепляют пар, поверхность, теплый цвет и точный ритм подачи.',
      'Мне нравится работать с фактурой блюда, мягким светом и уютной глубиной пространства.',
      'Обычно собираю кадр так, чтобы у него был вкус еще до первого движения.'
    ],
    closers: [
      'Сохраняю сцены, в которых еда ощущается почти тактильно.',
      'Люблю, когда ролик вызывает аппетит не громкостью, а точностью деталей.',
      'Интереснее всего момент, когда подача становится самостоятельным настроением.'
    ]
  },
  lifestyle: {
    openers: [
      'Собираю тихие видео о быте, комнатах, привычках и личной атмосфере.',
      'Люблю сцены, в которых ничего не кричит, но все уже работает на настроение.',
      'Здесь ролики про внутренний ритм, свет в комнате и состояние момента.'
    ],
    middles: [
      'Обычно тянусь к мягкой паузе, спокойному наблюдению и теплой глубине кадра.',
      'Мне важны присутствие, тишина, мелкие детали и ритм повседневности.',
      'Чаще всего работаю через интимный масштаб, медленный темп и естественное настроение пространства.'
    ],
    closers: [
      'Сохраняю видео, которые держатся на внутреннем состоянии, а не на событии.',
      'Люблю, когда кадр выглядит личным даже без прямого рассказа.',
      'Для меня хороший ролик начинается с чувства, что ты уже внутри этого места.'
    ]
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

function getCatalogCards(filter, query) {
  let cards = stableCatalogSort(ALL_CARDS);

  if (filter && filter !== 'all') {
    cards = cards.filter((card) => card.category === filter);
  }

  if (!query) return cards;

  return cards
    .map((card) => ({ card, score: scoreCard(card, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.card.id - right.card.id;
    })
    .map((entry) => entry.card);
}

function getCatalogPage({ filter = 'all', query = '', offset = 0, limit = SETTINGS.initial } = {}) {
  const cards = getCatalogCards(filter, query);
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
  if (!cards.length) return 'В этом канале пока нет опубликованных видео.';
  const seed = hashString(`${author}-${cards.map((card) => card.id).join('|')}`);
  const categoryCount = new Map();
  cards.forEach((card) => categoryCount.set(card.category, (categoryCount.get(card.category) || 0) + 1));
  const dominantCategory = [...categoryCount.entries()].sort((left, right) => right[1] - left[1])[0][0];
  const bank = CHANNEL_BIO_BANK[dominantCategory] || CHANNEL_BIO_BANK.lifestyle;
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
      description: 'В этом канале пока нет опубликованных видео.',
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
