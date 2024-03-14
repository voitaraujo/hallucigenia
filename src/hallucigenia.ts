#!/usr/bin/env node
import {
	Separator,
	checkbox,
	confirm,
	input,
	password,
	select,
} from '@inquirer/prompts';
import chalk from 'chalk';
import clear from 'clear';
import figlet from 'figlet';
import ora from 'ora';

import { HallucigeniaState } from './app-state-class';
import { FetchRepository, FetchRepositoryBranches } from './bitbucket-conn';
import { SPINNER_CONFIGURATION } from './constants';
import { RepositoriesManager } from './repositories-manager-class';
import { menu } from './types';
import { Sleep } from './utils';
import { GetValidatorFunction } from './validators';

const APP_STATE = new HallucigeniaState();
const REPOSITORIES = new RepositoriesManager();

async function main() {
	// just... don't...
	// WatchRepositoryConfFiles(async (_) => {
	// 	REPOSITORIES.SyncRepos();
	//	await view();
	// });

	await view();
}

async function view() {
	clear();

	console.log(figlet.textSync('Hallucigenia'));

	console.log(
		`	found ~> ${chalk.bgGreen(` ${REPOSITORIES.GetRepos().length} repositories `)}\n\n`
	);

	await MENU[APP_STATE.getMenu()]();

	REPOSITORIES.SyncRepos();
	await view();
}

