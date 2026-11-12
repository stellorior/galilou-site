#!/usr/bin/env node
// =============================================================================
// Pages « listes prêtes » (GAL-294) : une page par liste de la bibliothèque de
// l'application Galilou, une page d'index par niveau, et les entrées du sitemap.
//
// Source unique : apps/mobile/lib/ready-lists-library.ts (dépôt de l'app).
// Titres, niveaux, consignes, mots et ordre des mots viennent de ce fichier,
// sans retouche. Les slugs sont les mêmes que dans l'app (lien ct=liste-<slug>).
// Seuls les conseils de révision (un par thème) vivent ici.
//
// Usage, depuis la racine du site :
//   node tools/build-ready-lists.mjs <chemin/vers/ready-lists-library.ts>
//
// Écrit listes/<slug>.html, listes/index.html, et remplace le bloc balisé
// « listes-pretes » de sitemap.xml. Supprime les pages de listes/ qui ne
// correspondent plus à aucune liste. Node 18+, aucune dépendance.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SITE = 'https://galilou.com';
const DIR = 'listes';
const HUB_URL = `${SITE}/${DIR}/`;
const HUB_NAME = 'Listes de mots prêtes';
const APP_STORE = (slug) =>
  `https://apps.apple.com/app/apple-store/id6800422398?pt=123491687&ct=liste-${slug}&mt=8`;

// Libellés des thèmes : ceux de l'app (apps/mobile/constants/strings.ts,
// lists.ready.themes).
const THEME_LABELS = {
  sons: 'Sons',
  homophones: 'Homophones',
  paronymes: 'Paronymes',
  invariables: 'Mots invariables',
  accords: 'Accords',
  conjugaison: 'Conjugaison',
  saison: 'Saisons',
};

// Un conseil de révision par thème, pour le parent. Le même sur toutes les
// listes du thème.
const THEME_TIPS = {
  sons:
    "Faites lire chaque mot à voix haute, puis demandez à votre enfant d'entourer les lettres qui font le son travaillé, ou celles qu'on n'entend pas. Rangez ensuite les mots en colonnes selon leur écriture : la règle se voit mieux qu'elle ne s'apprend par cœur.",
  homophones:
    "Un homophone ne se retient pas seul : il se choisit grâce au sens de la phrase. Pour chaque mot, demandez une courte phrase, d'abord à l'oral, puis à l'écrit, et faites dire à votre enfant pourquoi il a choisi cette orthographe. Mélangez ensuite les mots : c'est le choix qui s'entraîne, pas la liste.",
  paronymes:
    "Les paronymes se ressemblent sans vouloir dire la même chose. Travaillez-les par paires : votre enfant explique chaque mot avec ses mots à lui, puis écrit une phrase pour chacun. Quand le sens est clair, l'orthographe suit ; un dictionnaire à portée de main aide à trancher.",
  invariables:
    "Ces mots ne changent jamais : une fois sus, ils le sont pour de bon. Faites-les écrire dans des phrases courtes, quelques mots par soir, puis reprenez seulement ceux qui ont été ratés. Inutile de les copier en colonne : c'est dans une phrase qu'ils seront dictés.",
  accords:
    "Ici, la difficulté n'est pas le mot mais sa forme dans la phrase. Demandez à votre enfant d'écrire chaque mot dans une phrase qui oblige à l'accorder, puis de tracer une flèche vers le mot qui commande l'accord. Changer un nom ou un sujet (un, une, des) fait un bon exercice de deux minutes.",
  conjugaison:
    "La liste donne l'infinitif ; la dictée, elle, donnera le verbe conjugué. Faites conjuguer chaque verbe au temps de la consigne avec deux ou trois sujets différents (je, nous, ils), à l'oral puis à l'écrit. Les verbes qui résistent reviennent le lendemain, seuls, dans une nouvelle phrase.",
  saison:
    "Ces mots se prêtent bien à une petite histoire : demandez à votre enfant de raconter une journée de cette saison avec le plus de mots possible de la liste, puis d'en écrire deux ou trois phrases. Un mot employé dans sa propre histoire a plus de sens qu'un mot récité en colonne.",
};

// ---------------------------------------------------------------- lecture

function fail(message) {
  console.error(`build-ready-lists : ${message}`);
  process.exit(1);
}

function readConstArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!match) fail(`${name} introuvable dans la source`);
  return vm.runInNewContext(`[${match[1]}]`);
}

