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
import { randomUUID } from 'crypto';
import figlet from 'figlet';
import ora from 'ora';

import { HallucigeniaState } from './app-state';
import { FetchRepository, FetchRepositoryBranches } from './bitbucket-conn';
import { WatchRepositoryConfFiles } from './conf-watcher';
// import { SPINNER_CONFIGURATION } from './constants';
import { HallucigeniaStateSchema } from './schemas';
import {
	AttachNewRepository,
	CloneBranch,
	DettachRepository,
	PulseRepositories,
	RemoveUnobservedBranches,
	Sleep,
	UpdateRepositoryConf,
} from './utils';
import { GetValidatorFunction } from './validators';

const APP_STATE = new HallucigeniaState('home', [], null);

async function main() {
	// TODO: look for the root .conf file(for decrypting repo .conf's)
	// TODO: if root .conf does not exists, ask for a password and create one

	APP_STATE.setRepositoryPulseSignals(PulseRepositories());

	WatchRepositoryConfFiles(async (_) => {
		APP_STATE.setRepositoryPulseSignals(PulseRepositories());
		await view();
	});

	await view();
}

async function view() {
	clear();

	console.log(figlet.textSync('Hallucigenia'));

	console.log(`
	found ~> ${chalk.bgGreen(` ${APP_STATE.getRepositoryPulseSignals().length} repositories `)}


	`);

	await MENU_OPERATIONS[APP_STATE.getMenu()]();

	view();
}

