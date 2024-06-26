import {
	Separator,
	checkbox,
	confirm,
	editor,
	input,
	password,
	select,
} from '@inquirer/prompts';
import chalk from 'chalk';
import clear from 'clear';
import ora, { Ora } from 'ora';

import { FetchRepository, FetchRepositoryBranches } from './bitbucket-conn';
import { SPINNER_CONFIGURATION } from './constants';
import { HallucigeniaState } from './hallucigenia-state-class';
import { RepositoriesManager } from './repositories-manager-class';
import { Repository } from './repository-class';
import { menu } from './types';
import { GetPlatformScriptingExtension, Sleep } from './utils';
import { GetValidatorFunction } from './validators';

async function Home(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	console.log(chalk.bgCyanBright(chalk.black(` HOME \n`)));
	const r_qty = REPOSITORIES.GetRepos().length;

	const answer = await select<menu>({
		message: '',
		loop: false,
		pageSize: 10,
		choices: [
			{
				name: 'Watcher',
				value: 'watch mode',
				description: 'watch branches for changes',
			},
			{
				name: `Repositories [${r_qty}]`,
				value: 'repositories',
				description: 'list or add repositories',
			},
			{
				name: chalk.red('Quit'),
				value: 'quit',
				description: 'quit the app',
			},
		],
		theme: {
			prefix: '&',
		},
	});

	APP_STATE.SetMenu(answer, null);
}

async function WatchMode(REPOSITORIES: RepositoriesManager) {
	console.log(chalk.bgCyanBright(chalk.black(` WATCHING BRANCHES \n`)));

	const info_anm = ora(
		'watching branches for changes...(ctrl+c to stop)'
	).start();

	const obsrv = REPOSITORIES.GetRepos().filter(
		(r) => r.GetRepositoryConf().remote_connection_status === 'ok'
	);

	// be cautious with this bc bitbucket has a rate limit on API requests and git operations as well ~> https://support.atlassian.com/bitbucket-cloud/docs/api-request-limits/
	const branches_to_clone = await new Promise<
		{ repo_id: string; branch_name: string; branch_hash: string }[]
	>((resolve) => {
		const reduced_branches_to_clone: {
			repo_id: string;
			branch_name: string;
			branch_hash: string;
		}[] = [];

		Promise.allSettled(
			obsrv.map((r) =>
				FetchRepositoryBranches({
					repository_access_token:
						r.GetRepositoryConf().repository_access_token,
					repository_name: r.GetRepositoryConf().repository_name,
					repository_workspace_name:
						r.GetRepositoryConf().repository_workspace_name,
				})
			)
		).then((remote_branches_info) => {
			for (let idx = 0; idx < obsrv.length; idx++) {
				const obs = obsrv.at(idx)!;

				const res = remote_branches_info.at(idx)!;

				if (res.status === 'rejected') {
					obs.UpdateRepositoryConf({
						branches: [],
						observed_branches: [],
						remote_connection_status: 'ko',
					});

					continue;
				}

				for (const o of obs.GetRepositoryConf().observed_branches) {
					const found = res.value.find((b) => b.name === o.branch_name);

					if (found && found.target.hash !== o.hash) {
						reduced_branches_to_clone.push({
							repo_id: obs.GetRepositoryConf().repository_id,
							branch_name: o.branch_name,
							branch_hash: found.target.hash,
						});
					}
				}
			}

			resolve(reduced_branches_to_clone);
		});
	});

	info_anm.info(`detected changes on ${branches_to_clone.length} branches\n\n`);

	for (const to_clone of branches_to_clone) {
		const target_repo = REPOSITORIES.GetRepo(to_clone.repo_id);

		const clone_anm = ora(
			`cloning branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}"`
		).start();

		const success = await target_repo.CacheBranch(to_clone.branch_name);

		if (success) {
			target_repo.UpdateRepositoryConf({
				observed_branches: [
					...target_repo
						.GetRepositoryConf()
						.observed_branches.filter(
							(b) => b.branch_name !== to_clone.branch_name
						),
					{
						branch_name: to_clone.branch_name,
						hash: to_clone.branch_hash,
					},
				],
			});
			clone_anm.succeed(
				`branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}" cloned successfully`
			);

			const script_list = target_repo.GetRepositoryScriptList();
			const branch_script = script_list.find((s) => s === to_clone.branch_name);
			const repository_script = script_list.find(
				(s) => s === target_repo.GetRepositoryConf().repository_name
			);

			let run_anm: Ora | undefined;
			let run_result: boolean | undefined;

			switch (true) {
				case typeof branch_script !== 'undefined':
					run_anm = ora('running branch update script...').start();
					run_result = target_repo.RunRepositoryScript(
						branch_script,
						to_clone.branch_name
					);
					break;
				case typeof repository_script !== 'undefined':
					run_anm = ora('running repository update script...').start();
					run_result = target_repo.RunRepositoryScript(
						repository_script,
						to_clone.branch_name
					);
					break;
				default:
					break;
			}

			if (run_anm && run_result) {
				run_result
					? run_anm.succeed('script invoked successfully')
					: run_anm.fail('failed to invoke script');
			}
		} else {
			clone_anm.fail(
				`failed to clone branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}"`
			);
		}
	}

	const cd = 1000 * 60 * 1;
	const cd_anm = ora({
		text: chalk.bgBlackBright('\n[ 1m cool down ]'),
		spinner: {
			interval: cd / 7.2,
			frames: [
				'▱▱▱▱▱▱▱',
				'▰▱▱▱▱▱▱',
				'▰▰▱▱▱▱▱',
				'▰▰▰▱▱▱▱',
				'▰▰▰▰▱▱▱',
				'▰▰▰▰▰▱▱',
				'▰▰▰▰▰▰▱',
				'▰▰▰▰▰▰▰',
			],
		},
	}).start();

	await Sleep(cd);
	cd_anm.stop();
}