function readLibrary(path) {
  const source = readFileSync(path, 'utf8');
  const levels = readConstArray(source, 'READY_LIST_LEVELS');
  const themes = readConstArray(source, 'READY_LIST_THEMES');

  const start = source.indexOf('export const READY_LISTS');
  if (start === -1) fail('READY_LISTS introuvable dans la source');
  const open = source.indexOf('= [', start);
  const close = source.lastIndexOf('\n];');
  if (open === -1 || close === -1 || close < open) fail('tableau READY_LISTS illisible');
  const literal = source.slice(open + 2, close + 2);

  const word = (category) => (w) => ({ word: w, category });
  const lists = vm.runInNewContext(`(${literal})`, {
    nom: word('nom'),
    adj: word('adjectif'),
    verbe: word('verbe'),
    inv: word('invariable'),
  });

  const seen = new Set();
  for (const list of lists) {
    if (typeof list.slug !== 'string' || !/^[a-z0-9-]+$/.test(list.slug)) fail(`slug invalide : ${list.slug}`);
    if (seen.has(list.slug)) fail(`slug en double : ${list.slug}`);
    seen.add(list.slug);
    if (typeof list.title !== 'string' || list.title === '') fail(`titre manquant : ${list.slug}`);
    if (!levels.includes(list.level)) fail(`niveau inconnu : ${list.slug}`);
    if (!themes.includes(list.theme)) fail(`thème inconnu : ${list.slug}`);
    if (!Array.isArray(list.words) || list.words.length === 0) fail(`liste vide : ${list.slug}`);
  }
  for (const theme of themes) {
    if (!THEME_LABELS[theme] || !THEME_TIPS[theme]) fail(`libellé ou conseil manquant pour le thème ${theme}`);
  }
  return { levels, lists };
}

// ---------------------------------------------------------------- rendu

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const jsonLd = (data) =>
  `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/<\//g, '<\\/')}\n</script>`;

const pageUrl = (slug) => `${SITE}/${DIR}/${slug}.html`;
const wordCount = (n) => `${n} mots`;
const organization = { '@type': 'Organization', name: 'Galilou', url: `${SITE}/` };

