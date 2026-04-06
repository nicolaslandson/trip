/**
 * SEO pass: canonical, OG/Twitter, inline nav, JSON-LD, related block, year bump.
 * Run: node scripts/apply-seo.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OG_IMAGE = "https://tripok.es/img/preview.svg";
const NAV = fs.readFileSync(path.join(ROOT, "nav.html"), "utf8").trim();

const BOOTSTRAP_INIT = `
<script>
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof bootstrap !== "undefined") {
      [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]')).forEach(function (el) {
        new bootstrap.Tooltip(el);
      });
      [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]')).forEach(function (el) {
        new bootstrap.Popover(el);
      });
    }
  });
</script>`.trim();

const RELATED_CITIES = `
<section class="mb-5" id="related-guides" aria-labelledby="related-guides-heading">
  <h2 id="related-guides-heading" class="h4">More Spain city guides</h2>
  <p>Explore other destinations: <a href="/spain/barcelona.html">Barcelona</a>, <a href="/spain/sevilla.html">Seville</a>, <a href="/spain/granada.html">Granada</a>, <a href="/spain/valencia.html">Valencia</a>, <a href="/spain/malaga.html">Málaga</a>, <a href="/spain/madrid.html">Madrid</a>, or <a href="/spain/">browse all cities</a>.</p>
</section>
`.trim();

const NAV_FETCH_RE =
  /(?:<!--[^>]*-->\s*)?<div id="nav-placeholder"><\/div>\s*<script>[\s\S]*?fetch\("\/nav\.html"\)[\s\S]*?<\/script>/g;

function walkHtml(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "scripts") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, out);
    else if (name.endsWith(".html") && name !== "nav.html" && name !== "footer.html") {
      out.push(path.relative(ROOT, full));
    }
  }
}

function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

function canonicalFor(relPosix) {
  if (relPosix === "index.html") return "https://tripok.es/";
  if (relPosix.endsWith("/index.html")) {
    const dir = relPosix.slice(0, -"index.html".length);
    return "https://tripok.es/" + dir;
  }
  return "https://tripok.es/" + relPosix;
}

function escapeAttr(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "Tripok.es";
}

function extractDesc(html) {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return m ? m[1] : "";
}

function stripOgAndCanonical(html) {
  return html
    .replace(/\s*<link\s+rel="canonical"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+property="og:[^"]+"\s+content="[^"]*"\s*>\s*/gi, "\n")
    .replace(/\s*<meta\s+name="twitter:[^"]+"\s+content="[^"]*"\s*>\s*/gi, "\n");
}

function ogBlock(canonical, title, desc) {
  const d = desc || title;
  return `  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(d)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Tripok.es">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(d)}">
  <meta name="twitter:image" content="${OG_IMAGE}">`;
}

function insertAfterDescription(html, block) {
  const re = /(<meta\s+name="description"\s+content="[^"]*"\s*\/?>)/i;
  if (re.test(html)) return html.replace(re, "$1\n" + block);
  const fallback =
    "Tripok.es — Spain travel planning, budget calculator, and city guides. | Tripok.es";
  return html.replace(
    /(<\/title>)/i,
    '$1\n  <meta name="description" content="' + escapeAttr(fallback) + '">\n' + block
  );
}

function websiteSchema(desc) {
  return `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tripok.es",
    url: "https://tripok.es/",
    description: desc,
    publisher: { "@type": "Organization", name: "Tripok.es" },
  },
  null,
  2
)}
</script>`;
}

