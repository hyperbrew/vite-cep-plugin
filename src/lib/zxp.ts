import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";
const { execSync } = child_process;

import { removeIfExists, safeCreate, log, pause } from "./lib";
import { CEP_Config } from "../cep-config";
import { existsSync, readdirSync } from "fs";

export const signZXP = async (
  config: CEP_Config,
  input: string,
  zxpDir: string,
  tmpDir: string
) => {
  const zxpCmd = os.platform() == "win32" ? `ZXPSignCmd` : `./ZXPSignCmd`;
  const name = config.id;
  const data = config.zxp;
  const output = path.join(zxpDir, `${name}.zxp`);
  const certPath = path.join(tmpDir, `${name}-cert  `);
  const signPrepStr = `${zxpCmd} -selfSignedCert ${data.country} ${data.province} ${data.org} ${name} ${data.password} "${certPath}"`;
  const signStr = `${zxpCmd} -sign "${input}" "${output}" "${certPath}" ${data.password} -tsa ${data.tsa}`;
  const cwdDir = path.join(__dirname, "..", "bin");

  removeIfExists(output);
  safeCreate(zxpDir);
  console.log({ signPrepStr });
  execSync(signPrepStr, { cwd: cwdDir, encoding: "utf-8" });
  console.log({ signStr });

  const jsx = path.join(input, "jsx");
  let waits = 1;
  while (!existsSync(jsx) || readdirSync(jsx).length === 0) {
    console.log(`waiting for ExtendScript to finish... ${100 * waits++}ms`);
    await pause(100);
  }

  execSync(signStr, { cwd: cwdDir, encoding: "utf-8" });
  log("built zxp", true, output);
  return output;
};