const MENU_OPERATIONS: {
	[K in HallucigeniaStateSchema['menu']]: () => void | Promise<void>;
} = {
	'add repository': async () => {
		console.log(chalk.bgCyanBright(` ADD REPOSITORY CONNECTION \n`));

		const repository_id = randomUUID();
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
					APP_STATE.getRepositoryPulseSignals()
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
			// theme: {
			// 	spinner: SPINNER_CONFIGURATION,
			// },
		});
		const project_slug = await input({
			message: 'repository alias: ',
			default: repository_name,
			validate: (value) => {
				const v = GetValidatorFunction('bitbucket', 'slug');

				return v(value, APP_STATE.getRepositoryPulseSignals());
			},
		});

		await AttachNewRepository(
			{
				repository_id,
				repository_access_token,
				repository_name,
				repository_workspace_name,
			},
			project_slug
		);

		APP_STATE.setMenu('repositories', null);
	},
	'observable repositories': async () => {
		console.log(chalk.bgCyanBright(` OBSERVABLE REPOSITORIES \n`));

		const answer = await select<
			HallucigeniaStateSchema['menu'] | `id_${string}`
		>({
			message: '',
			loop: false,
			choices: [
				{
					name: chalk.yellow('< go back'),
					value: 'home',
				},
				new Separator(),
				...APP_STATE.getRepositoryPulseSignals().map((signal) => ({
					name: `${signal.repository_slug} (${signal.conf.observed_branches.length}/${signal.conf.branches.length})`,
					value: `id_${signal.conf.repository_id}` as const,
					disabled: signal.conf.remote_connection_status === 'ko',
				})),
			],
		});

		if (answer.startsWith('id_')) {
			APP_STATE.setMenu('observed branches', answer.replace('id_', ''));
		} else {
			APP_STATE.setMenu(answer as HallucigeniaStateSchema['menu'], null);
		}
	},
	'observed branches': async () => {
		console.log(chalk.bgCyanBright(` OBSERVED BRANCHES \n`));
		const branches_already_selected =
			APP_STATE.getTargetRepository().conf.branches.filter(
				(b) =>
					!!APP_STATE.getTargetRepository().conf.observed_branches.find(
						(bb) => bb.branch_name === b.branch_name
					)
			);
		const branches_not_selected =
			APP_STATE.getTargetRepository().conf.branches.filter(
				(b) =>
					!APP_STATE.getTargetRepository().conf.observed_branches.find(
						(bb) => bb.branch_name === b.branch_name
					)
			);

		const branch_list_answer = await checkbox({
			message: 'select branches to observe',
			choices: [
				...branches_already_selected.map((b) => ({
					name: b.branch_name,
					value: b,
					checked: true,
				})),
				...branches_not_selected.map((b) => ({
					name: b.branch_name,
					value: b,
					checked: false,
				})),
			],
			loop: false,
		});

		UpdateRepositoryConf(APP_STATE.getTargetRepository(), {
			observed_branches: branch_list_answer,
		});

		RemoveUnobservedBranches(
			APP_STATE.getTargetRepository().repository_slug,
			branch_list_answer.map((b) => b.branch_name)
		);

		for (const branch of branch_list_answer) {
			// TODO: don't block each clone, run them in parallel, to do so we'll have to use something other then ora(it doesn't support multiple spinners)

			const anim = ora(
				`cloning branch "${branch.branch_name}" of "${APP_STATE.getTargetRepository().conf.repository_name}"`
			).start();

			const success = await CloneBranch({
				repository_slug: APP_STATE.getTargetRepository().repository_slug,
				repository_access_token:
					APP_STATE.getTargetRepository().conf.repository_access_token,
				branch_name: branch.branch_name,
				repository_name: APP_STATE.getTargetRepository().conf.repository_name,
				repository_workspace_name:
					APP_STATE.getTargetRepository().conf.repository_workspace_name,
			});

			if (success) {
				anim.text = `branch "${branch.branch_name}" of "${APP_STATE.getTargetRepository().conf.repository_name}" cloned successfully`;
				anim.succeed();
			} else {
				anim.text = `failed to clone branch "${branch.branch_name}" of "${APP_STATE.getTargetRepository().conf.repository_name}"`;
				anim.fail();
			}
		}

		await Sleep(branch_list_answer.length > 0 ? 1000 : 0);

		APP_STATE.setMenu('observable repositories', null);
	},
	'delete repository': async () => {
		console.log(
			chalk.bgCyanBright(
				` DELETE ~> [ ${APP_STATE.getTargetRepository().repository_slug} ] \n`
			)
		);

		const id_delete_answer = await confirm({
			message:
				'Are you sure you want to delete this repository and all files related to it?',
			default: false,
		});

		if (id_delete_answer) {
			DettachRepository(APP_STATE.getTargetRepository().repository_slug);
			APP_STATE.removeSignalFromPulseList(
				APP_STATE.getTargetRepository().repository_slug
			);
			APP_STATE.setMenu('repositories', null);
		} else {
			APP_STATE.setMenu(
				'repository options',
				APP_STATE.getTargetRepository().conf.repository_id
			);
		}
	},
	'repository options': async () => {
		console.log(
			chalk.bgCyanBright(
				` DETAILS ~> [ ${APP_STATE.getTargetRepository().repository_slug} ] \n`
			)
		);

		const repository_answer = await select<HallucigeniaStateSchema['menu']>({
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

		APP_STATE.setMenu(repository_answer, APP_STATE.getTargetRepositoryId());
	},
	repositories: async () => {
		console.log(chalk.bgCyanBright(` REPOSITORIES \n`));

		const answer = await select<
			HallucigeniaStateSchema['menu'] | `id_${string}`
		>({
			message: '',
			loop: false,
			choices: [
				{
					name: chalk.yellow('< go back'),
					value: 'home',
				},
				{
					name: chalk.green('+ Add repo'),
					value: 'add repository',
					description: 'Configure new repository to be monitored',
				},
				new Separator(),
				...APP_STATE.getRepositoryPulseSignals().map((signal) => ({
					name: `${signal.repository_slug} ${signal.conf.remote_connection_status === 'ok' ? chalk.green('(connected)') : chalk.red('(no connection)')}`,
					value: `id_${signal.conf.repository_id}` as const,
				})),
			],
		});

		if (answer.startsWith('id_')) {
			APP_STATE.setMenu('repository options', answer.replace('id_', ''));
		} else {
			APP_STATE.setMenu(answer as HallucigeniaStateSchema['menu'], null);
		}
	},
	home: async () => {
		console.log(chalk.bgCyanBright(' HOME \n'));

		const answer = await select<HallucigeniaStateSchema['menu']>({
			message: '',
			loop: false,
			choices: [
				{
					name: 'Sync all',
					value: 'sync repositories',
					description: 'Check access & update info on repos & branches',
				},
				{
					name: 'Watcher mode',
					value: 'watch mode',
					description: 'List & add repositories',
				},
				{
					name: 'List repositories',
					value: 'repositories',
					description: 'List & add repositories',
				},
				{
					name: 'List observed branches',
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
	'sync repositories': async () => {
		console.log(chalk.bgCyanBright(' SYNC \n'));

		const sync_animation_host = ora({
			text: `sync ${APP_STATE.getRepositoryPulseSignals().length} repositories info`,
			// spinner: SPINNER_CONFIGURATION,
		}).start();

		for (const signal of APP_STATE.getRepositoryPulseSignals()) {
			try {
				await FetchRepository({
					repository_access_token: signal.conf.repository_access_token,
					repository_workspace_name: signal.conf.repository_workspace_name,
					repository_name: signal.conf.repository_name,
				});

				UpdateRepositoryConf(signal, {
					remote_connection_status: 'ok',
				});
			} catch (err) {
				UpdateRepositoryConf(signal, {
					remote_connection_status: 'ko',
				});
			}
		}

		sync_animation_host.succeed();

		const sync_animation_branch = ora({
			text: `sync ${APP_STATE.getRepositoryPulseSignals().length} repositories branches`,
			// spinner: SPINNER_CONFIGURATION,
		}).start();

		for (const signal of APP_STATE.getRepositoryPulseSignals()) {
			try {
				const branches = await FetchRepositoryBranches({
					repository_access_token: signal.conf.repository_access_token,
					repository_workspace_name: signal.conf.repository_workspace_name,
					repository_name: signal.conf.repository_name,
				});

				UpdateRepositoryConf(signal, {
					branches: branches.map((b) => ({
						branch_name: b.name,
						last_commit_hash: b.target.hash,
					})),
				});
			} catch (err) {
				UpdateRepositoryConf(signal, {
					branches: [],
				});
			}
		}

		sync_animation_branch.succeed();

		await Sleep(1000);

		APP_STATE.setMenu('home', null);
	},
	quit: () => {
		clear();
		process.exit();
	},
	'watch mode': async () => {
		console.log(chalk.bgCyanBright(' MONITORING BRANCHES \n'));
	},
};

main();
