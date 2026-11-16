import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
      // Workers AI has no local simulator and forces a remote login.
      // Mock mode never calls it, so drop the binding before Vite starts.
      config: (config) => {
        if (process.env.SCI_BRIDGE_LOCAL === "1") delete config.ai;
      },
    }),
  ],
});