async function Repositories(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	console.log(chalk.bgCyanBright(chalk.black(` REPOSITORIES \n`)));
	const repos = REPOSITORIES.GetRepos();

	const answer = await select<menu | `id_${string}`>({
		message: '',
		loop: false,
		pageSize: 10,
		choices: [
			{
				name: chalk.yellow('< go back'),
				value: 'home',
				description: 'go back to home',
			},
			{
				name: chalk.green('+ add repo'),
				value: 'add repository',
				description: 'setup new repository to be monitored',
			},
			{
				name: '! check connections',
				value: 'check repositories connection',
				disabled: repos.length === 0,
				description:
					'check if all local repositories still have access to Bitbucket',
			},
			new Separator('───────────────────────────────────────────────────────'),
			...repos.map((repo) => {
				const conf = repo.GetRepositoryConf();

				return {
					name: `${repo.GetRepositorySlug()} ${conf.remote_connection_status === 'ok' ? chalk.green('(connected)') : chalk.red('(no connection)')}`,
					value: `id_${conf.repository_id}` as const,
				};
			}),
		],
	});

	if (answer.startsWith('id_')) {
		APP_STATE.SetMenu('repository:options', answer.replace('id_', ''));
	} else {
		APP_STATE.SetMenu(answer as menu, null);
	}
}

async function AddRepository(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	console.log(
		chalk.bgCyanBright(chalk.black(` ADD REMOTE REPOSITORY CONNECTION \n`))
	);

	console.log(chalk.yellow('(leave any required* field empty to cancel)\n'));

	try {
		const repository_workspace_name = await input({
			message: `${chalk.blue('workspace')} name or UUID(*):`,
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('canceled by the user');
			}

			return value;
		});

		const repository_name = await input({
			message: `${chalk.blue('repository')} name or UUID(*):`,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'repository_name');

				return v(
					{
						repository_workspace_name: repository_workspace_name,
						repository_name: value,
					},
					REPOSITORIES.GetRepos().map((repo) => repo.GetRepositoryConf())
				);
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('canceled by the user');
			}

			return value;
		});

		const repository_access_token = await password({
			message: `repository ${chalk.yellow('access token')}(*):`,
			mask: '*',
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'access_token');

				return v({
					repository_access_token: value,
					repository_workspace_name: repository_workspace_name,
					repository_name: repository_name,
				});
			},
			theme: {
				spinner: SPINNER_CONFIGURATION,
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('canceled by the user');
			}

			return value;
		});

		const repository_slug = await input({
			message: 'repository alias: ',
			default: repository_name,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'slug');

				return v(
					value,
					REPOSITORIES.GetRepos().map((repo) => repo.GetRepositorySlug())
				);
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('canceled by the user');
			}

			return value;
		});

		const created_repository_id = Repository.AttachRepository(repository_slug, {
			repository_access_token,
			repository_name,
			repository_workspace_name,
		});

		APP_STATE.SetMenu('repository:sync branches', created_repository_id);
	} catch (err: unknown) {
		APP_STATE.SetMenu('repositories', null);
	}
}

