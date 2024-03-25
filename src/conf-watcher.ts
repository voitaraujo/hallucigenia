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
			const normalized_path = path.normalize(p);
			/**
			 * since chokidar watches folder/files recursively, eg.
			 * - "repositories/"
			 * x "repositories/.DS_Store"
			 * - "repositories/test"
			 * - "repositories/test/.conf"
			 *
			 * we want to make sure our search for .conf files don't
			 * exclude those previous paths, and also make sure the
			 * only file being validated is the .conf file.
			 */

			const isWatchedFolder = normalized_path === REPOSITORIES_PATH_IDENTIFIER;
			if (isWatchedFolder) return false;

			const isDirectSubPath =
				normalized_path
					.replace(REPOSITORIES_PATH_IDENTIFIER, '')
					.split(path.sep)
					.filter(Boolean).length === 1;
			if (isDirectSubPath) {
				/**
				 * the "path" can be either an dir or file, if its an direct sub "path"
				 * we check if it's actually a file and if so we ignore it.
				 *
				 * also we have to check if the "path" still exists before checking for
				 * a file or else we get an error after an observed "path" gets deleted.
				 */

				// return fs.statSync(p).isFile();
				return (
					fs.existsSync(normalized_path) &&
					fs.statSync(normalized_path).isFile()
				);
			}

			// finally, we don't ignore if it's a .conf file inside an direct subpath of the observed dir.
			if (normalized_path.endsWith('.conf')) return false;

			// any other case we ignore it.
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