function articleBreadcrumbSchema(canonical, headline, desc, crumbs) {
  const graph = [
    {
      "@type": "Article",
      headline,
      description: desc,
      author: { "@type": "Organization", name: "Tripok.es" },
      publisher: { "@type": "Organization", name: "Tripok.es" },
      datePublished: "2026-04-01",
      dateModified: "2026-04-01",
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
  ];
  return `<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)}
</script>`;
}

function breadcrumbOnlySchema(crumbs, rootId) {
  const obj = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
  if (rootId) obj["@id"] = rootId;
  return `<script type="application/ld+json">
${JSON.stringify(obj, null, 2)}
</script>`;
}

const FAQ_MAIN_ENTITY = [
  {
    "@type": "Question",
    name: "How does the budget calculator work?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "You enter the city and number of days — the site estimates the cost based on typical hotel, flight, and car rental prices for that specific city in Spain.",
    },
  },
  {
    "@type": "Question",
    name: "Is the calculator free?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Yes, the tool is free to use with no registration required.",
    },
  },
  {
    "@type": "Question",
    name: "Where do the prices come from?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "They are based on average market prices, public data, and partner sources, refreshed regularly. Final prices may vary by season and availability.",
    },
  },
  {
    "@type": "Question",
    name: "When is the best time to visit Spain?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Spring (April–June) and fall (September–October) usually offer pleasant weather with fewer crowds than peak summer.",
    },
  },
  {
    "@type": "Question",
    name: "How much should I budget per day in Spain?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Many travelers spend roughly €40–120 per day depending on style: budget, mid-range, or luxury, including lodging, food, and transport.",
    },
  },
];

function faqSchema() {
  return `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_MAIN_ENTITY,
  },
  null,
  2
)}
</script>`;
}

function injectBeforeHeadClose(html, markerSubstr, snippet) {
  if (html.includes(markerSubstr)) return html;
  return html.replace(/<\/head>/i, snippet + "\n</head>");
}

function replaceNav(html, needsBootstrapInit) {
  const replacement = NAV + (needsBootstrapInit ? "\n" + BOOTSTRAP_INIT : "");
  return html.replace(NAV_FETCH_RE, replacement);
}

