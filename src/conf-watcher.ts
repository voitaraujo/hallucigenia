import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

import { REPOSITORIES_PATH_IDENTIFIER } from './constants';

async function WatchRepositoryConfFiles(
	cb: (path: string) => Promise<void> | void
) {
	const watcher = chokidar.watch(REPOSITORIES_PATH_IDENTIFIER, {
		depth: 1,
		ignored: (p) => {
			/**
			 * since chokidar watches folder/files recursively, eg.
			 * - "repositories/"
			 * x "repositories/.DS_Store"
			 * - "repositories/test"
			 * - "repositories/test/.conf"
			 *
			 * we want to make sure our search for .conf files don't
			 * exclude those previos paths, and also make sure the
			 * only file being validated is the .conf file.
			 */

			const isWatchedFolder = p === REPOSITORIES_PATH_IDENTIFIER;
			if (isWatchedFolder) return false;

			const isDirectSubPath =
				p
					.replace(REPOSITORIES_PATH_IDENTIFIER, '')
					.split(path.sep)
					.filter(Boolean).length === 1;
			if (isDirectSubPath) {
				return fs.existsSync(p) && fs.statSync(p).isFile();
			}

			if (p.endsWith('.conf')) return false;

			return true;
		},
		ignoreInitial: true,
	});

	watcher.on('add', async (path, _) => {
		await cb(path);
	});

	watcher.on('change', async (path, _) => {
		await cb(path);
	});

	watcher.on('unlink', async (path) => {
		await cb(path);
	});
}

export { WatchRepositoryConfFiles };
