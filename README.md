# @gordonmleigh/rollup-plugin-npm

A Rollup plugin to install npm packages into the output.

Useful for generating deployment packages in conjunction with [@gordonmleigh/rollup-plugin-npm](https://github.com/gordonmleigh/rollup-plugin-zip).

```javascript
import npm from "@gordonmleigh/rollup-plugin-npm";

export default {
  input: "lib/index.js",

  output: {
    file: "dist/index.mjs",
  },

  plugins: [
    npm({
      // specify packages to install
      install: {
        // use "." to copy version from "./package.json" or specify semver
        leftpad: ".",
      },

      // architecture to install for (no default)
      arch: "arm64",

      // install image to use (defaults to "node")
      image: "node",

      // platform to install for (no default)
      platform: "linux",

      // used to install the correct dependencies (will use `npm ci`)
      lockFile: "./package-lock.json", // default
    }),
  ],
};
```
