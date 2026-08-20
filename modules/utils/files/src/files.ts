/// <reference types="node" />

import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Recursively searches upwards from the current working directory
 * to find a directory with the given name.
 *
 * @param dirName Name of the directory to find
 * @returns The absolute path to the found directory
 * @throws If the directory cannot be found in the current or any parent path
 */
export async function findDirectoryUp(dirName: string): Promise<string> {
    let currentDir = process.cwd();
    while (true) {
        const candidate = path.join(currentDir, dirName);
        try {
            const stats = await fs.stat(candidate);
            if (stats.isDirectory()) {
                return candidate;
            }
        } catch {
            // ignore ENOENT etc.
        }

        const parent = path.dirname(currentDir);
        if (parent === currentDir) throw new Error(`Directory "${dirName}" not found`);
        currentDir = parent;
    }
}