function cityLabelFromFile(relPosix) {
  const base = path.basename(relPosix, ".html");
  const map = {
    sevilla: "Seville",
    cordoba: "Córdoba",
    malaga: "Málaga",
  };
  if (map[base]) return map[base];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function applyYearContent(html, relPosix) {
  html = html.replace(/© 2025 Tripok\.es/g, "© 2026 Tripok.es");
  if (relPosix === "spain/index.html") {
    html = html.replace(
      /Spain Travel Guide \(2025\)/g,
      "Spain Travel Guide (2026)"
    );
    html = html.replace(/Spain travel guide \(2025\)/gi, "Spain travel guide (2026)");
  }
  if (relPosix === "events/feria.html") {
    html = html.replace(/Festival Guide 2025/g, "Festival Guide 2026");
  }
  if (relPosix === "spain/sevilla.html") {
    html = html.replace(/updated for 2025/gi, "updated for 2026");
  }
  if (relPosix === "lottery/index.html") {
    const lotteryPairs = [
      ["Lotería Navidad Comprobar 2025", "Lotería Navidad Comprobar 2026"],
      ["lotería navidad 2025", "lotería navidad 2026"],
      ["Christmas Lottery 2025", "Christmas Lottery 2026"],
      ["prize in 2025.", "prize in 2026."],
      ["2025 Results & Winning Numbers", "2026 Results & Winning Numbers"],
      ["How to Check Your Spanish Christmas Lottery Ticket 2025", "How to Check Your Spanish Christmas Lottery Ticket 2026"],
      ["From December 22, 2025 after", "From December 22, 2026 after"],
      ["December 22, 2025</strong>", "December 22, 2026</strong>"],
      ["December 22, 2025 after", "December 22, 2026 after"],
      ["Official results for 2025", "Official results for 2026"],
      ["When is the 2025 Draw", "When is the 2026 Draw"],
      ["<strong>Date:</strong> December 22, 2025 (always", "<strong>Date:</strong> December 22, 2026 (always"],
      ["after December 22, 2025", "after December 22, 2026"],
    ];
    for (const [a, b] of lotteryPairs) {
      html = html.split(a).join(b);
    }
  }
  return html;
}

function processFile(relPosix) {
  const full = path.join(ROOT, ...relPosix.split("/"));
  let html = fs.readFileSync(full, "utf8");

  if (relPosix === "terms/index.html") {
    html = html.replace(
      /<title>Terms of Use<\/title>/i,
      "<title>Terms of Use | Tripok.es</title>"
    );
    if (!/name="description"/i.test(html)) {
      html = html.replace(
        /<\/title>/i,
        '</title>\n  <meta name="description" content="Terms of Use for Tripok.es: budget calculator, travel guides, affiliate links, and acceptable use. | Tripok.es" />'
      );
    }
  }
  if (relPosix === "privacy/index.html") {
    html = html.replace(
      /<title>Privacy Policy<\/title>/i,
      "<title>Privacy Policy | Tripok.es</title>"
    );
    if (!/name="description"/i.test(html)) {
      html = html.replace(
        /<\/title>/i,
        '</title>\n  <meta name="description" content="Privacy Policy for Tripok.es: analytics, cookies, third-party services, and how we handle visitor data. | Tripok.es" />'
      );
    }
  }

  html = stripOgAndCanonical(html);

  const title = extractTitle(html);
  const desc = extractDesc(html) || title;
  const canonical = canonicalFor(relPosix);
  html = insertAfterDescription(html, ogBlock(canonical, title, desc));

  const needsBootstrap =
    relPosix === "index.html" ||
    relPosix === "flight/index.html" ||
    relPosix === "hotel/index.html" ||
    relPosix === "404.html";

  html = replaceNav(html, needsBootstrap);

  if (relPosix === "index.html") {
    html = injectBeforeHeadClose(html, '"@type": "WebSite"', websiteSchema(desc));
  } else if (relPosix === "faq/index.html") {
    html = injectBeforeHeadClose(html, '"@type": "FAQPage"', faqSchema());
  } else if (relPosix === "spain/index.html") {
    html = injectBeforeHeadClose(
      html,
      '"Spain travel guide"',
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Spain travel guide", item: canonical },
      ])
    );
  } else if (/^spain\/[a-z]+\.html$/.test(relPosix) && relPosix !== "spain/sevilla.html") {
    const city = cityLabelFromFile(relPosix);
    html = injectBeforeHeadClose(
      html,
      `"headline": ${JSON.stringify(title)}`,
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Spain", item: "https://tripok.es/spain/" },
        { name: city, item: canonical },
      ])
    );
  } else if (relPosix === "spain/sevilla.html") {
    html = injectBeforeHeadClose(
      html,
      "spain/sevilla.html#breadcrumb",
      breadcrumbOnlySchema(
        [
          { name: "Home", item: "https://tripok.es/" },
          { name: "Spain", item: "https://tripok.es/spain/" },
          { name: "Seville", item: canonical },
        ],
        "https://tripok.es/spain/sevilla.html#breadcrumb"
      )
    );
  } else if (relPosix === "guide/index.html") {
    html = injectBeforeHeadClose(
      html,
      '"@id": "https://tripok.es/guide/"',
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Seville PDF guide", item: canonical },
      ])
    );
  } else if (relPosix === "events/index.html") {
    html = injectBeforeHeadClose(
      html,
      '"@id": "https://tripok.es/events/"',
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Events & festivals", item: canonical },
      ])
    );
  } else if (relPosix === "events/feria.html") {
    html = injectBeforeHeadClose(
      html,
      '"@id": "https://tripok.es/events/feria.html"',
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Events", item: "https://tripok.es/events/" },
        { name: "Feria de Abril", item: canonical },
      ])
    );
  } else if (relPosix === "events/rocio.html") {
    html = injectBeforeHeadClose(
      html,
      '"@id": "https://tripok.es/events/rocio.html"',
      articleBreadcrumbSchema(canonical, title, desc, [
        { name: "Home", item: "https://tripok.es/" },
        { name: "Events", item: "https://tripok.es/events/" },
        { name: "El Rocío", item: canonical },
      ])
    );
  }

  if (/^spain\/[a-z]+\.html$/.test(relPosix) && !html.includes('id="related-guides"')) {
    html = html.replace(/<footer>/i, RELATED_CITIES + "\n\n<footer>");
  }

  html = applyYearContent(html, relPosix);

  fs.writeFileSync(full, html, "utf8");
  console.log("OK", relPosix);
}

const files = [];
walkHtml(ROOT, files);
for (const f of files.sort()) {
  processFile(toPosix(f));
}