async function RepositoryOptions(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());
	const target_conf = target_repo.GetRepositoryConf();

	console.log(
		chalk.bgCyanBright(
			chalk.black(` DETAILS ~> [ ${target_repo.GetRepositorySlug()} ] \n`)
		)
	);

	const repository_answer = await select<menu>({
		message: '',
		loop: false,
		pageSize: 10,
		choices: [
			{
				name: chalk.yellow('< go back'),
				value: 'repositories',
				description: 'go back to repositories list',
			},
			{
				name: '! sync branch list',
				value: 'repository:sync branches',
				description: 'sync the local branch list with the remote',
				disabled: target_conf.remote_connection_status === 'ko',
			},
			new Separator('───────────────────────────────────────────────────────'),
			{
				name: `Observable branches [${target_conf.observed_branches.length}/${target_conf.branches.length}]`,
				value: 'repository:branches',
				description: 'list & select branches from to be observed',
				disabled: target_conf.branches.length === 0,
			},

			{
				name: `Side Effects [${target_conf.observed_branches.filter((ob) => target_repo.GetRepositoryScriptList().includes(ob.branch_name)).length}/${target_repo.GetRepositoryConf().observed_branches.length}]`,
				value: 'repository:side effects',
				description: 'setup instructions to run when branches get updated',
			},
			{
				name: 'Update connection',
				value: 'repository:edit connection',
				description: 'update repository remote connection details',
			},
			{
				name: 'Change repository alias',
				value: 'repository:edit alias',
				description: 'update the alias for this repository',
			},
			{
				name: 'Delete repository',
				value: 'repository:delete',
				description:
					'remove the local configuration and files related to this repository',
			},
		],
	});

	APP_STATE.SetMenu(repository_answer, APP_STATE.GetTargetRepositoryId());
}

async function DeleteRepository(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());

	console.log(
		chalk.bgCyanBright(
			chalk.black(` DELETE ~> [ ${target_repo.GetRepositorySlug()} ] \n`)
		)
	);

	const id_delete_answer = await confirm({
		message:
			'Are you sure you want to delete this repository and all files related to it?',
		default: false,
	});

	if (id_delete_answer) {
		target_repo.DetachRepository();
		APP_STATE.SetMenu('repositories', null);
		return;
	}

	APP_STATE.SetMenu('repository:options', APP_STATE.GetTargetRepositoryId());
}

async function RepositoryBranches(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());
	const {
		branches: target_repo_branches,
		observed_branches: target_repo_observed_branches,
	} = target_repo.GetRepositoryConf();

	console.log(
		chalk.bgCyanBright(
			chalk.black(
				` OBSERVABLE BRANCHES ~> [ ${target_repo.GetRepositorySlug()} ] \n`
			)
		)
	);

	const branches_already_selected = target_repo_branches.filter(
		(b) =>
			!!target_repo_observed_branches.find(
				(bb) => bb.branch_name === b.branch_name
			)
	);

	const branches_not_selected = target_repo_branches.filter(
		(b) =>
			!target_repo_observed_branches.find(
				(bb) => bb.branch_name === b.branch_name
			)
	);

	const branch_list_answer = await checkbox({
		message: 'select branches to observe',
		pageSize: 10,
		choices: [
			...branches_already_selected.map((b) => ({
				name: b.branch_name,
				value: b.branch_name,
				checked: true,
			})),
			...branches_not_selected.map((b) => ({
				name: b.branch_name,
				value: b.branch_name,
				checked: false,
			})),
		],
		loop: false,
	});

	target_repo.UpdateRepositoryConf({
		observed_branches: branch_list_answer.map((bn) => ({
			branch_name: bn,
			hash: undefined,
		})),
	});

	REPOSITORIES.FreeUnobservedBranchesData();

	APP_STATE.SetMenu('repository:options', APP_STATE.GetTargetRepositoryId());
}

