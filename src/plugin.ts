import { spawn } from "child_process";
import { copyFile, readFile, readdir, writeFile } from "fs/promises";
import memoize from "memoize";
import { basename, join, relative } from "path";
import type { Plugin } from "rollup";
import { temporaryDirectoryTask } from "tempy";

export type NpmPluginOptions = {
  arch?: string;
  image?: string;
  install: Record<string, string>;
  lockFile?: string;
  platform?: string;
};

function npm(options: NpmPluginOptions): Plugin {
  const {
    install = [],
    lockFile = "./package-lock.json",
    arch,
    platform,
    image = "node",
  } = options;

  const platformArg = [platform, arch].filter(Boolean).join("/") || undefined;

  const readPackage = memoize(async (path) =>
    JSON.parse(await readFile(path, "utf-8")),
  );

  return {
    name: "npm",

    async generateBundle() {
      const dependencies: Record<string, string> = {};

      if (!options.image) {
        this.warn(`no install image specified, defaulting to "${image}"`);
      }

      for (const [name, versionSpec] of Object.entries(install)) {
        if (versionSpec === "." || versionSpec.startsWith("./")) {
          const pkgFilePath =
            versionSpec === "." ? "package.json" : versionSpec;

          // read version from package.json
          let pkgFile;

          try {
            pkgFile = await readPackage(pkgFilePath);
          } catch (err: any) {
            if (err?.code === "ENOENT") {
              this.error(`can't find package file "${pkgFilePath}"`);
            }
            throw err;
          }

          const version =
            pkgFile.dependencies?.[name] ??
            pkgFile.devDependencies?.[name] ??
            pkgFile.peerDependencies?.[name];

          if (!version) {
            this.error(
              `can't resolve version for package "${name}" in package file "${pkgFilePath}"`,
            );
          }
          dependencies[name] = version;
        } else {
          dependencies[name] = versionSpec;
        }
      }

      await temporaryDirectoryTask(async (tempPath) => {
        this.info(`installing packages to temporary path ${tempPath}`);

        // write the package json with resolved package versions
        await writeFile(
          join(tempPath, "package.json"),
          JSON.stringify({ private: true, dependencies }),
        );

        // copy the lock file
        await copyFile(lockFile, join(tempPath, basename(lockFile)));

        const cmd = "docker";
        const args = ["run", "--rm", "-v", `${tempPath}:/app`, "-w", "/app"];

        if (platformArg) {
          args.push("--platform", platformArg);
        }
        args.push(image, "npm", "ci");

        this.info(
          `installing using image ${image} (${
            platformArg || "default platform"
          })`,
        );

        // install the packages
        const proc = spawn(cmd, args, {
          cwd: tempPath,
          stdio: "inherit",
        });

        await new Promise<void>((resolve, reject) => {
          proc.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(
                new Error(`process exited with non-zero error code ${code}`),
              );
            }
          });
        });

        // readdir can do recursive in v20, refactor this when v20 is widely used
        const stack = [join(tempPath, "node_modules")];
        let current;
        while ((current = stack.pop())) {
          const children = await readdir(current, { withFileTypes: true });
          for (const child of children) {
            const childPath = join(current, child.name);
            if (child.isDirectory()) {
              stack.push(childPath);
            } else if (child.isFile()) {
              this.emitFile({
                type: "asset",
                fileName: relative(tempPath, childPath),
                source: await readFile(childPath),
              });
            }
          }
        }
      });
    },
  };
}

export default npm;