function head({ title, description, canonical, ogTitle, ld }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Galilou">
<meta property="og:locale" content="fr_FR">
${ld.map(jsonLd).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
</head>
<body>

<!-- Page générée par tools/build-ready-lists.mjs (GAL-294) : ne pas modifier à la main. -->

<header class="bandeau">
  <div class="contenu">
    <a class="marque" href="../index.html">Galilou</a>
    <nav>
      <a href="../support.html">Aide</a>
      <a href="../confidentialite.html">Confidentialité</a>
    </nav>
  </div>
</header>
`;
}

const FOOT = `
<footer>
  <div class="contenu">
    <p>Galilou — <a href="../index.html">Accueil</a> · <a href="index.html">${HUB_NAME}</a> · <a href="../confidentialite.html">Confidentialité</a> · <a href="mailto:hello@galilou.com">hello@galilou.com</a></p>
  </div>
</footer>

<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "ce9cb9d9a84149d9b248396721c0004e"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
`;

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

function listPage(list, lists) {
  const theme = THEME_LABELS[list.theme];
  const n = list.words.length;
  const url = pageUrl(list.slug);
  const description = `${list.title} (${list.level}) : les ${n} mots de la liste, un conseil de révision, et la dictée prête dans Galilou.`;
  const siblings = lists.filter((l) => l.level === list.level && l.slug !== list.slug);

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: list.title,
      description,
      inLanguage: 'fr',
      educationalLevel: list.level,
      learningResourceType: 'Liste de mots',
      keywords: theme,
      url,
      isPartOf: { '@type': 'CollectionPage', name: HUB_NAME, url: HUB_URL },
      provider: organization,
      publisher: organization,
    },
    breadcrumb([
      ['Accueil', `${SITE}/`],
      [HUB_NAME, HUB_URL],
      [list.title, url],
    ]),
  ];

  const instruction =
    list.instruction === undefined ? '' : `\n<p><strong>Consigne :</strong> ${esc(list.instruction)}</p>\n`;
  const words = list.words.map(({ word }) => `  <li>${esc(word)}</li>`).join('\n');
  const others =
    siblings.length === 0
      ? ''
      : `
<h2>Autres listes de ${esc(list.level)}</h2>

<ul>
${siblings.map((l) => `  <li><a href="${l.slug}.html">${esc(l.title)}</a></li>`).join('\n')}
</ul>
`;

  return `${head({
    title: `${list.title} — liste de mots ${list.level} — Galilou`,
    description,
    canonical: url,
    ogTitle: `${list.title} (${list.level})`,
    ld,
  })}
<main class="contenu">
<article>

<nav class="fil" aria-label="Fil d'Ariane"><a href="../index.html">Accueil</a> › <a href="index.html">${HUB_NAME}</a> › ${esc(list.title)}</nav>

<h1>${esc(list.title)}</h1>

<p class="chapeau">${esc(list.level)} · ${esc(theme)} · ${wordCount(n)}</p>
${instruction}
<h2>Les mots</h2>

<ul class="mots">
${words}
</ul>

<h2>Conseil de révision</h2>

<p>${esc(THEME_TIPS[list.theme])}</p>

<section class="encadre">
  <p>Dans Galilou, cette liste est prête : ajoutez-la en un geste au profil de votre enfant, et l'application en écrit une vraie dictée, lue à voix haute par groupes de mots. Votre enfant écrit sur son cahier, puis corrige avec vous.</p>
  <p><a class="bouton" href="${esc(APP_STORE(list.slug))}" rel="noopener">Faire cette dictée dans Galilou</a></p>
  <p class="petit">Disponible sur iPhone.</p>
</section>
${others}
<p><a href="index.html">Toutes les listes prêtes, du CE2 à la 4e</a></p>

</article>
</main>
${FOOT}`;
}

function hubPage(levels, lists) {
  const description =
    'Des listes de mots écrites pour Galilou, du CE2 à la 4e : sons, homophones, accords, conjugaison… Les mots, un conseil de révision, et la dictée prête dans Galilou.';
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: HUB_NAME,
      description,
      inLanguage: 'fr',
      url: HUB_URL,
      isPartOf: { '@type': 'WebSite', name: 'Galilou', url: `${SITE}/` },
      publisher: organization,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: lists.length,
        itemListElement: lists.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: pageUrl(l.slug),
          name: `${l.title} (${l.level})`,
        })),
      },
    },
    breadcrumb([
      ['Accueil', `${SITE}/`],
      [HUB_NAME, HUB_URL],
    ]),
  ];

  const sections = levels
    .map((level) => {
      const ofLevel = lists.filter((l) => l.level === level);
      if (ofLevel.length === 0) return '';
      const items = ofLevel
        .map(
          (l) =>
            `  <li><a href="${l.slug}.html">${esc(l.title)}</a> · ${esc(THEME_LABELS[l.theme])} · ${wordCount(l.words.length)}</li>`
        )
        .join('\n');
      return `
<h2>${esc(level)}</h2>

<ul>
${items}
</ul>
`;
    })
    .join('');

  return `${head({
    title: 'Listes de mots prêtes pour la dictée, du CE2 à la 4e — Galilou',
    description,
    canonical: HUB_URL,
    ogTitle: 'Listes de mots prêtes pour la dictée, du CE2 à la 4e',
    ld,
  })}
<main class="contenu">
<article>

<nav class="fil" aria-label="Fil d'Ariane"><a href="../index.html">Accueil</a> › ${HUB_NAME}</nav>

<h1>Listes de mots prêtes, du CE2 à la 4e</h1>

<p class="chapeau">Des listes de mots écrites pour Galilou, pour lancer une vraie dictée même sans liste sous la main. Chaque page donne les mots, un conseil de révision, et la dictée prête dans l'application.</p>

<p>Si votre enfant a une liste dans son cahier, c'est elle qu'il faut travailler d'abord : ces listes servent les semaines où il n'y en a pas, ou pour revoir un son, un accord, une conjugaison.</p>
${sections}
</article>
</main>
${FOOT}`;
}

// ---------------------------------------------------------------- sitemap

const START = '  <!-- listes-pretes:start (tools/build-ready-lists.mjs) -->';
const END = '  <!-- listes-pretes:end -->';

function updateSitemap(path, lists) {
  const xml = readFileSync(path, 'utf8');
  const block = [
    START,
    `  <url><loc>${HUB_URL}</loc></url>`,
    ...lists.map((l) => `  <url><loc>${pageUrl(l.slug)}</loc></url>`),
    END,
  ].join('\n');
  const s = xml.indexOf(START);
  const e = xml.indexOf(END);
  let next;
  if (s !== -1 && e !== -1) {
    next = xml.slice(0, s) + block + xml.slice(e + END.length);
  } else {
    const close = xml.lastIndexOf('</urlset>');
    if (close === -1) fail('sitemap.xml sans </urlset>');
    next = `${xml.slice(0, close)}${block}\n${xml.slice(close)}`;
  }
  writeFileSync(path, next);
}

// ---------------------------------------------------------------- main

const source = process.argv[2];
if (!source) fail('usage : node tools/build-ready-lists.mjs <chemin/vers/ready-lists-library.ts>');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, DIR);
const { levels, lists } = readLibrary(resolve(source));

mkdirSync(out, { recursive: true });
const expected = new Set(['index.html', ...lists.map((l) => `${l.slug}.html`)]);
for (const file of readdirSync(out)) {
  if (file.endsWith('.html') && !expected.has(file)) unlinkSync(join(out, file));
}
for (const list of lists) writeFileSync(join(out, `${list.slug}.html`), listPage(list, lists));
writeFileSync(join(out, 'index.html'), hubPage(levels, lists));
updateSitemap(join(root, 'sitemap.xml'), lists);

console.log(`build-ready-lists : ${lists.length} pages de listes, index et sitemap écrits dans ${out}`);