async function CheckRepositoriesConnection(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	console.log(
		chalk.bgCyanBright(
			chalk.black(` CHECKING CONNECTION TO REMOTE REPOSITORIES \n`)
		)
	);

	const sync_animation_host = ora({
		text: `checking connection to ${REPOSITORIES.GetRepos().length} repositories`,
	}).start();

	for (const repository of REPOSITORIES.GetRepos()) {
		const conf = repository.GetRepositoryConf();

		try {
			await FetchRepository({
				repository_access_token: conf.repository_access_token,
				repository_workspace_name: conf.repository_workspace_name,
				repository_name: conf.repository_name,
			});

			repository.UpdateRepositoryConf({
				remote_connection_status: 'ok',
			});
		} catch (err) {
			repository.UpdateRepositoryConf({
				branches: [],
				observed_branches: [],
				remote_connection_status: 'ko',
			});
		}
	}

	sync_animation_host.succeed();

	await Sleep(2000);

	APP_STATE.SetMenu('repositories', null);
}

async function SyncRepositoryBranches(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());
	const target_repo_conf = target_repo.GetRepositoryConf();

	console.log(
		chalk.bgCyanBright(
			chalk.black(
				` UPDATING BRANCH LIST ~> [ ${target_repo.GetRepositorySlug()} ] \n`
			)
		)
	);

	const sync_animation_branch = ora({
		text: `updating local branch list from remote "${target_repo_conf.repository_name}"`,
	}).start();

	try {
		const branches = await FetchRepositoryBranches({
			repository_access_token: target_repo_conf.repository_access_token,
			repository_workspace_name: target_repo_conf.repository_workspace_name,
			repository_name: target_repo_conf.repository_name,
		});

		target_repo.UpdateRepositoryConf({
			branches: branches.map((b) => ({
				branch_name: b.name,
				hash: b.target.hash,
			})),
		});
	} catch (err) {
		target_repo.UpdateRepositoryConf({
			branches: [],
			observed_branches: [],
			remote_connection_status: 'ko',
		});
	}

	sync_animation_branch.succeed();

	await Sleep(2000);

	APP_STATE.SetMenu('repository:options', APP_STATE.GetTargetRepositoryId());
}

async function RepositorySideEffects(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());
	const target_repo_conf = target_repo.GetRepositoryConf();
	const target_repo_script_list = target_repo.GetRepositoryScriptList();

	console.log(
		chalk.bgCyanBright(
			chalk.black(` SIDE EFFECTS ~> [ ${target_repo.GetRepositorySlug()} ] \n`)
		)
	);

	const answer = await select<menu | 'default script' | `branch_${string}`>({
		message: '',
		pageSize: 10,
		loop: false,
		choices: [
			{
				name: chalk.yellow('< go back'),
				value: 'repository:options',
				description: 'go back to repository options',
			},
			{
				name: `default script [${target_repo_script_list.includes(target_repo_conf.repository_name) ? chalk.green('set') : chalk.red('not set')}]`,
				value: 'default script',
				description:
					"script to run when updated branches that don't have an specific one",
			},
			new Separator('───────────────────────────────────────────────────────'),
			...target_repo_conf.observed_branches.map((branch) => ({
				name: `branch "${branch.branch_name}" script [${target_repo_script_list.includes(branch.branch_name) ? chalk.green('set') : chalk.red('not set')}]`,
				value: `branch_${branch.branch_name}` as const,
			})),
		],
	});

	if (answer.startsWith('branch_') || answer === 'default script') {
		const b_name = answer
			.replace('branch_', '')
			.replace('default script', target_repo_conf.repository_name);
		const saved_script_content = target_repo.GetRepositoryScriptContent(b_name);

		const script = await editor({
			message: `
1- The script will be saved and run according to the CURRENT system executing the CLI(windows = .bat|cmd; MacOS/Linux = .sh|bash).
2- After writing the script, just save and close the file on your editor(it's a tmp file that will be read and deleted).
3- During the script execution an environment variable called "UPDATED_BRANCH_PATH" will be available to easily access the branch source path.
4- To "delete" the script just leave the editor blank, save and quit.
5- The script will be run from the CLI data folder that it's stored, if your script interacts with another paths make sure to "cd" to them and/or use absolute paths.
`,
			waitForUseInput: true,
			postfix: GetPlatformScriptingExtension(),
			default: saved_script_content || '',
		});

		switch (true) {
			case script.trim().length === 0 &&
				typeof saved_script_content === 'string':
				// delete existing script
				target_repo.DeleteRepositoryScript(b_name);
				break;
			case script.trim().length !== 0 &&
				typeof saved_script_content === 'string':
				// update existing script
				target_repo.UpdateRepositoryScript(b_name, script);
				break;
			case script.trim().length !== 0 &&
				typeof saved_script_content === 'undefined':
				// create new script
				target_repo.CreateRepositoryScript(b_name, script);
				break;
			default:
				break;
		}
		return;
	}

	APP_STATE.SetMenu(answer as menu, APP_STATE.GetTargetRepositoryId());
	return;
}

