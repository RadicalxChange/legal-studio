const pluginRss = require("@11ty/eleventy-plugin-rss");
const markdownIt = require("markdown-it");
const katex = require("katex");
const yaml = require("js-yaml");
const fs = require("fs");
const { DateTime } = require("luxon");
const posthtml = require("posthtml");
const beautifyHtml = require("js-beautify").html;
const uslug = require("uslug");
const nunjucks = require("nunjucks");

module.exports = function (config) {
  const isDev = process.env.RXC_DEV === "true";
  if (isDev) {
    console.log("Running with RXC_DEV set to true");
  }

  // Adding this just for the absoluteUrl filter used in 11ty examples
  config.addPlugin(pluginRss);

  // Support rendering data to markdown
  let markdown = markdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(require("markdown-it-anchor"), {
      slugify: uslug,
    })
    .use(require("markdown-it-toc-done-right"), {
      slugify: uslug,
      listClass: "list-aligned",
      listType: "ul",
      containerClass: "toc",
      containerId: "toc",
      itemClass: "toc-item",
      linkClass: "toc-link",
    })
    .use(require("markdown-it-footnote"));
  markdown.renderer.rules.footnote_block_open = () => `<hr/>\n<ol>\n`;
  markdown.renderer.rules.footnote_block_close = () => `</ol>\n`;
  config.setLibrary("md", markdown);
  config.addFilter("markdown", (value) => markdown.render(value));
  config.addFilter("latex", (content) => {
    return content.replace(/\$\$(.+?)\$\$/g, (_, equation) => {
      const cleanEquation = equation.replace(/&lt;/g, "<").replace(/&gt;/g, ">");

      return katex.renderToString(cleanEquation, { throwOnError: false });
    });
  });

  config.addFilter("safe", (content) => {
    return new nunjucks.runtime.SafeString(content);
  });

  // Support YAML for data
  config.addDataExtension("yaml", (contents) => yaml.load(contents));

  // Formatting for dates
  function readableDate(dateStr) {
    return DateTime.fromISO(dateStr, { zone: "utc" }).toLocaleString(
      DateTime.DATE_FULL
    );
  }
  config.addFilter("readableDate", readableDate);
  config.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  // Default href filter
  config.addFilter("defaultHref", function (value, defaultHref) {
    if (value === "#") {
      return defaultHref;
    } else {
      return value;
    }
  });

  // Default slugs
  config.addFilter("defaultSlug", function (customSlug, title) {
    if (!customSlug) {
      return uslug(title);
    } else {
      return customSlug;
    }
  });

  // Array.slice()
  config.addFilter("slice", function (array, ...args) {
    return array.slice(...args);
  });

  // Pass through static assets
  // src/site/images is copied through its own pipeline (see package.json)
  config.addPassthroughCopy("./src/site/fonts");
  config.addPassthroughCopy("./src/site/files");
  config.addPassthroughCopy("./src/site/js");
  config.addPassthroughCopy("./src/site/_redirects");
  config.addPassthroughCopy("./src/site/_headers");

  // Optimize HTML
  config.addTransform("posthtml", async function (content, outputPath) {
    if (outputPath.endsWith(".html")) {
      const { html } = await posthtml([
        require("posthtml-alt-always")(),
        require("posthtml-link-noreferrer")(),
        require("htmlnano")({
          minifySvg: false,
        }),
      ]).process(content);

      if (isDev) {
        return beautifyHtml(html, { indent_size: 2 });
      } else {
        return html;
      }
    }
    return content;
  });

  // Browsersync to serve 404
  config.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync("./dist/404.html");

        browserSync.addMiddleware("*", (req, res) => {
          res.write(content_404);
          res.end();
        });
      },
    },
  });

  return {
    dir: {
      input: "src/site",
      output: "dist",
    },
    templateFormats: ["njk", "11ty.js", "md", "pdf"],
  };
};
