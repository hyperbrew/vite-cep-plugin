import * as os from "os";
import * as path from "path";

import { Plugin } from "rollup";

import { copyFiles, copyModules, unique } from "./copy-node";
const jsxbin = require("jsxbin");

import * as fs from "fs-extra";
const prettifyXml = require("prettify-xml");

// import { requirejs } from "./lib/require-js";

import { log, conColors, posix, resetLog } from "./lib/lib";
import { signZXP } from "./lib/zxp";
import { manifestTemplate } from "./templates/manifest-template";
import { debugTemplate } from "./templates/debug-template";
import { devHtmlTemplate } from "./templates/dev-html-template";
import { htmlTemplate } from "./templates/html-template";
import { ResolvedConfig } from "vite";
import { menuHtmlTemplate } from "./templates/menu-html-template";
import { CEP_Config, JSXBIN_MODE } from "./cep-config";
// export { CEP_Config } from "./cep-config";
export type { CEP_Config };
import { nodeBuiltIns } from "./lib/node-built-ins";
import MagicString from "magic-string";

const homedir = os.homedir();
const tmpDir = path.join(__dirname, ".tmp");
fs.ensureDirSync(tmpDir);

const ccGlobalExtensionFolder =
  os.platform() == "win32"
    ? "C:/Program Files (x86)/Common Files/Adobe/CEP/extensions"
    : "/Library/Application Support/Adobe/CEP/extensions/";

const ccLocalExtensionFolder =
  os.platform() == "win32"
    ? path.join(homedir, "/AppData/Roaming/Adobe/CEP/extensions")
    : path.join(homedir, `/Library/Application Support/Adobe/CEP/extensions`);

const makeSymlink = (dist: string, dest: string) => {
  try {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    fs.symlinkSync(dist, dest, "junction");
    return [true, dest];
  } catch (e) {
    return [false, e];
  }
};

const injectRequire = fs.readFileSync(
  path.join(__dirname, "./lib/require-js.js"),
  {
    encoding: "utf-8",
  }
);

let foundPackages: string[] = [];