async function EditRepositoryConnection(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());
	const target_conf = target_repo.GetRepositoryConf();

	console.log(
		chalk.bgCyanBright(chalk.black(` UPDATE REMOTE REPOSITORY CONNECTION \n`))
	);

	console.log(chalk.yellow('(leave any required* field empty to cancel)\n'));

	try {
		const repository_workspace_name = await input({
			message: `${chalk.blue('workspace')} name or UUID(*):`,
			default: target_conf.repository_workspace_name,
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('update canceled by user');
			}

			return value;
		});

		const repository_name = await input({
			message: `${chalk.blue('repository')} name or UUID(*):`,
			default: target_conf.repository_name,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'repository_name');

				return v(
					{
						repository_workspace_name: repository_workspace_name,
						repository_name: value,
					},
					REPOSITORIES.GetRepos()
						.filter(
							(repo) => repo.GetRepositoryId() !== target_conf.repository_id
						)
						.map((repo) => repo.GetRepositoryConf())
				);
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('update canceled by user');
			}

			return value;
		});

		const repository_access_token = await password({
			message: `repository ${chalk.yellow('access token')}(*):`,
			mask: '*',
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'access_token');

				return v({
					repository_access_token: value,
					repository_workspace_name: repository_workspace_name,
					repository_name: repository_name,
				});
			},
			theme: {
				spinner: SPINNER_CONFIGURATION,
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('update canceled by user');
			}

			return value;
		});

		target_repo.UpdateRepositoryConf({
			repository_access_token,
			repository_name,
			repository_workspace_name,
		});

		APP_STATE.SetMenu(
			'repository:sync branches',
			APP_STATE.GetTargetRepositoryId()
		);
	} catch (err: unknown) {
		APP_STATE.SetMenu('repository:options', APP_STATE.GetTargetRepositoryId());
	}
}

async function EditRepositoryAlias(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	const target_repo = REPOSITORIES.GetRepo(APP_STATE.GetTargetRepositoryId());

	console.log(
		chalk.bgCyanBright(chalk.black(` UPDATE REMOTE REPOSITORY CONNECTION \n`))
	);

	console.log(chalk.yellow('(leave the field empty to cancel)\n'));

	try {
		const repository_slug = await input({
			message: 'repository alias: ',
			default: target_repo.GetRepositorySlug(),
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'slug');

				return v(
					value,
					REPOSITORIES.GetRepos()
						.filter(
							(repo) => repo.GetRepositoryId() !== target_repo.GetRepositoryId()
						)
						.map((repo) => repo.GetRepositorySlug())
				);
			},
		}).then((value) => {
			if (value.trim() === '') {
				throw new Error('canceled by the user');
			}

			return value;
		});

		target_repo.UpdateRepositorySlug(repository_slug);
	} finally {
		APP_STATE.SetMenu('repository:options', APP_STATE.GetTargetRepositoryId());
	}
}

function RenderMenu(
	APP_STATE: HallucigeniaState,
	REPOSITORIES: RepositoriesManager
) {
	switch (APP_STATE.GetMenu()) {
		case 'home':
			return Home(APP_STATE, REPOSITORIES);
		case 'watch mode':
			return WatchMode(REPOSITORIES);
		case 'repositories':
			return Repositories(APP_STATE, REPOSITORIES);
		case 'add repository':
			return AddRepository(APP_STATE, REPOSITORIES);
		case 'check repositories connection':
			return CheckRepositoriesConnection(APP_STATE, REPOSITORIES);
		case 'repository:options':
			return RepositoryOptions(APP_STATE, REPOSITORIES);
		case 'repository:branches':
			return RepositoryBranches(APP_STATE, REPOSITORIES);
		case 'repository:side effects':
			return RepositorySideEffects(APP_STATE, REPOSITORIES);
		case 'repository:delete':
			return DeleteRepository(APP_STATE, REPOSITORIES);
		case 'repository:sync branches':
			return SyncRepositoryBranches(APP_STATE, REPOSITORIES);
		case 'repository:edit connection':
			return EditRepositoryConnection(APP_STATE, REPOSITORIES);
		case 'repository:edit alias':
			return EditRepositoryAlias(APP_STATE, REPOSITORIES);
		case 'quit':
		default:
			clear();
			process.exit();
	}
}

export { RenderMenu };
