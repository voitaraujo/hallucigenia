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
import { RepositoriesManager, Repository } from './repositories-manager-class';
import { menu } from './types';
import { Sleep } from './utils';
import { GetValidatorFunction } from './validators';

const APP_STATE = new HallucigeniaState();
const REPOSITORIES = new RepositoriesManager();

async function main() {
  // WatchRepositoryConfFiles(async (_) => {
  // REPOSITORIES.SyncRepos();
  // await view();
  // });

  REPOSITORIES.SyncRepos();
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
      (r) => r.GetRepositoryConf().remote_connection_status === 'ok'
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
            repository_access_token: r.GetRepositoryConf().repository_access_token,
            repository_name: r.GetRepositoryConf().repository_name,
            repository_workspace_name: r.GetRepositoryConf().repository_workspace_name,
          })
        )
      ).then((remote_branches_info) => {
        for (let idx = 0; idx < obsrv.length; idx++) {
          // eslint-disable-next-line
          const obs = obsrv.at(idx)!;

          // eslint-disable-next-line
          const res = remote_branches_info.at(idx)!;

          if (res.status === 'rejected') return;

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

    o.info(`detected changes on ${branches_to_clone.length} branches\n\n`);

    for (const to_clone of branches_to_clone) {
      const target_repo = REPOSITORIES.GetRepo(to_clone.repo_id);

      const anim = ora(
        `cloning branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}"`
      ).start();

      const success = await target_repo.CacheBranch(to_clone.branch_name)

      if (success) {
        target_repo.UpdateRepositoryConf({
          observed_branches: [
            ...target_repo.GetRepositoryConf().observed_branches.filter(
              (b) => b.branch_name !== to_clone.branch_name
            ),
            {
              branch_name: to_clone.branch_name,
              hash: to_clone.branch_hash,
            },
          ],
        });
        anim.text = `branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}" cloned successfully`;
        anim.succeed();
      } else {
        anim.text = `failed to clone branch "${to_clone.branch_name}" of "${target_repo.GetRepositoryConf().repository_name}"`;
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
        ...REPOSITORIES.GetRepos().map((repo) => {
          const conf = repo.GetRepositoryConf()

          return {
            name: `${repo.GetRepositorySlug()} ${conf.remote_connection_status === 'ok' ? chalk.green('(connected)') : chalk.red('(no connection)')}`,
            value: `id_${conf.repository_id}` as const,
          }
        }),
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
          REPOSITORIES.GetRepos().map(repo => repo.GetRepositoryConf())
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
    const repository_slug = await input({
      message: 'repository alias: ',
      default: repository_name,
      validate: (value) => {
        const v = GetValidatorFunction('bitbucket', 'slug');

        return v(value, REPOSITORIES.GetRepos().map(repo => repo.GetRepositorySlug()));
      },
    });

    Repository.AttachRepository(
      repository_slug,
      {
        repository_access_token,
        repository_name,
        repository_workspace_name,
      },
    );

    APP_STATE.setMenu('repositories', null);
  },
  'repository options': async () => {
    const target_repo = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId())

    console.log(
      chalk.bgCyanBright(
        ` DETAILS ~> [ ${target_repo.GetRepositorySlug()} ] \n`
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
          name: `Observable branches [${target_repo.GetRepositoryConf().observed_branches.length}/${target_repo.GetRepositoryConf().branches.length}]`,
          value: 'branches',
          description: 'List & select branches from repository to be observed',
        },

        {
          name: `Side Effects [${target_repo.GetRepositoryConf().observed_branches.filter((ob) => target_repo.GetRepositoryScriptList().includes(ob.branch_name)).length}/${target_repo.GetRepositoryConf().observed_branches.length}]`,
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
    const target_repo = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId())

    console.log(
      chalk.bgCyanBright(
        ` DELETE ~> [ ${target_repo.GetRepositorySlug()} ] \n`
      )
    );

    const id_delete_answer = await confirm({
      message:
        'Are you sure you want to delete this repository and all files related to it?',
      default: false,
    });

    if (id_delete_answer) {
      target_repo.DettachRepository()
      APP_STATE.setMenu('repositories', null);
      return
    }

    APP_STATE.setMenu(
      'repository options',
      APP_STATE.getTargetRepositoryId()
    );
  },
  branches: async () => {
    const target_repo = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId())
    const { branches: target_repo_branches, observed_branches: target_repo_observed_branches } = target_repo.GetRepositoryConf()

    console.log(
      chalk.bgCyanBright(
        ` OBSERVABLE BRANCHES ~> [ ${target_repo.GetRepositorySlug()} ] \n`
      )
    );

    const branches_already_selected = target_repo_branches.filter(
      (b) =>
        !!target_repo_observed_branches.find((bb) => bb.branch_name === b.branch_name)
    );

    const branches_not_selected = target_repo_branches.filter(
      (b) =>
        !target_repo_observed_branches.find((bb) => bb.branch_name === b.branch_name)
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

    target_repo.UpdateRepositoryConf(
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

    for (const repository of REPOSITORIES.GetRepos()) {
      const conf = repository.GetRepositoryConf()

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
          remote_connection_status: 'ko',
        });
      }
    }

    sync_animation_host.succeed();

    await Sleep(2000);

    APP_STATE.setMenu('repositories', null);
  },
  'check branches': async () => {
    const target_repo = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId());
    const target_repo_conf = target_repo.GetRepositoryConf()

    console.log(
      chalk.bgCyanBright(
        ` UPDATING BRANCH LIST ~> [ ${target_repo.GetRepositorySlug()} ] \n`
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
      });
    }

    sync_animation_branch.succeed();

    await Sleep(2000);

    APP_STATE.setMenu('repository options', APP_STATE.getTargetRepositoryId());
  },
  'side effects': async () => {
    const target_repo = REPOSITORIES.GetRepo(APP_STATE.getTargetRepositoryId())
    const target_repo_conf = target_repo.GetRepositoryConf()
    const target_repo_script_list = target_repo.GetRepositoryScriptList()

    console.log(
      chalk.bgCyanBright(
        ` SIDE EFFECTS ~> [ ${target_repo.GetRepositorySlug()} ] \n`
      )
    );

    const answer = await select<menu | 'default script' | `branch_${string}`>({
      message: '',
      loop: false,
      choices: [
        {
          name: chalk.yellow('< go back'),
          value: 'repository options',
        },
        {
          name: `default script [${target_repo_script_list.includes(target_repo_conf.repository_name) ? chalk.green("set") : chalk.red('not set')}]`, // se já existir um script mudar essa legenda
          value: 'default script',
          description:
            "This script will run for updated branches that don't have an specific one",
        },
        new Separator(
          '───────────────────────────────────────────────────────'
        ),
        ...target_repo_conf.observed_branches.map((branch) => ({
          name: `branch "${branch.branch_name}" script [${target_repo_script_list.includes(branch.branch_name) ? chalk.green("set") : chalk.red('not set')}]`,
          value: `branch_${branch.branch_name}` as const,
        })),
      ],
    });

    if (answer.startsWith('branch_') || answer === 'default script') {
      const b_name = answer.replace('branch_', '').replace('default script', target_repo_conf.repository_name)
      const saved_script_content = target_repo.GetRepositoryScriptContent(b_name)


      const script = await editor({
        message: '',
        waitForUseInput: false,
        default: saved_script_content || '',
      });

      switch (true) {
        case script.trim().length === 0 && typeof saved_script_content === 'string':
          // delete existing script
          target_repo.DeleteRepositoryScript(b_name)
          break;
        case script.trim().length !== 0 && typeof saved_script_content === 'string':
          // update existing script
          target_repo.UpdateRepositoryScript(b_name, script)
          break
        case script.trim().length !== 0 && typeof saved_script_content === 'undefined':
          // create new script
          target_repo.CreateRepositoryScript(b_name, script)
          break
        default:
          break;
      }
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
