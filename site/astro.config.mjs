// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import remarkHeadingId from "remark-heading-id";
import starlightLinksValidator from "starlight-links-validator";

export default defineConfig({
  site: "https://tgerke.github.io",
  base: "/ctms-core",
  markdown: {
    remarkPlugins: [remarkHeadingId],
  },
  integrations: [
    starlight({
      title: "ctms-core",
      description:
        "A regulatory-document backbone for clinical trials where completeness is a query, not a monitoring visit",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/tgerke/ctms-core" }],
      customCss: ["./src/styles/custom.css"],
      components: {
        Footer: "./src/components/Footer.astro",
      },
      plugins: [starlightLinksValidator({ errorOnLocalLinks: false })],
      sidebar: [
        {
          label: "Getting started",
          items: ["getting-started"],
        },
        {
          label: "User guide",
          items: [
            "user-guide",
            "user-guide/documents",
            "user-guide/monitoring-visits",
            "user-guide/issues",
            "user-guide/enrollment-milestones",
            "user-guide/administration",
            "user-guide/site-logs",
            "user-guide/inspection",
            "user-guide/statuses",
          ],
        },
        {
          label: "Technical guide",
          items: [
            "data-model",
            "operations",
            "compliance",
            "validation",
            "sql-access",
            "roadmap",
          ],
        },
        {
          label: "Cookbook",
          items: ["cookbook"],
        },
        {
          label: "Reference",
          items: ["glossary", "decisions"],
        },
      ],
    }),
  ],
});
