#!/usr/bin/env node
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
    `\n	found ~> ${chalk.bgGreen(` ${REPOSITORIES.GetRepos().length} repositories `)}\n\n`
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

    const o = ora('watching branches for changes...(ctrl+c to stop)').start();

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
        new Separator(
          '───────────────────────────────────────────────────────'
        ),
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
    console.log(chalk.bgCyanBright(` ADD REMOTE REPOSITORY CONNECTION \n`));

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

    const created_repo_id = REPOSITORIES.AttachRepository(
      {
        repository_access_token,
        repository_name,
        repository_workspace_name,
      },
      project_slug
    );

    APP_STATE.setMenu('check branches', created_repo_id);
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
        {
          name: '! sync branch list',
          value: 'check branches',
        },
        new Separator(
          '───────────────────────────────────────────────────────'
        ),
        {
          name: `Observable branches [${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf.observed_branches.length}/${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf.branches.length}]`,
          value: 'branches',
          description: 'List & select branches from repository to be observed',
        },

        {
          name: `Side Effects [${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf.observed_branches.filter((ob) => REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).scripts.includes(ob.branch_name)).length}/${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).conf.observed_branches.length}]`,
          value: 'side effects',
          description: 'instructions to run when branches get updated',
        },
        {
          name: 'Delete repository',
          value: 'delete repository',
        },
      ],
    });

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
        APP_STATE.getTargetRepositoryId()
      );
    }
  },
  branches: async () => {
    console.log(
      chalk.bgCyanBright(
        ` OBSERVABLE BRANCHES ~> [ ${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).repository_slug} ] \n`
      )
    );

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

    APP_STATE.setMenu('repository options', APP_STATE.getTargetRepositoryId());
  },
  'check repos': async () => {
    console.log(
      chalk.bgCyanBright(' CHECKING CONNECTION TO REMOTE REPOSITORIES \n')
    );

    const sync_animation_host = ora({
      text: `checking connection to ${REPOSITORIES.GetRepos().length} repositories`,
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
    const signal = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId());
    console.log(
      chalk.bgCyanBright(
        ` UPDATING BRANCH LIST ~> [ ${signal.repository_slug} ] \n`
      )
    );

    const sync_animation_branch = ora({
      text: `updating local branch list from remote "${signal.conf.repository_name}"`,
    }).start();

    try {
      const branches = await FetchRepositoryBranches({
        repository_access_token: signal.conf.repository_access_token,
        repository_workspace_name: signal.conf.repository_workspace_name,
        repository_name: signal.conf.repository_name,
      });

      REPOSITORIES.UpdateRepository(APP_STATE.getTargetRepositoryId(), {
        branches: branches.map((b) => ({
          branch_name: b.name,
          hash: b.target.hash,
        })),
      });
    } catch (err) {
      REPOSITORIES.UpdateRepository(APP_STATE.getTargetRepositoryId(), {
        branches: [],
      });
    }

    sync_animation_branch.succeed();

    await Sleep(2000);

    APP_STATE.setMenu('repository options', APP_STATE.getTargetRepositoryId());
  },
  'side effects': async () => {
    console.log(
      chalk.bgCyanBright(
        ` SIDE EFFECTS ~> [ ${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).repository_slug} ] \n`
      )
    );

    const answer = await select<menu | 'create script' | `branch_${string}`>({
      message: '',
      loop: false,
      choices: [
        {
          name: chalk.yellow('< go back'),
          value: 'repository options',
        },
        {
          name: chalk.blue('+ default script'), // se já existir um script mudar essa legenda
          value: 'create script',
          description:
            "This script will run for updated branches that don't have an specific one",
        },
        new Separator(
          '───────────────────────────────────────────────────────'
        ),
        ...REPOSITORIES.GetRepo(
          APP_STATE.getTargetRepositoryId()
        ).conf.observed_branches.map((branch) => ({
          name: `branch "${branch.branch_name}" [${REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId()).scripts.includes(branch.branch_name) ? chalk.green("script set") : chalk.red('script not set')}]`,
          value: `branch_${branch.branch_name}` as const,
        })),
      ],
    });

    if (answer === 'create script' || answer.startsWith('branch_')) {
      let script = await editor({
        message: '',
        waitForUseInput: false,
        default: `  -- 1- This script will run when ${answer.startsWith('branch_') ? `the branch "${answer.replace('branch_', '')}" gets updated` : 'ANY branch of the repository(without specific script) is updated'}
	-- 2- The path to the updated branch will be exposed as the variable "SOURCE_PATH" during this script execution
	-- 3- Make sure this script is compatible with the platform it will be executed
	-- 4- When you finish writing it, just save and close you editor to go back to Hallucigenia

	- - - - - - - - - - WRITE BELLOW THIS LINE, EVERYTHING ABOVE IT WILL BE DELETED - - - - - - - - - -`,
      });

      // remove the instructions
      script = script.split('\n').slice(6).join('\n');
      console.log(script);

      // save the script
      await Sleep(2000);
      return;
    }

    APP_STATE.setMenu(answer as menu, APP_STATE.getTargetRepositoryId());
    return;
  },
  quit: () => {
    clear();
    process.exit();
  },
};

main();
