import { spawn } from "node:child_process";
import type { CommandResult, CommandRunner } from "./kind.js";

/** 生产实现：spawn 外部 CLI，收集 stdout/stderr，支持 AbortSignal。 */
export const nodeCommandRunner: CommandRunner = {
  run(command, args, options): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: process.env,
        shell: process.platform === "win32",
        windowsHide: true,
        signal: options?.signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  },
};
