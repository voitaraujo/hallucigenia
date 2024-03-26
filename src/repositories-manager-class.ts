import fs from 'fs';
import path from 'path';

import { REPOSITORIES_PATH_IDENTIFIER } from './constants';
import { Repository } from './repository-class';

export class RepositoriesManager {
	#repositories: Repository[] = [];

	constructor() {
		this.SyncRepos();
	}

	GetRepos() {
		return this.#repositories;
	}

	GetRepo(repositoryId: string) {
		const repo = this.#repositories.find(
			(r) => r.GetRepositoryId() === repositoryId
		);

		if (!repo) throw new Error('Repository not found');

		return repo;
	}

	SyncRepos() {
		this.#repositories = this.#LookupRepositories();
	}

	UncacheUnobservedBranches() {
		for (const repo of this.#repositories) {
			const cached_branches = fs
				.readdirSync(
					path.join(
						REPOSITORIES_PATH_IDENTIFIER,
						repo.GetRepositorySlug(),
						'branches'
					),
					{
						withFileTypes: true,
					}
				)
				.filter((c) => c.isDirectory());

			for (const cb of cached_branches) {
				if (
					!repo
						.GetRepositoryConf()
						.observed_branches.find((ob) => ob.branch_name === cb.name)
				) {
					repo.UncacheBranch(cb.name);
				}
			}
		}
	}

	#LookupRepositories() {
		const repos: Repository[] = [];

		const repos_slug = fs
			.readdirSync(REPOSITORIES_PATH_IDENTIFIER, {
				withFileTypes: true,
			})
			.filter((r) => r.isDirectory());

		repos_slug.forEach((repo) => {
			try {
				const n = new Repository(repo.name);
				repos.push(n);
			} catch (err: unknown) {
				// dunno
			}
		});

		return repos;
	}
}
