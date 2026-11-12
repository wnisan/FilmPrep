/**
 * Reference cards for grammar found in films: formula, when it is used and a
 * small table of forms. Matched by pattern_type (English rule-based analysis)
 * or by keywords in the title (LLM-generated patterns for other languages).
 */
const GUIDES = [
  {
    id: 'present_perfect',
    match: /present perfect/i,
    formula: ['have / has', '+', 'V3'],
    use: ['Опыт: «я когда-либо делал»', 'Результат к настоящему моменту', 'Действие началось в прошлом и длится до сих пор'],
    markers: ['already', 'just', 'yet', 'ever', 'never', 'since', 'for'],
    rows: [
      ['Утверждение', 'I have seen it.', 'Я это видел.'],
      ['Отрицание', "She hasn't called yet.", 'Она ещё не позвонила.'],
      ['Вопрос', 'Have you ever been to London?', 'Ты когда-нибудь был в Лондоне?'],
    ],
  },
  {
    id: 'passive',
    match: /passive/i,
    formula: ['be', '+', 'V3', '(+ by …)'],
    use: ['Важно действие, а не тот, кто его совершил', 'Исполнитель неизвестен или очевиден'],
    markers: ['by', 'was made', 'is called', 'has been done'],
    rows: [
      ['Present', 'The room is cleaned every day.', 'Комнату убирают каждый день.'],
      ['Past', 'I was invited to the party.', 'Меня пригласили на вечеринку.'],
      ['Perfect', 'The cake has been eaten.', 'Торт (уже) съели.'],
    ],
  },
  {
    id: 'modals',
    match: /modal/i,
    formula: ['modal', '+', 'глагол без to'],
    use: ['must — надо, обязан', 'should — стоит, совет', 'can / could — могу, умею, вежливая просьба', 'might / may — возможно'],
    markers: ['must', 'should', 'can', 'could', 'might', 'may'],
    rows: [
      ['Обязанность', 'You must stay here.', 'Ты должен остаться здесь.'],
      ['Совет', 'We should go now.', 'Нам стоит идти.'],
      ['Возможность', 'It might rain.', 'Может пойти дождь.'],
    ],
  },
  {
    id: 'conditionals',
    match: /conditional|if\b/i,
    formula: ['If', '+', 'условие', ',', 'will / would', '+', 'V'],
    use: ['First: реальное условие в будущем', 'Second: нереальное или маловероятное «если бы»'],
    markers: ['if', 'unless', 'when'],
    rows: [
      ['First', 'If it rains, we will stay home.', 'Если пойдёт дождь, останемся дома.'],
      ['Second', 'If I were you, I would wait.', 'На твоём месте я бы подождал.'],
      ['Отрицание', "If you don't hurry, you'll be late.", 'Если не поторопишься, опоздаешь.'],
    ],
  },
  {
    id: 'phrasal_verbs',
    match: /phrasal/i,
    formula: ['глагол', '+', 'частица (up, out, off…)'],
    use: ['Частица меняет смысл глагола целиком', 'Очень часто в живой разговорной речи'],
    markers: ['get up', 'find out', 'give up', 'look for', 'come on'],
    rows: [
      ['give up', "Don't give up!", 'Не сдавайся!'],
      ['find out', 'I need to find out the truth.', 'Мне нужно узнать правду.'],
      ['look after', 'Can you look after my cat?', 'Присмотришь за моей кошкой?'],
    ],
  },
  {
    id: 'de_perfekt',
    match: /perfekt/i,
    formula: ['haben / sein', '+', 'Partizip II (ge…t / ge…en)'],
    use: ['Главное прошедшее время в разговорной речи', 'sein — с глаголами движения и смены состояния'],
    markers: ['gestern', 'schon', 'noch nie'],
    rows: [
      ['haben', 'Ich habe das Buch gelesen.', 'Я прочитал книгу.'],
      ['sein', 'Wir sind nach Hause gegangen.', 'Мы пошли домой.'],
      ['Вопрос', 'Hast du ihn gesehen?', 'Ты его видел?'],
    ],
  },
  {
    id: 'de_konjunktiv',
    match: /konjunktiv/i,
    formula: ['würde', '+', 'Infinitiv', '/', 'wäre, hätte, könnte'],
    use: ['Нереальное желание или условие', 'Вежливая просьба'],
    markers: ['wenn', 'würde', 'wäre', 'hätte'],
    rows: [
      ['Желание', 'Ich wäre gern reich.', 'Я бы хотел быть богатым.'],
      ['Условие', 'Wenn ich Zeit hätte, würde ich kommen.', 'Если бы было время, я бы пришёл.'],
      ['Просьба', 'Könnten Sie mir helfen?', 'Не могли бы вы мне помочь?'],
    ],
  },
  {
    id: 'de_imperativ',
    match: /imperativ\b|imperativ /i,
    formula: ['глагол', '(+ du / ihr / Sie)', '!'],
    use: ['Просьба, приказ, совет'],
    markers: ['bitte', 'mal', 'doch'],
    rows: [
      ['du', 'Komm her!', 'Иди сюда!'],
      ['ihr', 'Kommt her!', 'Идите сюда!'],
      ['Sie', 'Kommen Sie bitte!', 'Подойдите, пожалуйста!'],
    ],
  },
  {
    id: 'es_imperfecto',
    match: /imperfecto/i,
    formula: ['основа', '+', '-aba / -ía'],
    use: ['Фон и описание в прошлом', 'Повторяющиеся привычные действия'],
    markers: ['siempre', 'antes', 'cada día', 'mientras'],
    rows: [
      ['-ar', 'Hablaba con mi abuela.', 'Я (обычно) разговаривал с бабушкой.'],
      ['-er / -ir', 'Vivíamos en Madrid.', 'Мы жили в Мадриде.'],
      ['ser', 'Era de noche.', 'Была ночь.'],
    ],
  },
  {
    id: 'es_futuro',
    match: /futuro/i,
    formula: ['инфинитив', '+', '-é, -ás, -á, -emos, -éis, -án'],
    use: ['Действие в будущем', 'Предположение о настоящем'],
    markers: ['mañana', 'pronto', 'el año que viene'],
    rows: [
      ['yo', 'Mañana hablaré con él.', 'Завтра я поговорю с ним.'],
      ['nosotros', 'Viviremos aquí.', 'Мы будем жить здесь.'],
      ['Предположение', '¿Dónde estará?', 'Где же он (может быть)?'],
    ],
  },
  {
    id: 'imperative',
    match: /imperati|импера|impératif|повелит/i,
    formula: ['глагол в повелительной форме', '!'],
    use: ['Просьба, приказ, совет, инструкция'],
    markers: ['please / por favor / s’il te plaît'],
    rows: [
      ['ты', '¡Ven aquí! / Viens ici !', 'Иди сюда!'],
      ['вы (мн.)', '¡Venid! / Venez !', 'Идите!'],
      ['Отрицание', '¡No corras! / Ne cours pas !', 'Не беги!'],
    ],
  },
  {
    id: 'fr_futur_proche',
    match: /futur proche/i,
    formula: ['aller', '+', 'infinitif'],
    use: ['Ближайшее будущее: «собираюсь сделать»'],
    markers: ['bientôt', 'ce soir', 'demain'],
    rows: [
      ['je', 'Je vais partir.', 'Я сейчас уйду.'],
      ['nous', 'Nous allons manger.', 'Мы собираемся поесть.'],
      ['Отрицание', 'Il ne va pas venir.', 'Он не придёт.'],
    ],
  },
  {
    id: 'fr_conditionnel',
    match: /conditionnel/i,
    formula: ['infinitif', '+', '-ais, -ait, -ions, -iez, -aient'],
    use: ['Вежливая просьба', 'Гипотеза: «бы»'],
    markers: ['si', 'je voudrais', 'pourriez-vous'],
    rows: [
      ['Просьба', 'Je voudrais un café.', 'Я бы хотел кофе.'],
      ['Гипотеза', "Si j'avais le temps, je viendrais.", 'Если бы было время, я бы пришёл.'],
      ['Совет', 'Tu devrais dormir.', 'Тебе стоило бы поспать.'],
    ],
  },
  {
    id: 'fr_passe_compose',
    match: /passé composé/i,
    formula: ['avoir / être', '+', 'participe passé'],
    use: ['Законченное действие в прошлом', 'être — с глаголами движения и возвратными'],
    markers: ['hier', 'déjà', 'une fois'],
    rows: [
      ['avoir', "J'ai mangé une pomme.", 'Я съел яблоко.'],
      ['être', 'Elle est partie.', 'Она ушла.'],
      ['Вопрос', 'Tu as vu ce film ?', 'Ты видел этот фильм?'],
    ],
  },
];

