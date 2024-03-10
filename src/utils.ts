import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

import { FetchRepositoryBranches } from './bitbucket-conn';
import {
	CONFIGURATION_FILE_IDENTIFIER,
	REPOSITORIES_PATH_IDENTIFIER,
} from './constants';
import { RepositoryConfSchema, RepositoryPulseSignalSchema } from './schemas';

function PulseRepositories() {
	const signals: RepositoryPulseSignalSchema[] = [];

	if (!fs.existsSync(REPOSITORIES_PATH_IDENTIFIER)) {
		fs.mkdirSync(REPOSITORIES_PATH_IDENTIFIER, {
			recursive: true,
		});

		return signals;
	}

	const repos_slug = fs.readdirSync(REPOSITORIES_PATH_IDENTIFIER, {
		withFileTypes: true,
	});

	repos_slug.forEach((repo) => {
		if (repo.isFile()) return;

		const safe_conf_content = GetConfAsSafeObject(repo.name);

		if (safe_conf_content.success) {
			signals.push({
				repository_slug: repo.name,
				conf: safe_conf_content.data,
			});
		}
	});

	return signals;
}

async function AttachNewRepository(
	newRepoConfParts: Pick<
		RepositoryConfSchema,
		| 'repository_id'
		| 'repository_workspace_name'
		| 'repository_name'
		| 'repository_access_token'
	>,
	newRepoSlug: string
) {
	const branches_info = await FetchRepositoryBranches({
		repository_access_token: newRepoConfParts.repository_access_token,
		repository_workspace_name: newRepoConfParts.repository_workspace_name,
		repository_name: newRepoConfParts.repository_name,
	});

	const safe_conf_content = RepositoryConfSchema.safeParse({
		...newRepoConfParts,
		observed_branches: [],
		branches: branches_info.map((b) => ({
			branch_name: b.name,
			last_commit_hash: b.target.hash,
		})),
		remote_connection_status: 'ok',
	} satisfies RepositoryConfSchema);

	if (safe_conf_content.success) {
		fs.mkdirSync(`${REPOSITORIES_PATH_IDENTIFIER}/${newRepoSlug}/branches`, {
			recursive: true,
		});

		fs.mkdirSync(`${REPOSITORIES_PATH_IDENTIFIER}/${newRepoSlug}/tmp`, {
			recursive: true,
		});

		fs.mkdirSync(`${REPOSITORIES_PATH_IDENTIFIER}/${newRepoSlug}/logs`, {
			recursive: true,
		});

		fs.writeFileSync(
			`${REPOSITORIES_PATH_IDENTIFIER}/${newRepoSlug}/${CONFIGURATION_FILE_IDENTIFIER}`,
			JSON.stringify(safe_conf_content.data),
			{
				encoding: 'utf-8',
			}
		);

		return;
	}

	throw new Error('Invalid repository .conf');
}

function DettachRepository(repoSlug: string) {
	fs.rmSync(`${REPOSITORIES_PATH_IDENTIFIER}/${repoSlug}`, {
		recursive: true,
		force: true,
	});
}

function GetConfLocationPath(repoSlug: string) {
	return path.join(
		REPOSITORIES_PATH_IDENTIFIER,
		repoSlug,
		CONFIGURATION_FILE_IDENTIFIER
	);
}

function UpdateRepositoryConf(
	repositoryPulseSignal: RepositoryPulseSignalSchema,
	updatedRepositoryConf: Partial<Omit<RepositoryConfSchema, 'repository_id'>>
) {
	const safe_conf_content = GetConfAsSafeObject(
		repositoryPulseSignal.repository_slug
	);

	if (!safe_conf_content.success)
		throw new Error("can't find .conf file to update");
	if (
		repositoryPulseSignal.conf.repository_id !==
		safe_conf_content.data.repository_id
	)
		throw new Error(".conf id's from memory and disk don't match");

	fs.writeFileSync(
		GetConfLocationPath(repositoryPulseSignal.repository_slug),
		JSON.stringify({
			...repositoryPulseSignal.conf,
			...updatedRepositoryConf,
		})
	);
}

function GetConfAsSafeObject(repoSlug: string) {
	const repository_conf_path = GetConfLocationPath(repoSlug);
	let obj;

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

	return RepositoryConfSchema.safeParse(obj);
}

async function CloneBranch({
	repository_slug,
	branch_name,
	repository_access_token,
	repository_name,
	repository_workspace_name,
}: Pick<RepositoryPulseSignalSchema, 'repository_slug'> &
	Pick<
		RepositoryPulseSignalSchema['conf'],
		'repository_access_token' | 'repository_name' | 'repository_workspace_name'
	> & { branch_name: string }) {
	const target_branch_folder = path.join(
		REPOSITORIES_PATH_IDENTIFIER,
		repository_slug,
		'branches',
		branch_name
	);

	// clear folder if it already exists
	fs.rmSync(target_branch_folder, {
		recursive: true,
		force: true,
	});

	const clone_command = `git clone -b "${branch_name}" "https://x-token-auth:${repository_access_token}@bitbucket.org/${repository_workspace_name}/${repository_name}.git" "${target_branch_folder}"`;
	const command = exec(clone_command);

	const clone_success = await new Promise((resolve) => {
		command.on('exit', (code, _) => {
			if (code !== 0) {
				resolve(false);
			} else {
				resolve(true);
			}
		});
	});

	// clear folder if the clone wasn't successful
	if (!clone_success) {
		fs.rmSync(target_branch_folder, {
			recursive: true,
			force: true,
		});
	}

	return clone_success;
}

function RemoveUnobservedBranches(
	repoSlug: string,
	observedBranches: string[]
) {
	const repos_slug = fs.readdirSync(
		path.join(REPOSITORIES_PATH_IDENTIFIER, repoSlug, 'branches'),
		{
			withFileTypes: true,
		}
	);

	for (const stored_branch of repos_slug) {
		if (stored_branch.isFile()) return; // skip any file stored of folder

		if (!observedBranches.includes(stored_branch.name)) {
			fs.rmSync(
				path.join(
					REPOSITORIES_PATH_IDENTIFIER,
					repoSlug,
					'branches',
					stored_branch.name
				),
				{
					recursive: true,
					force: true,
				}
			);
		}
	}
}

function Sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

export {
	AttachNewRepository,
	CloneBranch,
	DettachRepository,
	GetConfLocationPath,
	PulseRepositories,
	RemoveUnobservedBranches,
	Sleep,
	UpdateRepositoryConf,
};