interface CepOptions {
  cepConfig: CEP_Config;
  dir: string;
  isProduction: boolean;
  isPackage: boolean;
  debugReact: boolean;
  isServe: boolean;
  cepDist: string;
  zxpDir: string;
  packages: string[];
}
export const cep = (opts: CepOptions) => {
  const {
    cepConfig,
    dir,
    isProduction,
    isPackage,
    isServe,
    debugReact,
    cepDist,
    zxpDir,
    packages,
  } = opts;

  if (cepConfig && cepConfig.panels && isServe) {
    console.clear();
    console.log(`${conColors.green}CEP Panels Served at:`);
    console.log("");
    cepConfig.panels.map((panel) => {
      const relativePath = panel.mainPath;
      const name = panel.name;
      console.log(
        `${conColors.white}   > ${name}: ${conColors.cyan}http://localhost:${cepConfig.servePort}/${name}/`
      );
    });
    resetLog();
    console.log("");
  }

  return {
    name: "cep",
    transformIndexHtml(code: string, opts: any) {
      if (opts && opts.bundle) {
        Object.keys(opts.bundle).filter((file) => {
          if (file.includes("css")) {
            const newCode = opts.bundle[file].source
              .replace(/\(\.\/assets/g, `(../assets`)
              .replace(/\(\/assets/g, `(./`);
            opts.bundle[file].source = newCode;
          }
        });
      }

      // console.log("HTML Transform");
      const isDev = opts.server !== undefined;
      if (isDev) {
        return code;
      }
      let cssFileNameMatches = code.match(/(href=\".*.css\")/g);
      const cssFileNames =
        cssFileNameMatches &&
        Array.from(cssFileNameMatches).map((file) =>
          file.replace('href="', "").replace('"', "")
        );
      const jsFileNameMatch = code.match(/(src=\".*.js\")/);
      const jsFileName =
        jsFileNameMatch &&
        //@ts-ignore
        jsFileNameMatch.pop().replace('src="', "").replace('"', "");

      // TODO: better require transformations
      //@ts-ignore
      const jsName = jsFileName.substr(1);

      let newCode = opts.bundle[jsName].code;

      const allRequires = newCode.match(
        /(require\(\"([A-z]|[0-9]|\.|\/|\-)*\"\)(\;|\,))/g
      );
      if (allRequires) {
        const requireNames = allRequires.map((req: string) =>
          //@ts-ignore
          req.match(/(["'])(?:(?=(\\?))\2.)*?\1/)[0].replace(/\"/g, "")
        );
        const copyModules = requireNames.filter(
          (name: string) =>
            !nodeBuiltIns.includes(name) && ![".", "/", "\\"].includes(name[0])
        );
        foundPackages = foundPackages.concat(copyModules);
      }

      const matches = newCode.match(
        /(\=require\(\"\.([A-z]|[0-9]|\.|\/|\-)*\"\)(\;|\,))/g
      );
      matches?.map((match: string) => {
        const jsPath = match.match(/\".*\"/);
        //@ts-ignore
        const jsBasename = path.basename(jsPath[0]);
        if (jsPath) {
          newCode = newCode.replace(
            match.substring(0, match.length - 1),
            `=typeof cep_node !== 'undefined'?cep_node.require(cep_node.global["__dir"+"name"] + "/assets/${jsBasename}):require("../assets/${jsBasename})`
          );
        }
      });
      newCode = newCode.replace(`="./assets`, `="../assets`);
      newCode = newCode.replace(`="/assets`, `="../assets`);
      newCode = newCode.replace(
        `"use strict"`,
        `"use strict"\rif (typeof exports === 'undefined') { var exports = {}; }`
      );
      opts.bundle[jsName].code = newCode;

      const sharedBundle = Object.keys(opts.bundle).find(
        (key) => key.includes("jsx-runtime") && key.includes(".js")
      );
      if (sharedBundle && opts.bundle[sharedBundle]) {
        opts.bundle[sharedBundle].code = opts.bundle[sharedBundle].code
          .replace(`="./assets`, `="../assets`)
          .replace(`="/assets`, `="../assets`);
      }

      const html = htmlTemplate({
        ...cepConfig,
        debugReact,
        //@ts-ignore
        jsFileName,
        //@ts-ignore
        cssFileNames,
        injectRequire,
      });
      return html;
    },
    // configureServer(server, extra) {
    //   console.log(server);
    //   // return extra;
    // },
    configResolved(config: ResolvedConfig | any) {
      if (!isProduction) {
        console.clear();
        console.log(`${conColors.green}CEP Panels Served at:`);
        console.log("");
        //@ts-ignore
        Object.keys(config.build.rollupOptions.input).map((key: string) => {
          //@ts-ignore
          const filePath = config.build.rollupOptions.input[key];
          const relativePath = path.relative(config.root, filePath);
          const destPath = path.resolve(config.build.outDir, relativePath);
          const panelHtmlFile = {
            type: "asset",
            source: devHtmlTemplate({
              ...cepConfig,
              url: `http://localhost:${cepConfig.port}/${posix(relativePath)}`,
              injectRequire,
            }),
            name: "CEP HTML Dev File",
            fileName: "index.html",
          };
          fs.writeFileSync(destPath, panelHtmlFile.source);
          console.log(
            `${conColors.white}   > ${path.dirname(relativePath)}: ${
              conColors.cyan
            }http://localhost:${cepConfig.port}/${posix(
              path.dirname(relativePath)
            )}/`
          );
        });
      }
    },
    writeBundle() {
      // console.log(" BUILD END");
      const root = "./";
      const src = "./src";
      const dest = "dist/cep";
      const symlink = false;
      const allPackages = unique(packages.concat(foundPackages));
      copyModules({ packages: allPackages, src: root, dest, symlink });
      if (cepConfig.copyAssets) {
        copyFiles({
          src,
          dest,
          assets: cepConfig.copyAssets,
        });
      }

      console.log("FINISH");
      if (isPackage) {
        return signZXP(cepConfig, path.join(dir, cepDist), zxpDir, tmpDir);
      }
    },
    async generateBundle(output: any, bundle: any) {
      const jsFileName = Object.keys(bundle).find(
        (key) => key.split(".").pop() === "js"
      );

      if (jsFileName && bundle[jsFileName].code) {
        // fix paths
        bundle[jsFileName].code = bundle[jsFileName].code.replace(
          /(\/assets\/)/g,
          "../assets/"
        );
      }

      console.log(
        `${conColors.green}cep process: ${
          (isPackage && "zxp package") || (isProduction && "build") || "dev"
        }`
      );

      const manifestFile = {
        type: "asset",
        source: prettifyXml(manifestTemplate(cepConfig), {
          indent: 2,
          newline: "\n",
        }),
        name: "CEP Manifest File",
        fileName: path.join("CSXS", "manifest.xml"),
      };
      //@ts-ignore
      this.emitFile(manifestFile);
      log("manifest created", true);

      // const menuFile = {
      //   type: "asset",
      //   source: menuHtmlTemplate({
      //     displayName: cepConfig.displayName,
      //     menu: cepConfig.panels.map((panel) => {
      //       return {
      //         name: panel.name,
      //         url: panel.mainPath,
      //       };
      //     }),
      //   }),
      //   name: "Menu File",
      //   fileName: path.join("index.html"),
      // };
      //@ts-ignore
      // this.emitFile(menuFile);
      // log("menu created", true);

      const debugFile = {
        type: "asset",

        source: prettifyXml(debugTemplate(cepConfig)),
        name: "CEP Debug File",
        fileName: path.join(".debug"),
      };
      //@ts-ignore
      this.emitFile(debugFile);
      log("debug file created", true);

      try {
        const symlinkPath =
          cepConfig.symlink === "global"
            ? ccGlobalExtensionFolder
            : ccLocalExtensionFolder;
        const res = makeSymlink(
          path.join(dir, cepDist),

          path.join(symlinkPath, cepConfig.id)
        );
        if (!res[0]) {
          log("symlink already exists", true);
        } else {
          log("symlink created", true);
        }
      } catch (e) {
        console.warn(e);
      }

      console.log("");
    },
  };
};

export const jsxInclude = (): Plugin | any => {
  const foundIncludes: string[] = [];
  return {
    name: "extendscript-include-resolver",
    generateBundle: (output: any, bundle: any) => {
      const esFile = Object.keys(bundle).pop();
      //@ts-ignore
      bundle[esFile].code = [...foundIncludes, bundle[esFile].code].join("\r");
    },
    transform: (code: string, id: string) => {
      const s = new MagicString(code);
      // console.log("looking for JSXINCLUDE");
      const includeMatches = code.match(/^\/\/(\s|)\@include(.*)/gm);
      if (includeMatches) {
        // console.log("FOUND!", matches);
        includeMatches.map((match: string) => {
          const innerMatches = match.match(/(?:'|").*(?:'|")/);
          const firstMatch = innerMatches?.pop();
          if (firstMatch) {
            const relativeDir = firstMatch.replace(/(\"|\')/g, "");
            const filePath = path.join(path.dirname(id), relativeDir);
            if (fs.existsSync(filePath)) {
              const text = fs.readFileSync(filePath, { encoding: "utf-8" });
              foundIncludes.push(text);
            } else {
              console.warn(
                `WARNING: File cannot be found for include ${match}`
              );
            }
            s.overwrite(
              code.indexOf(match),
              code.indexOf(match) + match.length,
              ""
            );
          }
        });
      }
      const commentMatches = code.match(/\/\/(\s|)\@(.*)/gm);
      if (commentMatches) {
        let end = 0;
        commentMatches.map((comment) => {
          const start = code.indexOf(comment, end);
          end = start + comment.length;
          s.overwrite(start, end, "");
        });
      }
      return {
        code: s.toString(),
        map: s.generateMap({
          source: id,
          file: `${id}.map`,
          includeContent: true,
        }),
      };
    },
  };
};

export const jsxBin = (jsxBinMode: JSXBIN_MODE) => {
  return {
    name: "extendscript-jsxbin",
    generateBundle: async function (output: any, bundle: any) {
      if (jsxBinMode === "copy" || jsxBinMode === "replace") {
        const esFile = Object.keys(bundle).pop();
        if (esFile) {
          // console.log("GENERATE JSXBIN");
          const srcFilePathTmp = path.join(tmpDir, esFile);
          const esFileBin = esFile.replace("js", "jsxbin");
          const dstFilePathTmp = path.join(tmpDir, esFileBin);
          const tmpSrc = fs.writeFileSync(srcFilePathTmp, bundle[esFile].code, {
            encoding: "utf-8",
          });
          await jsxbin(srcFilePathTmp, dstFilePathTmp);
          const output = fs.readFileSync(dstFilePathTmp, { encoding: "utf-8" });
          const jsxBinFile = {
            type: "asset",
            source: output,
            name: "JSXBIN",
            fileName: esFileBin,
          };
          //@ts-ignore
          this.emitFile(jsxBinFile);
          console.log(`JSXBIN Created: ${esFileBin}`);
          if (jsxBinMode === "replace") {
            delete bundle[esFile];
          }
        }
      }
    },
  };
};
