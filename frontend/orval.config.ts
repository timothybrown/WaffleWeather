import { defineConfig } from "orval";

export default defineConfig({
  waffleweather: {
    input: {
      target: "../openapi/waffleweather.yaml",
    },
    output: {
      mode: "tags-split",
      target: "src/generated",
      schemas: "src/generated/models",
      client: "react-query",
      httpClient: "fetch",
      baseUrl: "",
      override: {
        mutator: {
          path: "src/lib/fetcher.ts",
          name: "customFetch",
        },
        query: {
          useQuery: true,
        },
      },
    },
  },
});
