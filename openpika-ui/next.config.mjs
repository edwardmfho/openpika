/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "react-markdown",
    "unified",
    "bail",
    "is-plain-obj",
    "trough",
    "vfile",
    "vfile-message",
    "unist-util-stringify-position",
    "unist-util-visit",
    "unist-util-visit-parents",
    "unist-util-is",
    "unist-util-position",
    "hast-util-to-jsx-runtime",
    "hast-util-whitespace",
    "property-information",
    "comma-separated-tokens",
    "space-separated-tokens",
    "decode-named-character-reference",
    "character-entities",
    "remark-parse",
    "remark-rehype",
    "mdast-util-to-hast",
    "mdast-util-to-string",
    "mdast-util-phrasing",
    "micromark",
    "micromark-core-commonmark",
    "micromark-factory-destination",
    "micromark-factory-label",
    "micromark-factory-space",
    "micromark-factory-title",
    "micromark-factory-whitespace",
    "micromark-util-chunked",
    "micromark-util-classify-character",
    "micromark-util-combine-extensions",
    "micromark-util-decode-numeric-character-reference",
    "micromark-util-decode-string",
    "micromark-util-encode",
    "micromark-util-html-tag-name",
    "micromark-util-normalize-identifier",
    "micromark-util-resolve-all",
    "micromark-util-sanitize-uri",
    "micromark-util-subtokenize",
    "micromark-util-types",
  ],
  env: {
    OPENPIKA_URL: process.env.OPENPIKA_URL || "http://localhost:8080",
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
