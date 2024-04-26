import { exec, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import {
	CONFIGURATION_FILE_IDENTIFIER,
	REPOSITORIES_PATH_IDENTIFIER,
} from './constants';
import { RepositoryConf } from './types';
import { GetPlatformScriptingExtension } from './utils';

export class Repository {
	#repository_slug: string;

	constructor(slug: string) {
		this.#repository_slug = slug;

		this.GetRepositoryConf(); // just to check if the repository slug provided actually points to a valid repository folder.
		this.#EnsureRepositoryFoldersExists();
	}

	static AttachRepository(
		repository_slug: string,
		newRepoConfParts: Pick<
			RepositoryConf,
			| 'repository_workspace_name'
			| 'repository_name'
			| 'repository_access_token'
		>
	) {
		const id = randomUUID();

		fs.mkdirSync(path.join(REPOSITORIES_PATH_IDENTIFIER, repository_slug), {
			recursive: true,
		});

		fs.writeFileSync(
			path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				repository_slug,
				CONFIGURATION_FILE_IDENTIFIER
			),
			JSON.stringify({
				repository_id: id,
				...newRepoConfParts,
				observed_branches: [],
				branches: [],
				remote_connection_status: 'ok',
			}),
			{
				encoding: 'utf-8',
			}
		);

		return id;
	}

	DetachRepository() {
		fs.rmSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug), {
			recursive: true,
			force: true,
		});
	}

	GetRepositoryId() {
		return this.GetRepositoryConf().repository_id;
	}

	GetRepositorySlug() {
		return this.#repository_slug;
	}

	UpdateRepositorySlug(newSlug: string) {
		fs.renameSync(
			path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug),
			path.join(REPOSITORIES_PATH_IDENTIFIER, newSlug)
		);

		this.#repository_slug = newSlug;
	}

	GetRepositoryConf() {
		const safe_conf_content = this.#GetConfAsSafeObject(this.#repository_slug);

		return safe_conf_content;
	}

	UpdateRepositoryConf(
		updatedRepositoryConf: Partial<Omit<RepositoryConf, 'repository_id'>>
	) {
		const new_repo_conf = {
			...this.GetRepositoryConf(),
			...updatedRepositoryConf,
		};

		fs.writeFileSync(
			this.#GetConfLocationPath(this.#repository_slug),
			JSON.stringify(new_repo_conf)
		);
	}

	GetRepositoryScriptList() {
		const repo_scripts = fs
			.readdirSync(
				path.join(
					REPOSITORIES_PATH_IDENTIFIER,
					this.#repository_slug,
					'scripts'
				),
				{
					withFileTypes: true,
				}
			)
			.filter(
				(s) => s.isFile() && s.name.endsWith(GetPlatformScriptingExtension())
			)
			.map((s) => path.basename(s.name, GetPlatformScriptingExtension()));

		return repo_scripts;
	}

	GetRepositoryScriptContent(scriptName: string) {
		try {
			return fs.readFileSync(
				path.join(
					REPOSITORIES_PATH_IDENTIFIER,
					this.#repository_slug,
					'scripts',
					`${scriptName}${GetPlatformScriptingExtension()}`
				),
				{
					encoding: 'utf8',
				}
			);
		} catch (err) {
			return undefined;
		}
	}

	CreateRepositoryScript(scriptName: string, newScriptContent: string) {
		fs.writeFileSync(
			path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'scripts',
				`${scriptName}${GetPlatformScriptingExtension()}`
			),
			newScriptContent,
			{ encoding: 'utf8' }
		);
	}

	DeleteRepositoryScript(scriptName: string) {
		fs.rmSync(
			path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'scripts',
				`${scriptName}${GetPlatformScriptingExtension()}`
			),
			{
				recursive: true,
				force: true,
			}
		);
	}

	UpdateRepositoryScript(scriptName: string, updatedScriptContent: string) {
		fs.writeFileSync(
			path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'scripts',
				`${scriptName}${GetPlatformScriptingExtension()}`
			),
			updatedScriptContent,
			{ encoding: 'utf8' }
		);
	}

	RunRepositoryScript(scriptName: string, updatedBranchName: string) {
		try {
			const date_d = new Date().getTime();

			const script_name = `${scriptName}${GetPlatformScriptingExtension()}`;
			const log_name = `${scriptName}-${date_d}.txt`;

			const script_path = path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'scripts'
			);
			const log_path = path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'logs'
			);

			const log = fs.createWriteStream(path.join(log_path, log_name));

			const scriptProcess = spawn(
				GetPlatformScriptingExtension() === '.sh' ? 'bash' : script_name,
				GetPlatformScriptingExtension() === '.sh'
					? [path.join(script_path, script_name)]
					: [],
				{
					cwd: script_path,
					env: {
						...process.env,
						UPDATED_BRANCH_PATH: path.join(
							REPOSITORIES_PATH_IDENTIFIER,
							this.#repository_slug,
							'branches',
							updatedBranchName
						),
					},
					shell: true,
					stdio: 'pipe',
				}
			);

			scriptProcess.stdout.on('data', (data: unknown) => {
				if (data && data.toString) {
					log.write(data.toString());
				}
			});

			scriptProcess.stderr.on('data', (data: unknown) => {
				if (data && data.toString) {
					log.write(data.toString());
				}
			});

			scriptProcess.on('close', (code) => {
				log.write(`script exited with code ${code || 'unknown'}`);
				log.end();
			});

			return true;
		} catch (err: unknown) {
			return false;
		}
	}

	async CacheBranch(branchName: string) {
		const repository_conf = this.GetRepositoryConf();
		const target_branch_folder = path.join(
			REPOSITORIES_PATH_IDENTIFIER,
			this.#repository_slug,
			'branches',
			branchName
		);

		// clear folder if it already exists
		this.FreeBranchData(branchName);

		const clone_command = `git clone -b "${branchName}" "https://x-token-auth:${repository_conf.repository_access_token}@bitbucket.org/${repository_conf.repository_workspace_name}/${repository_conf.repository_name}.git" "${target_branch_folder}"`;
		const command = exec(clone_command);

		const clone_success = await new Promise<boolean>((resolve) => {
			command.on('exit', (code, _) => {
				if (code !== 0) {
					resolve(false);
				}

				resolve(true);
			});
		});

		// clear folder if the clone wasn't successful
		if (!clone_success) {
			this.FreeBranchData(branchName);
		}

		return clone_success;
	}

	FreeBranchData(branchName: string) {
		const target_branch_folder = path.join(
			REPOSITORIES_PATH_IDENTIFIER,
			this.#repository_slug,
			'branches',
			branchName
		);

		fs.rmSync(target_branch_folder, {
			recursive: true,
			force: true,
		});
	}

	#GetConfAsSafeObject(repoSlug: string) {
		const repository_conf_path = this.#GetConfLocationPath(repoSlug);
		let obj: unknown;

		try {
			const conf_content = fs
				.readFileSync(repository_conf_path, {
					encoding: 'utf-8',
				})
				.toString();

			obj = JSON.parse(conf_content);
		} catch (e) {
			obj = {};
		}

		// TODO: when the .conf files start being encrypted, here we'll decrypt it
		return obj as RepositoryConf;
	}

	#GetConfLocationPath(repoSlug: string) {
		return path.join(
			REPOSITORIES_PATH_IDENTIFIER,
			repoSlug,
			CONFIGURATION_FILE_IDENTIFIER
		);
	}

	#EnsureRepositoryFoldersExists() {
		fs.mkdirSync(
			path.join(
				REPOSITORIES_PATH_IDENTIFIER,
				this.#repository_slug,
				'branches'
			),
			{
				recursive: true,
			}
		);

		fs.mkdirSync(
			path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts'),
			{
				recursive: true,
			}
		);

		fs.mkdirSync(
			path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'logs'),
			{
				recursive: true,
			}
		);
	}
}
