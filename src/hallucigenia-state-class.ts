import fs from 'fs';

import { APP_PATH_IDENTIFIER, REPOSITORIES_PATH_IDENTIFIER } from './constants';
import { IdType, menu } from './types';

export class HallucigeniaState {
	#menu: menu;
	#target_repository_id: string | null;

	constructor() {
		this.#menu = 'home';
		this.#target_repository_id = null;
		this.#EnsureHallucigeniaFolderExists();
		this.#EnsureRepositoriesFolderExists();
	}

	GetMenu() {
		return this.#menu;
	}

	GetTargetRepositoryId() {
		if (!this.#target_repository_id) throw new Error('No target repository id');

		return this.#target_repository_id;
	}

	SetMenu<T extends menu>(menu: T, id: IdType<T>) {
		this.#menu = menu;
		this.#target_repository_id = id || null;
	}

	#EnsureHallucigeniaFolderExists() {
		fs.mkdirSync(APP_PATH_IDENTIFIER, {
			recursive: true,
		});
	}

	#EnsureRepositoriesFolderExists() {
		fs.mkdirSync(REPOSITORIES_PATH_IDENTIFIER, {
			recursive: true,
		});
	}
}