const MENU: {
	[K in menu]: () => void | Promise<void>;
} = {
	home: async () => {
		console.log(chalk.bgCyanBright(' HOME \n'));

		const answer = await select<menu>({
			message: '',
			loop: false,
			choices: [
				{
					name: 'Watcher',
					value: 'watch mode',
					description: 'Watch branches for changes',
				},
				{
					name: 'Repositories',
					value: 'repositories',
					description: 'List & add repositories',
				},
				{
					name: 'Observables',
					value: 'observable repositories',
					description: 'List & select branches from repository to be observed',
				},
				new Separator(),
				{
					name: chalk.red('Quit'),
					value: 'quit',
					description: 'Quit the app & stop monitoring repositories',
				},
			],
		});

		APP_STATE.setMenu(answer, null);
	},
	'watch mode': async () => {
		console.log(chalk.bgCyanBright(' WATCHING BRANCHES \n'));

		const o = ora('watching...(ctrl+c to stop)').start();
		const obsrv = REPOSITORIES.GetRepos().filter(
			(r) => r.conf.remote_connection_status === 'ok'
		);

		// !be cautious with this bc bitbucket has a rate limit on API requests and git operations as well ~> https://support.atlassian.com/bitbucket-cloud/docs/api-request-limits/
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
						repository_access_token: r.conf.repository_access_token,
						repository_name: r.conf.repository_name,
						repository_workspace_name: r.conf.repository_workspace_name,
					})
				)
			).then((remote_branches_info) => {
				for (let idx = 0; idx < obsrv.length; idx++) {
					// eslint-disable-next-line
					const obs = obsrv.at(idx)!;

					// eslint-disable-next-line
					const res = remote_branches_info.at(idx)!;

					if (res.status === 'rejected') return;

					for (const o of obs.conf.observed_branches) {
						const found = res.value.find((b) => b.name === o.branch_name);

						if (found && found.target.hash !== o.hash) {
							reduced_branches_to_clone.push({
								repo_id: obs.conf.repository_id,
								branch_name: o.branch_name,
								branch_hash: found.target.hash,
							});
						}
					}
				}

				resolve(reduced_branches_to_clone);
			});
		});

		o.info(`detected changes on ${branches_to_clone.length} branches\n\n`);

		for (const to_clone of branches_to_clone) {
			const target_repo = REPOSITORIES.GetRepo(to_clone.repo_id);

			const anim = ora(
				`cloning branch "${to_clone.branch_name}" of "${target_repo.conf.repository_name}"`
			).start();

			const success = await REPOSITORIES.CacheBranch(
				to_clone.repo_id,
				to_clone.branch_name
			);

			if (success) {
				REPOSITORIES.UpdateRepository(to_clone.repo_id, {
					observed_branches: [
						...target_repo.conf.observed_branches.filter(
							(b) => b.branch_name !== to_clone.branch_name
						),
						{
							branch_name: to_clone.branch_name,
							hash: to_clone.branch_hash,
						},
					],
				});
				anim.text = `branch "${to_clone.branch_name}" of "${target_repo.conf.repository_name}" cloned successfully`;
				anim.succeed();
			} else {
				anim.text = `failed to clone branch "${to_clone.branch_name}" of "${target_repo.conf.repository_name}"`;
				anim.fail();
			}
		}

		const cd = 1000 * 60 * 1;
		const cd_anm = ora({
			text: chalk.bgBlackBright('\n[ on cooldown ]'),
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
	},
	repositories: async () => {
		console.log(chalk.bgCyanBright(` REPOSITORIES \n`));

		const answer = await select<menu | `id_${string}`>({
			message: '',
			loop: false,
			choices: [
				{
					name: chalk.yellow('< go back'),
					value: 'home',
				},
				{
					name: chalk.green('+ add repo'),
					value: 'add repository',
					description: 'Configure new repository to be monitored',
				},
				{
					name: '! check connections',
					value: 'check repos',
				},
				new Separator(),
				...REPOSITORIES.GetRepos().map((signal) => ({
					name: `${signal.repository_slug} ${signal.conf.remote_connection_status === 'ok' ? chalk.green('(connected)') : chalk.red('(no connection)')}`,
					value: `id_${signal.conf.repository_id}` as const,
				})),
			],
		});

		if (answer.startsWith('id_')) {
			APP_STATE.setMenu('repository options', answer.replace('id_', ''));
		} else {
			APP_STATE.setMenu(answer as menu, null);
		}
	},
	'add repository': async () => {
		console.log(chalk.bgCyanBright(` ADD REPOSITORIES CONNECTION \n`));

		const repository_workspace_name = await input({
			message: `${chalk.blue('workspace')} name or UUID:`,
		});
		const repository_name = await input({
			message: `${chalk.blue('repository')} name or UUID:`,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'repository_name');

				return v(
					{
						repository_workspace_name: repository_workspace_name,
						repository_name: value,
					},
					REPOSITORIES.GetRepos()
				);
			},
		});
		const repository_access_token = await password({
			message: `repository ${chalk.yellow('access token')}:`,
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
		});
		const project_slug = await input({
			message: 'repository alias: ',
			default: repository_name,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'slug');

				return v(value, REPOSITORIES.GetRepos());
			},
		});

		REPOSITORIES.AttachRepository(
			{
				repository_access_token,
				repository_name,
				repository_workspace_name,
			},
			project_slug
		);

		APP_STATE.setMenu('repositories', null);
	},
	'repository options': async () => {
		console.log(
			chalk.bgCyanBright(
				` DETAILS ~> [ ${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).repository_slug} ] \n`
			)
		);

		const repository_answer = await select<menu>({
			message: '',
			loop: false,
			choices: [
				{
					name: chalk.yellow('< go back'),
					value: 'repositories',
				},
				new Separator(),
				{
					name: 'Delete repository',
					value: 'delete repository',
				},
			],
		});

		REPOSITORIES.DettachRepository(APP_STATE.getTargetRepositoryId());
		APP_STATE.setMenu(repository_answer, APP_STATE.getTargetRepositoryId());
	},
	'delete repository': async () => {
		console.log(
			chalk.bgCyanBright(
				` DELETE ~> [ ${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).repository_slug} ] \n`
			)
		);

		const id_delete_answer = await confirm({
			message:
				'Are you sure you want to delete this repository and all files related to it?',
			default: false,
		});

		if (id_delete_answer) {
			REPOSITORIES.DettachRepository(
				REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).repository_slug
			);
			APP_STATE.setMenu('repositories', null);
		} else {
			APP_STATE.setMenu(
				'repository options',
				REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf
					.repository_id
			);
		}
	},
	'observable repositories': async () => {
		console.log(chalk.bgCyanBright(` OBSERVABLE REPOSITORIES \n`));

		const answer = await select<menu | `id_${string}`>({
			message: '',
			loop: false,
			choices: [
				{
					name: chalk.yellow('< go back'),
					value: 'home',
				},
				{
					name: '! update branches',
					value: 'check branches',
				},
				new Separator(),
				...REPOSITORIES.GetRepos().map((signal) => ({
					name: `${signal.repository_slug} (${signal.conf.observed_branches.length}/${signal.conf.branches.length})`,
					value: `id_${signal.conf.repository_id}` as const,
					disabled: signal.conf.remote_connection_status === 'ko',
				})),
			],
		});

		if (answer.startsWith('id_')) {
			APP_STATE.setMenu('observed branches', answer.replace('id_', ''));
		} else {
			APP_STATE.setMenu(answer as menu, null);
		}
	},
	'observed branches': async () => {
		console.log(chalk.bgCyanBright(` OBSERVED BRANCHES \n`));

		const branches_already_selected = REPOSITORIES.GetRepo(
			APP_STATE.getTargetRepositoryId()
		).conf.branches.filter(
			(b) =>
				!!REPOSITORIES.GetRepo(
					APP_STATE.getTargetRepositoryId()
				).conf.observed_branches.find((bb) => bb.branch_name === b.branch_name)
		);

		const branches_not_selected = REPOSITORIES.GetRepo(
			APP_STATE.getTargetRepositoryId()
		).conf.branches.filter(
			(b) =>
				!REPOSITORIES.GetRepo(
					APP_STATE.getTargetRepositoryId()
				).conf.observed_branches.find((bb) => bb.branch_name === b.branch_name)
		);

		const branch_list_answer = await checkbox({
			message: 'select branches to observe',
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

		REPOSITORIES.UpdateRepository(
			REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf
				.repository_id,
			{
				observed_branches: branch_list_answer.map((bn) => ({
					branch_name: bn,
					hash: undefined,
				})),
			}
		);

		REPOSITORIES.UncacheUnobservedBranches();

		APP_STATE.setMenu('observable repositories', null);
	},
	'check repos': async () => {
		console.log(chalk.bgCyanBright(' CHECKING CONNECTION TO REPOSITORIES \n'));

		const sync_animation_host = ora({
			text: `checking ${REPOSITORIES.GetRepos().length} repositories info`,
		}).start();

		for (const signal of REPOSITORIES.GetRepos()) {
			try {
				await FetchRepository({
					repository_access_token: signal.conf.repository_access_token,
					repository_workspace_name: signal.conf.repository_workspace_name,
					repository_name: signal.conf.repository_name,
				});

				REPOSITORIES.UpdateRepository(signal.conf.repository_id, {
					remote_connection_status: 'ok',
				});
			} catch (err) {
				REPOSITORIES.UpdateRepository(signal.conf.repository_id, {
					remote_connection_status: 'ko',
				});
			}
		}

		sync_animation_host.succeed();

		await Sleep(2000);

		APP_STATE.setMenu('repositories', null);
	},
	'check branches': async () => {
		console.log(chalk.bgCyanBright(' UPDATING BRANCHES INFO \n'));

		const sync_animation_branch = ora({
			text: `updating ${REPOSITORIES.GetRepos().length} repositories branches info`,
		}).start();

		for (const signal of REPOSITORIES.GetRepos()) {
			try {
				const branches = await FetchRepositoryBranches({
					repository_access_token: signal.conf.repository_access_token,
					repository_workspace_name: signal.conf.repository_workspace_name,
					repository_name: signal.conf.repository_name,
				});

				REPOSITORIES.UpdateRepository(signal.conf.repository_id, {
					branches: branches.map((b) => ({
						branch_name: b.name,
						hash: b.target.hash,
					})),
				});
			} catch (err) {
				REPOSITORIES.UpdateRepository(signal.conf.repository_id, {
					branches: [],
				});
			}
		}

		sync_animation_branch.succeed();

		await Sleep(2000);

		APP_STATE.setMenu('observable repositories', null);
	},
	quit: () => {
		clear();
		process.exit();
	},
};

main();