const META = {
  present_perfect: ['Present Perfect', 'en'],
  passive: ['Passive Voice', 'en'],
  modals: ['Modal Verbs', 'en'],
  conditionals: ['Conditionals', 'en'],
  phrasal_verbs: ['Phrasal Verbs', 'en'],
  de_perfekt: ['Perfekt', 'de'],
  de_konjunktiv: ['Konjunktiv II', 'de'],
  de_imperativ: ['Imperativ', 'de'],
  es_imperfecto: ['Imperfecto', 'es'],
  es_futuro: ['Futuro Simple', 'es'],
  imperative: ['Повелительное наклонение', null],
  fr_futur_proche: ['Futur proche', 'fr'],
  fr_conditionnel: ['Conditionnel présent', 'fr'],
  fr_passe_compose: ['Passé composé', 'fr'],
};
GUIDES.forEach((g) => {
  [g.name, g.lang] = META[g.id];
});

// Built-in gap-fill drills, used when the server has no generated exercises for a rule.
// Wrong options are forms of the same word that are ungrammatical in this sentence.
const D = (sentence, options, answer, translation, lang) => ({ sentence, options, answer, translation, lang });
const DRILLS = {
  present_perfect: [
    D('I ___ (lose) my keys. Can you help me?', ['have lost', 'has lost', 'am lose', 'have lose'], 'have lost', 'Я потерял ключи. Поможешь?'),
    D("She ___ (not / finish) her homework yet.", ["hasn't finished", "haven't finished", "hasn't finish", "isn't finished"], "hasn't finished", 'Она ещё не закончила домашнее задание.'),
    D('Have you ever ___ (be) to Paris?', ['been', 'be', 'was', 'being'], 'been', 'Ты когда-нибудь был в Париже?'),
  ],
  passive: [
    D('This bridge ___ (build) in 1890.', ['was built', 'built', 'was build', 'is building'], 'was built', 'Этот мост построили в 1890 году.'),
    D('English ___ (speak) all over the world.', ['is spoken', 'speaks', 'is speaking', 'is speak'], 'is spoken', 'На английском говорят во всём мире.'),
    D('The letters have already ___ (send).', ['been sent', 'sent', 'been send', 'be sent'], 'been sent', 'Письма уже отправили.'),
  ],
  modals: [
    D('She can ___ (swim) very well.', ['swim', 'to swim', 'swims', 'swimming'], 'swim', 'Она очень хорошо плавает.'),
    D('You must ___ (wear) a seatbelt.', ['wear', 'to wear', 'wearing', 'wears'], 'wear', 'Ты обязан пристегнуться.'),
    D('We should ___ (leave) now.', ['leave', 'to leave', 'leaving', 'left'], 'leave', 'Нам стоит уйти сейчас.'),
  ],
  conditionals: [
    D('If it ___ (rain) tomorrow, we will stay home.', ['rains', 'will rain', 'would rain', 'rain'], 'rains', 'Если завтра пойдёт дождь, мы останемся дома.'),
    D('If I ___ (be) you, I would wait.', ['were', 'am', 'will be', 'would be'], 'were', 'На твоём месте я бы подождал.'),
    D('If I had more time, I ___ (travel) more.', ['would travel', 'will travel', 'travel', 'travelled'], 'would travel', 'Если бы у меня было больше времени, я бы больше путешествовал.'),
  ],
  phrasal_verbs: [
    D('I need to find ___ the truth.', ['out', 'up', 'off', 'on'], 'out', 'Мне нужно узнать правду.'),
    D('Can you look ___ my cat while I am away?', ['after', 'for', 'at', 'up'], 'after', 'Присмотришь за моей кошкой, пока меня нет?'),
    D("Please turn ___ the light, I can't see anything.", ['on', 'up', 'out', 'in'], 'on', 'Включи, пожалуйста, свет, я ничего не вижу.'),
  ],
  de_perfekt: [
    D('Ich ___ das Buch schon gelesen. (haben)', ['habe', 'bin', 'hast', 'sind'], 'habe', 'Я уже прочитал эту книгу.'),
    D('Wir ___ gestern nach Hause gegangen. (sein)', ['sind', 'haben', 'seid', 'hat'], 'sind', 'Вчера мы пошли домой.'),
    D('Hast du ihn gestern ___ (sehen)?', ['gesehen', 'gesieht', 'sehen', 'gesah'], 'gesehen', 'Ты его вчера видел?'),
  ],
  de_konjunktiv: [
    D('Wenn ich Zeit hätte, ___ ich kommen. (werden)', ['würde', 'werde', 'wurde', 'wird'], 'würde', 'Если бы у меня было время, я бы пришёл.'),
    D('Ich ___ gern reich. (sein)', ['wäre', 'bin', 'war', 'ist'], 'wäre', 'Я бы хотел быть богатым.'),
    D('Wenn ich mehr Geld ___ (haben), würde ich reisen.', ['hätte', 'habe', 'hatte', 'hat'], 'hätte', 'Если бы у меня было больше денег, я бы путешествовал.'),
  ],
  de_imperativ: [
    D('___ bitte her, Lola! (kommen, du)', ['Komm', 'Kommst', 'Kommen', 'Kommt'], 'Komm', 'Иди сюда, Лола!'),
    D('Kinder, ___ leise! (sein, ihr)', ['seid', 'sind', 'sei', 'seien'], 'seid', 'Дети, тише!'),
    D('___ Sie bitte Platz! (nehmen, Sie)', ['Nehmen', 'Nimm', 'Nehmt', 'Nimmst'], 'Nehmen', 'Присаживайтесь, пожалуйста!'),
  ],
  es_imperfecto: [
    D('Cuando era niño, siempre ___ (hablar) con mi abuela.', ['hablaba', 'hablé', 'hablo', 'hablaré'], 'hablaba', 'В детстве я всегда разговаривал с бабушкой.'),
    D('Mientras yo ___ (leer), mi hermano dormía.', ['leía', 'leí', 'leo', 'leeré'], 'leía', 'Пока я читал, брат спал.'),
    D('___ (ser) de noche y hacía frío.', ['Era', 'Fue', 'Es', 'Será'], 'Era', 'Была ночь, и было холодно.'),
  ],
  es_futuro: [
    D('Mañana ___ (hablar, yo) con él.', ['hablaré', 'hablaría', 'hablaba', 'hablé'], 'hablaré', 'Завтра я поговорю с ним.'),
    D('El año que viene ___ (vivir, nosotros) aquí.', ['viviremos', 'vivíamos', 'vivieron', 'viviríamos'], 'viviremos', 'В следующем году мы будем жить здесь.'),
    D('Te lo ___ (decir, yo) mañana.', ['diré', 'decí', 'dije', 'decía'], 'diré', 'Я скажу тебе это завтра.'),
  ],
  imperative: [
    D('¡___ aquí ahora mismo! (venir, tú)', ['Ven', 'Vienes', 'Vine', 'Venir'], 'Ven', 'Иди сюда сейчас же!', 'es'),
    D('¡No ___ (correr, tú)!', ['corras', 'corres', 'corre', 'corriste'], 'corras', 'Не беги!', 'es'),
    D('___ la porte, s’il te plaît ! (fermer, tu)', ['Ferme', 'Fermes', 'Fermer', 'Fermé'], 'Ferme', 'Закрой дверь, пожалуйста!', 'fr'),
    D('Ne ___ pas ! (courir, tu)', ['cours', 'courir', 'courus', 'couru'], 'cours', 'Не беги!', 'fr'),
  ],
  fr_futur_proche: [
    D('Ce soir, je ___ regarder un film. (aller)', ['vais', 'va', 'vas', 'allons'], 'vais', 'Сегодня вечером я собираюсь посмотреть фильм.'),
    D('Nous allons ___ (manger) au restaurant.', ['manger', 'mangé', 'mangeons', 'mangeait'], 'manger', 'Мы собираемся поесть в ресторане.'),
    D('Il ne ___ pas venir. (aller)', ['va', 'vais', 'vont', 'allez'], 'va', 'Он не придёт.'),
  ],
  fr_conditionnel: [
    D("Si j'avais le temps, je ___ (venir).", ['viendrais', 'viendrai', 'viens', 'venais'], 'viendrais', 'Если бы у меня было время, я бы пришёл.'),
    D('Si nous étions riches, nous ___ (voyager) partout.', ['voyagerions', 'voyagerons', 'voyageons', 'voyagions'], 'voyagerions', 'Если бы мы были богаты, мы бы путешествовали повсюду.'),
    D("S'il faisait beau, ils ___ (aller) à la plage.", ['iraient', 'iront', 'vont', 'allaient'], 'iraient', 'Если бы была хорошая погода, они бы пошли на пляж.'),
  ],
  fr_passe_compose: [
    D('Hier, nous ___ mangé au restaurant. (avoir)', ['avons', 'sommes', 'avez', 'ont'], 'avons', 'Вчера мы поели в ресторане.'),
    D('Elle est ___ (partir) ce matin.', ['partie', 'partir', 'partait', 'part'], 'partie', 'Она уехала сегодня утром.'),
    D('Tu as ___ (voir) ce film ?', ['vu', 'voir', 'vois', 'voyé'], 'vu', 'Ты видел этот фильм?'),
  ],
};
GUIDES.forEach((g) => {
  g.drills = DRILLS[g.id] || [];
});

