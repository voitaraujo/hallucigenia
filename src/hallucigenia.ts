#!/usr/bin/env node
import chalk from 'chalk';
import clear from 'clear';
import figlet from 'figlet';
import latestVersion from 'latest-version';

import packageJson from '../package.json';
import { HallucigeniaState } from './hallucigenia-state-class';
import { RenderMenu } from './menus';
import { RepositoriesManager } from './repositories-manager-class';

const APP_STATE = new HallucigeniaState();
const REPOSITORIES = new RepositoriesManager();

async function main() {
	REPOSITORIES.SyncRepos();

	const pkg_latest_version = await latestVersion(packageJson.name).catch(
		(_) => packageJson.version
	);

	const pkg_running_version = packageJson.version;
	await view(pkg_latest_version, pkg_running_version);
}

async function view(npmVersion: string, runningVersion: string) {
	clear();

	console.log(figlet.textSync('Hallucigenia'));

	console.log(
		` v${runningVersion} ${npmVersion !== runningVersion ? chalk.bgWhite(chalk.blackBright(` update available `)) : ''}\n\n`
	);

	await RenderMenu(APP_STATE, REPOSITORIES);

	REPOSITORIES.SyncRepos();

	await view(npmVersion, runningVersion);
}

main();