export function grammarGuide(pattern) {
  const byType = GUIDES.find((g) => g.id === pattern.patternType);
  if (byType) return byType;
  return GUIDES.find((g) => g.match.test(pattern.title || '')) || null;
}

/** Same construction found in several lines → one card with all film examples. */
export function groupGrammar(items) {
  const groups = new Map();
  for (const item of items) {
    const key = (item.title || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { ...item, ids: [], examples: [] });
    const group = groups.get(key);
    group.ids.push(item.id);
    if (item.example && !group.examples.includes(item.example)) group.examples.push(item.example);
  }
  return [...groups.values()];
}

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Correct answer + up to 3 distinct wrong ones, shuffled. */
function options(correct, wrong) {
  const seen = new Set([correct.toLowerCase()]);
  const distractors = [];
  for (const w of shuffle(wrong)) {
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    distractors.push(w);
    if (distractors.length === 3) break;
  }
  return distractors.length ? shuffle([correct, ...distractors]) : null;
}

export const ruleKey = (language, title) => `${language}|${String(title || '').trim().toLowerCase()}`;

/**
 * Grammar self-check: gap-fill sentences ("put the right form") for every rule.
 * groups: result of groupGrammar() (a group may carry its own `language`);
 * exercises: Map ruleKey → generated exercises from the server.
 */
export function buildGrammarQuiz(groups, language, exercises = new Map(), limit = 10) {
  const withGuide = groups.map((g) => ({ group: g, guide: grammarGuide(g) }));
  const sameLang = GUIDES.filter((g) => !g.lang || g.lang === language);
  // Wrong options must be other rules: "Impératif" vs "Impératif présent" would be ambiguous
  const usedGuides = new Set(groups.map((g) => grammarGuide(g)).filter(Boolean));
  const ruleNames = (except) => {
    const own = grammarGuide(except);
    return [
      ...groups.filter((g) => g !== except && (!own || grammarGuide(g) !== own)).map((g) => g.title),
      // a guide already present in the film under its own title would look like a duplicate option
      ...sameLang.filter((g) => !usedGuides.has(g)).map((g) => g.name),
    ];
  };
  const questions = [];

  for (const { group, guide } of withGuide) {
    const lang = group.language || language;
    const generated = exercises.get(ruleKey(lang, group.title)) || [];
    const drills = generated.length
      ? generated
      : (guide?.drills || []).filter((d) => !d.lang || d.lang === lang);

    shuffle(drills)
      .slice(0, 3)
      .forEach((drill, i) => {
        questions.push({
          key: `gap-${group.id}-${i}`,
          group,
          kind: group.title,
          prompt: 'Вставьте правильную форму',
          gap: drill.sentence,
          quoteNote: drill.translation,
          lang,
          options: shuffle(drill.options),
          answer: drill.answer,
          explain: drill.explain || group.explanationRu || '',
        });
      });
    if (drills.length) continue;

    // No exercises for this rule at all: at least recognise it in the film line
    const opts = group.examples.length ? options(group.title, ruleNames(group)) : null;
    if (opts) {
      questions.push({
        key: `ex-${group.id}`,
        group,
        kind: 'Конструкция в реплике',
        prompt: 'Какая конструкция использована в реплике из фильма?',
        quote: pick(group.examples),
        lang,
        options: opts,
        answer: group.title,
        explain: group.explanationRu || '',
      });
    }
  }

  // At least one question per rule first, then fill up to the limit
  const byRule = new Map();
  shuffle(questions).forEach((q) => {
    if (!byRule.has(q.group.id)) byRule.set(q.group.id, []);
    byRule.get(q.group.id).push(q);
  });
  const picked = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const list of byRule.values()) {
      if (list[round] && picked.length < limit) {
        picked.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return shuffle(picked);
}
